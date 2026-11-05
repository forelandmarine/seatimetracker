import { describe, test, expect } from "bun:test";
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from "jose";
import {
  googleClientIds,
  verifyGoogleIdToken,
  planGoogleSignIn,
  socialOnlyHint,
  GoogleTokenError,
} from "../src/utils/googleSignIn";

const WEB = "733279083565-web.apps.googleusercontent.com";
const OTHER = "999-other.apps.googleusercontent.com";

// A local key pair standing in for Google's signing keys.
async function keys() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  return { privateKey, jwks: createLocalJWKSet({ keys: [jwk] }) };
}

async function token(privateKey: CryptoKey, claims: Record<string, unknown> = {}, opts: { iss?: string; aud?: string; exp?: string } = {}) {
  return new SignJWT({ email: "Crew@Example.com", email_verified: true, name: "Sam Crew", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setSubject("1234567890")
    .setIssuer(opts.iss ?? "https://accounts.google.com")
    .setAudience(opts.aud ?? WEB)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(privateKey);
}

describe("client IDs", () => {
  test("unset means Google sign-in is off", () => {
    expect(googleClientIds({})).toEqual([]);
    expect(googleClientIds({ GOOGLE_CLIENT_IDS: "" })).toEqual([]);
  });
  test("comma separated, trimmed, junk dropped", () => {
    expect(googleClientIds({ GOOGLE_CLIENT_IDS: ` ${WEB} , not-a-client-id,${OTHER}` })).toEqual([WEB, OTHER]);
  });
});

describe("token verification", () => {
  test("a good token gives the identity, email lower-cased", async () => {
    const { privateKey, jwks } = await keys();
    const id = await verifyGoogleIdToken(await token(privateKey), [WEB], jwks);
    expect(id).toEqual({ googleUserId: "1234567890", email: "crew@example.com", emailVerified: true, name: "Sam Crew", picture: null });
  });

  test("the short issuer form is accepted", async () => {
    const { privateKey, jwks } = await keys();
    const id = await verifyGoogleIdToken(await token(privateKey, {}, { iss: "accounts.google.com" }), [WEB], jwks);
    expect(id.googleUserId).toBe("1234567890");
  });

  test("any of several client IDs is accepted as audience", async () => {
    const { privateKey, jwks } = await keys();
    const id = await verifyGoogleIdToken(await token(privateKey, {}, { aud: OTHER }), [WEB, OTHER], jwks);
    expect(id.googleUserId).toBe("1234567890");
  });

  test("name falls back to given + family name", async () => {
    const { privateKey, jwks } = await keys();
    const id = await verifyGoogleIdToken(await token(privateKey, { name: undefined, given_name: "Sam", family_name: "Crew" }), [WEB], jwks);
    expect(id.name).toBe("Sam Crew");
  });

  test("email_verified as a string still counts", async () => {
    const { privateKey, jwks } = await keys();
    const id = await verifyGoogleIdToken(await token(privateKey, { email_verified: "true" }), [WEB], jwks);
    expect(id.emailVerified).toBe(true);
  });

  const rejects = async (p: Promise<unknown>) => {
    let err: unknown = null;
    try { await p; } catch (e) { err = e; }
    expect(err instanceof GoogleTokenError).toBe(true);
    return err as GoogleTokenError;
  };

  test("wrong audience is rejected (a token minted for another app)", async () => {
    const { privateKey, jwks } = await keys();
    await rejects(verifyGoogleIdToken(await token(privateKey, {}, { aud: OTHER }), [WEB], jwks));
  });

  test("wrong issuer is rejected", async () => {
    const { privateKey, jwks } = await keys();
    await rejects(verifyGoogleIdToken(await token(privateKey, {}, { iss: "https://evil.example.com" }), [WEB], jwks));
  });

  test("expired token is rejected", async () => {
    const { privateKey, jwks } = await keys();
    await rejects(verifyGoogleIdToken(await token(privateKey, {}, { exp: "-1m" }), [WEB], jwks));
  });

  test("a token signed by another key is rejected", async () => {
    const signer = await keys();
    const verifier = await keys();
    await rejects(verifyGoogleIdToken(await token(signer.privateKey), [WEB], verifier.jwks));
  });

  test("garbage and missing config are rejected before any network call", async () => {
    const { jwks } = await keys();
    expect((await rejects(verifyGoogleIdToken("not-a-jwt", [WEB], jwks))).message).toBe("Invalid token format");
    expect((await rejects(verifyGoogleIdToken("a.b.c", [], jwks))).message).toBe("Google sign-in is not configured");
  });
});

describe("account plan", () => {
  const verified = { email: "crew@example.com", emailVerified: true };

  test("a known Google ID signs that user in, whatever the email now says", () => {
    expect(planGoogleSignIn({ email: null, emailVerified: false }, { googleAccountUserId: "u1", userIdByEmail: null }))
      .toEqual({ action: "sign-in", userId: "u1" });
  });

  test("verified email matching an existing (e.g. email-password) user links to it", () => {
    expect(planGoogleSignIn(verified, { googleAccountUserId: null, userIdByEmail: "u2" })).toEqual({ action: "link", userId: "u2" });
  });

  test("verified new email creates an account", () => {
    expect(planGoogleSignIn(verified, { googleAccountUserId: null, userIdByEmail: null }))
      .toEqual({ action: "create", email: "crew@example.com" });
  });

  test("unverified email never links to an existing account", () => {
    const plan = planGoogleSignIn({ ...verified, emailVerified: false }, { googleAccountUserId: null, userIdByEmail: "u2" });
    expect(plan.action).toBe("reject");
    if (plan.action === "reject") expect(plan.error).toContain("email and password");
  });

  test("unverified email does not create an account either", () => {
    expect(planGoogleSignIn({ ...verified, emailVerified: false }, { googleAccountUserId: null, userIdByEmail: null }).action).toBe("reject");
  });

  test("no email is refused", () => {
    const plan = planGoogleSignIn({ email: null, emailVerified: true }, { googleAccountUserId: null, userIdByEmail: null });
    expect(plan).toMatchObject({ action: "reject", status: 400 });
  });
});

describe("email sign-in hints for social-only accounts", () => {
  test("Apple wording is unchanged", () => {
    expect(socialOnlyHint(["apple"])).toBe("This email is linked to an Apple account. Please sign in with Apple instead.");
  });
  test("Google and both", () => {
    expect(socialOnlyHint(["google"])).toContain("continue with Google");
    expect(socialOnlyHint(["apple", "google"])).toContain("Apple or Google");
  });
  test("nothing for other providers", () => {
    expect(socialOnlyHint([])).toBeNull();
    expect(socialOnlyHint(["github"])).toBeNull();
  });
});
