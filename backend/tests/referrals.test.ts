import { describe, test, expect } from "bun:test";
import { canRedeem, hasPaid, planFreeMonth, referralsEnabled, FREE_MONTH_DAYS } from "../src/utils/referrals";

const now = new Date("2026-11-01T12:00:00Z");
const future = "2026-11-20T12:00:00Z";
const past = "2026-10-01T12:00:00Z";
const DAY = 86_400_000;

const sub = (extra: Record<string, unknown>) => ({ expires_date: future, period_type: "normal", store: "app_store", store_transaction_id: "2000001", ...extra });

describe("hasPaid", () => {
  test("a trial that never converted is not a payment", () => {
    expect(hasPaid({ subscriptions: { annual: sub({ period_type: "trial" }) } })).toBe(false);
  });
  test("a normal store period is a payment, even once expired", () => {
    expect(hasPaid({ subscriptions: { annual: sub({ expires_date: past }) } })).toBe(true);
  });
  test("promotional time, refunds and sandbox are not payments", () => {
    expect(hasPaid({ subscriptions: { rc_promo_pro_monthly: sub({ store: "promotional" }) } })).toBe(false);
    expect(hasPaid({ subscriptions: { annual: sub({ refunded_at: past }) } })).toBe(false);
    expect(hasPaid({ subscriptions: { annual: sub({ is_sandbox: true }) } })).toBe(false);
    expect(hasPaid({ subscriptions: { annual: sub({ is_sandbox: true }) } }, true)).toBe(true);
  });
});

describe("planFreeMonth", () => {
  test("a paying App Store subscriber gets their renewal pushed back", () => {
    expect(planFreeMonth({ subscriptions: { annual: sub({}) } }, now)).toEqual({ kind: "apple_extend", transactionId: "2000001" });
  });
  test("a paying Play subscriber is deferred by subscription id, without the base plan", () => {
    const p = planFreeMonth({ subscriptions: { "seatime_monthly:monthly-base": sub({ store: "play_store" }) } }, now);
    expect(p).toEqual({ kind: "play_defer", subscriptionId: "seatime_monthly" });
  });
  test("waits while in a free trial or with a billing issue", () => {
    expect(planFreeMonth({ subscriptions: { annual: sub({ period_type: "trial" }) } }, now)).toEqual({ kind: "wait", reason: "in_free_trial" });
    expect(planFreeMonth({ subscriptions: { annual: sub({ billing_issues_detected_at: past }) } }, now)).toEqual({ kind: "wait", reason: "billing_issue" });
  });
  test("no live store subscription: 30 days of promotional access from now", () => {
    const p = planFreeMonth({ subscriptions: { annual: sub({ expires_date: past }) } }, now);
    expect(p).toEqual({ kind: "promo", endTimeMs: now.getTime() + FREE_MONTH_DAYS * DAY });
  });
  test("promotional time stacks after promotional time already held", () => {
    const p = planFreeMonth({
      subscriptions: { rc_promo_pro_monthly: sub({ store: "promotional" }) },
      entitlements: { pro: { expires_date: future, product_identifier: "rc_promo_pro_monthly" } },
    }, now);
    expect(p).toEqual({ kind: "promo", endTimeMs: Date.parse(future) + FREE_MONTH_DAYS * DAY });
  });
});

describe("canRedeem", () => {
  test("only in the first 14 days after signing up", () => {
    expect(canRedeem(new Date(now.getTime() - 13 * DAY), now)).toBe(true);
    expect(canRedeem(new Date(now.getTime() - 15 * DAY), now)).toBe(false);
  });
});

describe("referralsEnabled", () => {
  test("off unless REFERRALS=on", () => {
    expect(referralsEnabled({})).toBe(false);
    expect(referralsEnabled({ REFERRALS: "off" })).toBe(false);
    expect(referralsEnabled({ REFERRALS: "ON" })).toBe(true);
  });
});
