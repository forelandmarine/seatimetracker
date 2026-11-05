import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

// Google sign-in. The app gets an ID token from the native Google sign-in sheet
// (requested for the web client ID) and posts it to /api/auth/sign-in/google.
// Nothing here runs until GOOGLE_CLIENT_IDS is set on the backend.

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/**
 * Client IDs whose ID tokens we accept (the token's `aud`). Comma separated:
 * the web client ID (used by Android) plus an iOS client ID if iOS is added later.
 */
export function googleClientIds(env: Record<string, string | undefined> = process.env): string[] {
  return (env.GOOGLE_CLIENT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.endsWith(".apps.googleusercontent.com"));
}

export interface GoogleIdentity {
  /** Google's stable user ID (`sub`). */
  googleUserId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

export class GoogleTokenError extends Error {}

/** Verify a Google ID token's signature, issuer, audience and expiry. */
export async function verifyGoogleIdToken(
  idToken: string,
  clientIds: string[],
  jwks: JWTVerifyGetKey = GOOGLE_JWKS,
): Promise<GoogleIdentity> {
  if (!idToken || typeof idToken !== "string" || idToken.split(".").length !== 3) {
    throw new GoogleTokenError("Invalid token format");
  }
  if (clientIds.length === 0) throw new GoogleTokenError("Google sign-in is not configured");

  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(idToken, jwks, { issuer: GOOGLE_ISSUERS, audience: clientIds }));
  } catch (err: any) {
    throw new GoogleTokenError(`Google token rejected: ${err?.code || err?.message || "unknown"}`);
  }

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) throw new GoogleTokenError("Token missing user identifier");

  const email = typeof payload.email === "string" && payload.email.trim() ? payload.email.trim().toLowerCase() : null;
  const name = typeof payload.name === "string" && payload.name.trim()
    ? payload.name.trim()
    : [payload.given_name, payload.family_name].filter((p) => typeof p === "string" && p).join(" ") || null;

  return {
    googleUserId: sub,
    email,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    name,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}

export type GoogleSignInPlan =
  | { action: "sign-in"; userId: string }
  | { action: "link"; userId: string }
  | { action: "create"; email: string }
  | { action: "reject"; status: 400 | 401; error: string };

/**
 * Decide what a verified Google identity does, given what is already in the DB:
 * - a Google account row for this `sub` signs that user in;
 * - otherwise a user with the same email gets Google linked, but only when Google
 *   says the email is verified (the same rule as Apple), so an email-password user
 *   who taps Continue with Google lands in their existing account;
 * - otherwise a new account is created. Google always sends an email for the
 *   `email` scope, so an unverified or missing one is refused rather than guessed.
 */
export function planGoogleSignIn(
  identity: Pick<GoogleIdentity, "email" | "emailVerified">,
  existing: { googleAccountUserId: string | null; userIdByEmail: string | null },
): GoogleSignInPlan {
  if (existing.googleAccountUserId) return { action: "sign-in", userId: existing.googleAccountUserId };
  if (!identity.email) {
    return { action: "reject", status: 400, error: "Google did not share an email address. Please try again or use email and password." };
  }
  if (!identity.emailVerified) {
    return {
      action: "reject",
      status: 401,
      error: existing.userIdByEmail
        ? "This Google email is not verified, so we can't link it to your account. Please sign in with your email and password."
        : "This Google email is not verified. Please verify it with Google or sign up with email and password.",
    };
  }
  if (existing.userIdByEmail) return { action: "link", userId: existing.userIdByEmail };
  return { action: "create", email: identity.email };
}

/** Friendly hint for email sign-in / sign-up when the account only has social logins. */
export function socialOnlyHint(providers: string[]): string | null {
  if (providers.includes("apple") && providers.includes("google")) {
    return "This email is linked to Apple and Google sign-in. Please continue with Apple or Google instead.";
  }
  if (providers.includes("apple")) return "This email is linked to an Apple account. Please sign in with Apple instead.";
  if (providers.includes("google")) return "This email is linked to a Google account. Please continue with Google instead.";
  return null;
}
