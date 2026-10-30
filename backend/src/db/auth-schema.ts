import { pgTable, text, timestamp, boolean, date, integer } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  address: text("address"), // User's full address
  tel_no: text("tel_no"), // Telephone number
  date_of_birth: date("date_of_birth"), // Date of birth (YYYY-MM-DD format)
  srb_no: text("srb_no"), // Seafarers Registration Book number
  nationality: text("nationality"), // User's nationality
  pya_membership_no: text("pya_membership_no"), // PYA membership number
  department: text("department"), // Department: 'deck' or 'engineering'
  maritime_authority: text("maritime_authority"), // 'mca', 'uscg', 'amsa', 'mnz' — which authority user is applying to
  target_certification: text("target_certification"), // requirement id the user is working toward, e.g. 'uscg-master-nc-200grt'
  has_record_book: boolean("has_record_book").default(false), // holds an AMSA task book / MNZ training record book, which shortens the sea service required
  vessel_sector: text("vessel_sector"), // 'yachting' | 'commercial' — user-chosen sector. null = not yet chosen (treated as yachting). Changeable any time; does not retro-affect existing entries.
  // On/off board toggle for rotational crew and leave. While off board, AIS passages on the
  // user's vessel are stored with status 'off_board' (hidden) instead of 'pending'.
  on_board: boolean("on_board").default(true).notNull(),
  off_board_since: timestamp("off_board_since", { withTimezone: true }), // when the user last switched off board
  expected_return_date: date("expected_return_date"), // optional date the user expects to rejoin (YYYY-MM-DD)
  underway_alert_sent_at: timestamp("underway_alert_sent_at", { withTimezone: true }), // last "vessel is underway" push while off board
  // Marketing email consent (PECR/UK GDPR). Off unless the user opts in. A null
  // marketing_consent_at means the user has never been asked.
  marketing_consent: boolean("marketing_consent").default(false).notNull(),
  marketing_consent_at: timestamp("marketing_consent_at", { withTimezone: true }), // when the user last answered
  marketing_consent_source: text("marketing_consent_source"), // 'signup' | 'prompt' | 'settings' | 'unsubscribe'
  day3_email_sent_at: timestamp("day3_email_sent_at", { withTimezone: true }), // day-3 drip email claimed/sent
  day7_email_sent_at: timestamp("day7_email_sent_at", { withTimezone: true }), // day-7 drip email claimed/sent (marketing, opt-in only)
  subscription_status: text("subscription_status").default("inactive"), // 'active', 'inactive', 'trial', or 'expired'
  subscription_expires_at: timestamp("subscription_expires_at", { withTimezone: true }), // When subscription expires
  subscription_product_id: text("subscription_product_id"), // iOS App Store product ID
  revenuecat_customer_id: text("revenuecat_customer_id"), // RevenueCat customer ID for sync
  subscription_platform: text("subscription_platform"), // 'ios', 'android', 'web', or null for legacy
  trial_ends_at: timestamp("trial_ends_at", { withTimezone: true }), // When trial period ends
  // Sprint 6: referral, public profile, Lightship CTA tracking, signature
  referral_code: text("referral_code").unique(),
  referred_by_user_id: text("referred_by_user_id"),
  referral_count: integer("referral_count").default(0),
  public_slug: text("public_slug").unique(),
  public_profile_enabled: boolean("public_profile_enabled").default(false),
  lightship_interested_at: timestamp("lightship_interested_at", { withTimezone: true }),
  signature_image: text("signature_image"), // base64 PNG data URL of user's signature
  bonus_days: integer("bonus_days").default(0), // Free days earned from referrals etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});
