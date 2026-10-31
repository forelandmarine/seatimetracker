import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

// One row per redeemed referral code. Both people get a free month once the
// friend makes their first payment (services/referrals.ts). Reward status per
// side: 'waiting_payment' (friend has not paid yet), 'pending' (due, but the
// store state does not allow it yet, e.g. still in a free trial), 'granted',
// 'failed' (retried), 'capped' (referrer over the yearly limit) or 'skipped'
// (account gone). See manual migration 20261031130000_referrals.sql.
export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  referrer_user_id: text('referrer_user_id').notNull(),
  referred_user_id: text('referred_user_id').notNull(),
  code: text('code').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  friend_paid_at: timestamp('friend_paid_at', { withTimezone: true }), // first paid store period seen on RevenueCat
  friend_reward_status: text('friend_reward_status').notNull().default('waiting_payment'),
  friend_reward_detail: text('friend_reward_detail'), // how it was given (apple_extend / play_defer / promo) or the last error
  friend_rewarded_at: timestamp('friend_rewarded_at', { withTimezone: true }),
  referrer_reward_status: text('referrer_reward_status').notNull().default('waiting_payment'),
  referrer_reward_detail: text('referrer_reward_detail'),
  referrer_rewarded_at: timestamp('referrer_rewarded_at', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0), // failed grant attempts, both sides
  last_checked_at: timestamp('last_checked_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('referrals_referred_user_uq').on(table.referred_user_id),
  index('referrals_referrer_idx').on(table.referrer_user_id),
]);
