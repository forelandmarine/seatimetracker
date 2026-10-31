/**
 * Referral rewards against RevenueCat. The decisions live in utils/referrals.ts;
 * this file reads customers, makes the grants and records what happened.
 *
 * A referral is checked when RevenueCat tells us the friend bought or renewed
 * (webhook), when the friend's app syncs its subscription, and by a sweep in
 * the scheduler, so a missed webhook only delays the reward.
 *
 * Each side is claimed in the database ('granting') before RevenueCat is
 * called, so the webhook, a sync and the sweep can't give the same month twice.
 */
import { Resend } from 'resend';
import { and, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import * as authSchema from '../db/auth-schema.js';
import type { App } from '../index.js';
import {
  FREE_MONTH_DAYS,
  MAX_GRANT_ATTEMPTS,
  REFERRER_MAX_MONTHS_PER_YEAR,
  hasPaid,
  planFreeMonth,
  type RcSubscriber,
} from '../utils/referrals.js';

const RC_BASE = 'https://api.revenuecat.com/v1';
const ENTITLEMENT_ID = process.env.REVENUECAT_ENTITLEMENT_ID || 'pro';
// Sandbox purchases only count when testing against a non-production backend.
const ALLOW_SANDBOX = process.env.REFERRAL_ALLOW_SANDBOX === 'true';
const SWEEP_EVERY_MS = 10 * 60 * 1000;
const RECHECK_AFTER_MS = 6 * 60 * 60 * 1000;
// Stop looking for a first payment a little over a year after the code was used.
const GIVE_UP_AFTER_DAYS = 400;
const DONE = ['granted', 'capped', 'skipped'];
const OPEN = ['waiting_payment', 'pending', 'failed'];

type Side = 'friend' | 'referrer';
type Referral = typeof schema.referrals.$inferSelect;

let lastSweep = 0;

async function rc(path: string, init: { method?: string; body?: unknown } = {}) {
  const key = process.env.REVENUECAT_API_KEY || '';
  if (!key) throw new Error('REVENUECAT_API_KEY not configured');
  const res = await fetch(RC_BASE + path, {
    method: init.method || 'GET',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(`RevenueCat ${res.status}: ${body?.message || body?.code || 'error'}`);
  return body;
}

export async function getSubscriber(userId: string): Promise<RcSubscriber> {
  const body = await rc(`/subscribers/${encodeURIComponent(userId)}`);
  return (body?.subscriber ?? {}) as RcSubscriber;
}

/** Whether the user has ever paid for a store subscription (false if RevenueCat can't say). */
export async function userHasPaid(userId: string): Promise<boolean | null> {
  try {
    return hasPaid(await getSubscriber(userId), ALLOW_SANDBOX);
  } catch {
    return null;
  }
}

/**
 * Give one person a free month. Returns the status to record: 'granted' with
 * how it was done, 'pending' when it has to wait (free trial, billing issue).
 * Throws when RevenueCat refuses, so the caller records a failure.
 */
async function giveFreeMonth(app: App, userId: string): Promise<{ status: 'granted' | 'pending'; detail: string }> {
  const plan = planFreeMonth(await getSubscriber(userId), new Date(), ALLOW_SANDBOX, ENTITLEMENT_ID);
  const id = encodeURIComponent(userId);
  switch (plan.kind) {
    case 'wait':
      return { status: 'pending', detail: plan.reason };
    case 'apple_extend':
      // Reason 1 = Customer Satisfaction. Apple emails the customer about it.
      await rc(`/subscribers/${id}/subscriptions/${encodeURIComponent(plan.transactionId)}/extend`, {
        method: 'POST',
        body: { extend_by_days: FREE_MONTH_DAYS, extend_reason_code: 1 },
      });
      return { status: 'granted', detail: 'apple_extend' };
    case 'play_defer':
      await rc(`/subscribers/${id}/subscriptions/${encodeURIComponent(plan.subscriptionId)}/defer`, {
        method: 'POST',
        body: { extend_by_days: FREE_MONTH_DAYS },
      });
      return { status: 'granted', detail: 'play_defer' };
    case 'promo': {
      await rc(`/subscribers/${id}/entitlements/${encodeURIComponent(ENTITLEMENT_ID)}/promotional`, {
        method: 'POST',
        body: { end_time_ms: plan.endTimeMs },
      });
      // Unlock the backend straight away instead of waiting for the app to sync.
      await app.db
        .update(authSchema.user)
        .set({ subscription_status: 'active', subscription_expires_at: new Date(plan.endTimeMs), updatedAt: new Date() })
        .where(eq(authSchema.user.id, userId));
      return { status: 'granted', detail: 'promo' };
    }
  }
}

/** Claim one side of a referral, give the month and record the result. */
async function rewardSide(app: App, ref: Referral, side: Side): Promise<void> {
  const statusCol = side === 'friend' ? schema.referrals.friend_reward_status : schema.referrals.referrer_reward_status;
  const userId = side === 'friend' ? ref.referred_user_id : ref.referrer_user_id;
  const set = (status: string, detail: string | null, granted = false) =>
    side === 'friend'
      ? { friend_reward_status: status, friend_reward_detail: detail, ...(granted ? { friend_rewarded_at: new Date() } : {}) }
      : { referrer_reward_status: status, referrer_reward_detail: detail, ...(granted ? { referrer_rewarded_at: new Date() } : {}) };

  const [user] = await app.db.select({ id: authSchema.user.id, email: authSchema.user.email, name: authSchema.user.name })
    .from(authSchema.user).where(eq(authSchema.user.id, userId));
  if (!user) {
    await app.db.update(schema.referrals).set(set('skipped', 'account_deleted')).where(eq(schema.referrals.id, ref.id));
    return;
  }

  if (side === 'referrer') {
    const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const [{ n }] = await app.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.referrals)
      .where(and(
        eq(schema.referrals.referrer_user_id, userId),
        eq(schema.referrals.referrer_reward_status, 'granted'),
        gte(schema.referrals.referrer_rewarded_at, since),
      ));
    if (n >= REFERRER_MAX_MONTHS_PER_YEAR) {
      await app.db.update(schema.referrals).set(set('capped', `${n} months in the last year`)).where(eq(schema.referrals.id, ref.id));
      return;
    }
  }

  const claimed = await app.db
    .update(schema.referrals)
    .set(set('granting', null))
    .where(and(eq(schema.referrals.id, ref.id), inArray(statusCol, OPEN)))
    .returning({ id: schema.referrals.id });
  if (!claimed.length) return;

  try {
    const result = await giveFreeMonth(app, userId);
    await app.db.update(schema.referrals)
      .set(set(result.status, result.detail, result.status === 'granted'))
      .where(eq(schema.referrals.id, ref.id));
    app.logger.info({ referralId: ref.id, side, userId, ...result }, 'Referral reward processed');
    if (result.status === 'granted') await sendRewardEmail(app, user, side, result.detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await app.db.update(schema.referrals)
      .set({ ...set('failed', message.slice(0, 500)), attempts: sql`${schema.referrals.attempts} + 1` })
      .where(eq(schema.referrals.id, ref.id));
    app.logger.warn({ referralId: ref.id, side, userId, err: message }, 'Referral reward failed, will retry');
  }
}

/** Check one referral: has the friend paid yet, and if so reward whoever is still owed. */
async function processReferral(app: App, ref: Referral): Promise<void> {
  await app.db.update(schema.referrals).set({ last_checked_at: new Date() }).where(eq(schema.referrals.id, ref.id));
  let current = ref;
  if (!current.friend_paid_at) {
    const paid = hasPaid(await getSubscriber(ref.referred_user_id), ALLOW_SANDBOX);
    if (!paid) return;
    const [updated] = await app.db.update(schema.referrals)
      .set({ friend_paid_at: new Date() })
      .where(and(eq(schema.referrals.id, ref.id), isNull(schema.referrals.friend_paid_at)))
      .returning();
    if (updated) current = updated;
    app.logger.info({ referralId: ref.id, friend: ref.referred_user_id }, 'Referred friend made their first payment');
  }
  if (current.attempts >= MAX_GRANT_ATTEMPTS) return;
  if (!DONE.includes(current.friend_reward_status)) await rewardSide(app, current, 'friend');
  if (!DONE.includes(current.referrer_reward_status)) await rewardSide(app, current, 'referrer');
}

/** Called from the RevenueCat webhook and subscription sync for a user who may be a referred friend. */
export async function checkReferralFor(app: App, referredUserId: string): Promise<void> {
  try {
    const [ref] = await app.db.select().from(schema.referrals).where(eq(schema.referrals.referred_user_id, referredUserId));
    if (!ref) return;
    if (DONE.includes(ref.friend_reward_status) && DONE.includes(ref.referrer_reward_status)) return;
    await processReferral(app, ref);
  } catch (err) {
    app.logger.warn({ err, referredUserId }, 'Referral check failed');
  }
}

/** Scheduler sweep: every 10 minutes, look again at referrals not checked for 6 hours. */
export async function processReferrals(app: App): Promise<void> {
  if (Date.now() - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = Date.now();
  const recheckBefore = new Date(Date.now() - RECHECK_AFTER_MS);
  const notBefore = new Date(Date.now() - GIVE_UP_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const due = await app.db.select().from(schema.referrals).where(and(
    gte(schema.referrals.created_at, notBefore),
    lt(schema.referrals.attempts, MAX_GRANT_ATTEMPTS),
    or(isNull(schema.referrals.last_checked_at), lt(schema.referrals.last_checked_at, recheckBefore)),
    or(inArray(schema.referrals.friend_reward_status, OPEN), inArray(schema.referrals.referrer_reward_status, OPEN)),
  )).limit(25);
  for (const ref of due) {
    try {
      await processReferral(app, ref);
    } catch (err) {
      app.logger.warn({ err, referralId: ref.id }, 'Referral sweep item failed');
    }
  }
}

async function sendRewardEmail(app: App, user: { email: string; name: string }, side: Side, how: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const firstName = (user.name || '').split(' ')[0] || 'there';
  const reason = side === 'friend'
    ? 'Thanks for joining SeaTime Tracker through a friend\'s invite.'
    : 'A friend you invited to SeaTime Tracker has subscribed.';
  const where = how === 'promo'
    ? 'Your free month has been added to your account. Open the app to start using it.'
    : how === 'apple_extend'
      ? 'Your next App Store renewal has been pushed back by 30 days. Apple will also email you to confirm.'
      : 'Your next Google Play billing date has been pushed back by 30 days.';
  const text = `Hi ${firstName},\n\n${reason} As a thank you, you have a free month of SeaTime Tracker.\n\n${where}\n\nInvite more friends from Settings > Refer a friend. Each one who subscribes earns you both another free month.\n\nFair winds,\nThe SeaTime Tracker team`;
  try {
    const resend = new Resend(key);
    await resend.emails.send({
      from: process.env.FROM_EMAIL || 'SeaTime Tracker <noreply@forelandmarine.com>',
      to: user.email,
      subject: 'You have earned a free month of SeaTime Tracker',
      text,
      html: text.split('\n\n').map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join(''),
    });
  } catch (err) {
    app.logger.warn({ err, side }, 'Referral reward email failed');
  }
}
