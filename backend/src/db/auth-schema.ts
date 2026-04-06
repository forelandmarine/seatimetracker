import { pgTable, text, timestamp, boolean, date } from "drizzle-orm/pg-core";

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
  subscription_status: text("subscription_status").default("inactive"), // 'active', 'inactive', 'trial', or 'expired'
  subscription_expires_at: timestamp("subscription_expires_at", { withTimezone: true }), // When subscription expires
  subscription_product_id: text("subscription_product_id"), // iOS App Store product ID
  revenuecat_customer_id: text("revenuecat_customer_id"), // RevenueCat customer ID for sync
  subscription_platform: text("subscription_platform"), // 'ios', 'android', 'web', or null for legacy
  trial_ends_at: timestamp("trial_ends_at", { withTimezone: true }), // When trial period ends
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
