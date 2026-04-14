import type { FastifyInstance } from "fastify";
import { eq, and, lt } from "drizzle-orm";
import * as authSchema from "../db/auth-schema.js";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";
import crypto from "crypto";
import { Resend } from "resend";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ensureUserNotificationSchedule } from "./notifications.js";
import { upsertHubspotContact } from "../utils/hubspot.js";
import { sendWelcomeEmail } from "../utils/welcomeEmail.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";

/**
 * Hash password using PBKDF2 with SHA-256
 */
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 100000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha256').toString('hex');
  return `${salt}:${iterations}:${hash}`;
}

/**
 * Verify password against hash
 */
function verifyPassword(password: string, hash: string): boolean {
  try {
    const [salt, iterationsStr, storedHash] = hash.split(':');
    if (!salt || !iterationsStr || !storedHash) {
      return false;
    }
    const iterations = parseInt(iterationsStr);
    const computedHash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha256').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch (error) {
    return false;
  }
}

/**
 * Simple in-memory rate limiter for auth endpoints.
 * Limits by IP address with a sliding window.
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxAttempts: number, windowMs: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1 };
  }

  entry.count++;
  if (entry.count > maxAttempts) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: maxAttempts - entry.count };
}

// Prune stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key);
  }
}, 5 * 60 * 1000);

// Apple JWKS for verifying identity tokens
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const APPLE_ISSUER = 'https://appleid.apple.com';

export function register(app: App, fastify: FastifyInstance) {
  // POST /api/auth/sign-up/email - Register with email and password
  fastify.post<{ Body: { email: string; password: string; name: string } }>(
    '/api/auth/sign-up/email',
    {
      schema: {
        description: 'Register a new user with email and password',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['email', 'password', 'name'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            name: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  name: { type: 'string' },
                  emailVerified: { type: 'boolean' },
                  image: { type: ['string', 'null'] },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                },
              },
              session: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  token: { type: 'string' },
                  expiresAt: { type: 'string' },
                },
              },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' }, detail: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { email, password, name } = request.body;
      const clientIp = request.ip || 'unknown';

      // Rate limit: 5 sign-ups per IP per 15 minutes
      const signUpLimit = checkRateLimit(`signup:${clientIp}`, 5, 15 * 60 * 1000);
      if (!signUpLimit.allowed) {
        app.logger.warn({ ip: clientIp, email }, 'Sign-up rate limit exceeded');
        return reply.code(429).send({ error: 'Too many sign-up attempts. Please try again later.' });
      }

      app.logger.info({ email, name }, 'User registration attempt');

      try {
        // Check if user already exists
        const existingUsers = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.email, email));

        if (existingUsers.length > 0) {
          app.logger.warn({ email }, 'Registration failed: email already exists');

          // Check what accounts exist for this user
          const existingUser = existingUsers[0];
          const existingAccounts = await app.db
            .select()
            .from(authSchema.account)
            .where(eq(authSchema.account.userId, existingUser.id));

          // Check if they have a credential (email/password) account
          const hasCredentialAccount = existingAccounts.some(acc => acc.providerId === 'credential');

          if (hasCredentialAccount) {
            // They have an email/password account
            return reply.code(409).send({
              error: 'An account with this email already exists. Please sign in instead.',
            });
          } else if (existingAccounts.some(acc => acc.providerId === 'apple')) {
            // They only have an Apple account
            return reply.code(409).send({
              error: 'This email is linked to an Apple account. Please sign in with Apple instead.',
            });
          } else {
            // They have other social accounts
            const providers = existingAccounts.map(acc => acc.providerId).join(', ');
            return reply.code(409).send({
              error: `An account with this email already exists linked to ${providers}. Please sign in instead.`,
            });
          }
        }

        // Create user with inactive subscription — trial starts through
        // RevenueCat / App Store on the paywall screen.
        const userId = crypto.randomUUID();
        const [user] = await app.db
          .insert(authSchema.user)
          .values({
            id: userId,
            email,
            name,
            emailVerified: false,
            subscription_status: 'inactive',
          })
          .returning();

        app.logger.info({ userId, email }, 'User created');

        // Create account with password
        const accountId = crypto.randomUUID();
        const passwordHash = hashPassword(password);
        await app.db
          .insert(authSchema.account)
          .values({
            id: accountId,
            userId,
            providerId: 'credential',
            accountId: email,
            password: passwordHash,
          });

        app.logger.info({ userId, email }, 'Account created with password');

        // Create session
        const sessionId = crypto.randomUUID();
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const [session] = await app.db
          .insert(authSchema.session)
          .values({
            id: sessionId,
            userId,
            token,
            expiresAt,
          })
          .returning();

        app.logger.info({ userId, sessionId }, 'Session created');

        const response = {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            emailVerified: user.emailVerified,
            image: user.image,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
          },
          session: {
            id: session.id,
            token: session.token,
            expiresAt: session.expiresAt.toISOString(),
          },
        };

        // Send response immediately to user
        reply.code(200).send(response);

        // Create default notification schedule for user (non-blocking, fire-and-forget)
        ensureUserNotificationSchedule(app, userId).catch(err => {
          app.logger.warn(
            { userId, email, err },
            'Failed to create notification schedule during signup (non-critical)'
          );
        });

        // Track signup as a HubSpot contact (non-blocking, fire-and-forget)
        upsertHubspotContact(
          { email, firstName: name, source: 'signup_email' },
          app.logger
        ).catch((err) => {
          app.logger.warn({ userId, email, err }, 'Failed to create HubSpot contact (non-critical)');
        });

        // Send welcome email (non-blocking, fire-and-forget)
        sendWelcomeEmail({ email, name }, app.logger).catch((err) => {
          app.logger.warn({ userId, email, err }, 'Failed to send welcome email (non-critical)');
        });
      } catch (error: any) {
        const errMsg = error?.message || String(error);
        const errStack = error?.stack || '';
        const errCause = error?.cause ? String(error.cause) : '';
        app.logger.error(
          { err: error, errMsg, errStack, errCause, email },
          'Registration error: ' + errMsg
        );
        return reply.code(400).send({
          error: 'Failed to register user',
          detail: errMsg,
        });
      }
    }
  );

  // POST /api/auth/sign-in/email - Sign in with email and password
  fastify.post<{ Body: { email: string; password: string } }>(
    '/api/auth/sign-in/email',
    {
      schema: {
        description: 'Sign in with email and password',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  name: { type: 'string' },
                  emailVerified: { type: 'boolean' },
                  image: { type: ['string', 'null'] },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                },
              },
              session: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  token: { type: 'string' },
                  expiresAt: { type: 'string' },
                },
              },
            },
          },
          401: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const clientIp = request.ip || 'unknown';

      // Rate limit: 10 sign-in attempts per IP per 15 minutes
      const signInLimit = checkRateLimit(`signin:${clientIp}`, 10, 15 * 60 * 1000);
      if (!signInLimit.allowed) {
        app.logger.warn({ ip: clientIp, email }, 'Sign-in rate limit exceeded');
        return reply.code(429).send({ error: 'Too many sign-in attempts. Please try again in a few minutes.' });
      }

      app.logger.info({ email }, 'Sign-in attempt received at /api/auth/sign-in/email');

      try {
        // Validate inputs
        if (!email || typeof email !== 'string') {
          app.logger.warn({ email }, 'Sign-in failed: invalid email provided');
          return reply.code(401).send({
            error: 'Invalid email or password',
          });
        }

        if (!password || typeof password !== 'string') {
          app.logger.warn({ email }, 'Sign-in failed: invalid password provided');
          return reply.code(401).send({
            error: 'Invalid email or password',
          });
        }

        // Find user
        app.logger.debug({ email }, 'Step 1: Querying database for user');
        let users: any[];
        try {
          users = await app.db
            .select()
            .from(authSchema.user)
            .where(eq(authSchema.user.email, email));
          app.logger.debug({ email, userCount: users.length }, 'Step 1 complete: database query successful');
        } catch (dbError) {
          app.logger.error(
            { email, err: dbError },
            'Step 1 failed: database query error when fetching user'
          );
          return reply.code(401).send({
            error: 'Authentication failed',
          });
        }

        if (users.length === 0) {
          app.logger.warn({ email }, 'Sign-in failed: user not found in database');
          return reply.code(401).send({
            error: 'Invalid email or password',
          });
        }

        const user = users[0];
        app.logger.debug({ email, userId: user.id }, 'User found in database');

        // Find account with password
        app.logger.debug({ userId: user.id }, 'Step 2: Querying for password account');
        let accounts: any[];
        try {
          accounts = await app.db
            .select()
            .from(authSchema.account)
            .where(and(
              eq(authSchema.account.userId, user.id),
              eq(authSchema.account.providerId, 'credential')
            ));
          app.logger.debug({ userId: user.id, accountCount: accounts.length }, 'Step 2 complete: account query successful');
        } catch (dbError) {
          app.logger.error(
            { userId: user.id, err: dbError },
            'Step 2 failed: database query error when fetching account'
          );
          return reply.code(401).send({
            error: 'Authentication failed',
          });
        }

        if (accounts.length === 0) {
          app.logger.warn({ email, userId: user.id }, 'Sign-in failed: no password account found for user');

          // Check if user has other types of accounts
          const allAccounts = await app.db
            .select()
            .from(authSchema.account)
            .where(eq(authSchema.account.userId, user.id));

          if (allAccounts.length > 0) {
            const providers = allAccounts.map(acc => acc.providerId);
            if (providers.includes('apple')) {
              return reply.code(401).send({
                error: 'This email is linked to an Apple account. Please sign in with Apple instead.',
              });
            } else {
              const providerList = providers.join(', ');
              return reply.code(401).send({
                error: `This email is linked to ${providerList}. Please sign in with the appropriate method.`,
              });
            }
          }

          return reply.code(401).send({
            error: 'Invalid email or password',
          });
        }

        const account = accounts[0];

        // Validate password field exists
        if (!account.password) {
          app.logger.warn({ email, userId: user.id }, 'Sign-in failed: no password configured on account');
          return reply.code(401).send({
            error: 'Invalid email or password',
          });
        }

        app.logger.debug({ email, userId: user.id }, 'Password account found, attempting verification');

        // Verify password
        app.logger.debug({ email }, 'Step 3: Verifying password');
        let passwordValid = false;
        try {
          passwordValid = verifyPassword(password, account.password);
          app.logger.debug({ email, valid: passwordValid }, 'Step 3 complete: password verification successful');
        } catch (verifyError) {
          app.logger.error(
            { email, err: verifyError },
            'Step 3 failed: password verification error'
          );
          return reply.code(401).send({
            error: 'Authentication failed',
          });
        }

        if (!passwordValid) {
          app.logger.warn({ email, userId: user.id }, 'Sign-in failed: password verification failed');
          return reply.code(401).send({
            error: 'Invalid email or password',
          });
        }

        app.logger.info({ email, userId: user.id }, 'Password verification successful');

        // Create session
        app.logger.debug({ userId: user.id }, 'Step 4: Creating session');
        const sessionId = crypto.randomUUID();
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        let session: any;
        try {
          const result = await app.db
            .insert(authSchema.session)
            .values({
              id: sessionId,
              userId: user.id,
              token,
              expiresAt,
            })
            .returning();

          if (!result || result.length === 0) {
            app.logger.error(
              { userId: user.id, sessionId },
              'Step 4 failed: session insert returned empty result'
            );
            return reply.code(401).send({
              error: 'Failed to create session',
            });
          }

          session = result[0];
          app.logger.info({ userId: user.id, sessionId }, 'Step 4 complete: session created successfully');
        } catch (sessionError) {
          app.logger.error(
            { userId: user.id, err: sessionError },
            'Step 4 failed: error creating session'
          );
          return reply.code(401).send({
            error: 'Failed to create session',
          });
        }

        app.logger.info({ email, userId: user.id, sessionId }, 'Sign-in completed successfully');

        // Ensure we have a valid response object
        if (!user || !session) {
          app.logger.error(
            { userId: user.id, hasUser: !!user, hasSession: !!session },
            'Fatal: missing user or session in sign-in response'
          );
          return reply.code(401).send({
            error: 'Authentication failed',
          });
        }

        const response = {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            emailVerified: user.emailVerified,
            image: user.image,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
          },
          session: {
            id: session.id,
            token: session.token,
            expiresAt: session.expiresAt.toISOString(),
          },
        };

        // Send response immediately to user
        reply.code(200).send(response);

        // Ensure user has notification schedule (non-blocking, fire-and-forget)
        ensureUserNotificationSchedule(app, user.id).catch(err => {
          app.logger.warn(
            { userId: user.id, email, err },
            'Failed to ensure notification schedule during sign-in (non-critical)'
          );
        });

        // Clean up expired sessions for this user (non-blocking)
        app.db
          .delete(authSchema.session)
          .where(and(
            eq(authSchema.session.userId, user.id),
            lt(authSchema.session.expiresAt, new Date()),
          ))
          .then((result) => {
            app.logger.debug({ userId: user.id }, 'Expired sessions cleaned up');
          })
          .catch(err => {
            app.logger.warn({ userId: user.id, err }, 'Failed to clean up expired sessions (non-critical)');
          });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : '';
        app.logger.error(
          {
            err: error,
            email: request.body.email,
            errorMessage,
            errorStack,
            errorType: error instanceof Error ? error.constructor.name : typeof error,
          },
          'Unhandled sign-in error: authentication flow crashed'
        );

        // Ensure we always return JSON
        return reply.code(401).send({
          error: 'Authentication failed - internal error',
        });
      }
    }
  );

  // POST /api/auth/sign-in/apple - Sign in with Apple token
  fastify.post<{ Body: { identityToken: string; user?: { name?: { firstName?: string; lastName?: string }; email?: string } } }>(
    '/api/auth/sign-in/apple',
    {
      schema: {
        description: 'Sign in with Apple identity token',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['identityToken'],
          properties: {
            identityToken: { type: 'string' },
            user: { type: ['object', 'null'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  name: { type: 'string' },
                  emailVerified: { type: 'boolean' },
                  image: { type: ['string', 'null'] },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                },
              },
              session: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  token: { type: 'string' },
                  expiresAt: { type: 'string' },
                },
              },
              isNewUser: { type: 'boolean' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { identityToken, user: userData } = request.body;

      app.logger.info({ tokenLength: identityToken?.length }, 'Apple Sign-In attempt');

      // Step 1: Validate token format
      if (!identityToken || typeof identityToken !== 'string') {
        app.logger.warn({ tokenType: typeof identityToken }, 'Invalid token format: not a string');
        return reply.code(400).send({
          error: 'Invalid token format: identityToken must be a string',
        });
      }

      // Step 2: Verify JWT signature against Apple's public keys
      let appleUserId: string;
      let email: string | undefined;

      try {
        const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
          issuer: APPLE_ISSUER,
          audience: 'com.forelandmarine.seatimetracker',
        });

        appleUserId = payload.sub!;
        email = (payload.email as string) || userData?.email;

        if (!appleUserId) {
          app.logger.warn({ claims: Object.keys(payload) }, 'Token missing sub claim');
          return reply.code(400).send({ error: 'Invalid token: missing user identifier' });
        }

        app.logger.info({ appleUserId, hasEmail: !!email }, 'Apple token verified successfully');
      } catch (jwtError: any) {
        // Fall back to unverified decode in development (Apple sandbox tokens may not verify)
        if (process.env.NODE_ENV === 'production') {
          app.logger.error({ err: jwtError }, 'Apple JWT verification failed');
          return reply.code(401).send({ error: 'Apple authentication failed. Please try again.' });
        }

        // Development fallback: decode without verification
        app.logger.warn({ err: jwtError.message }, 'Apple JWT verification failed, using unverified decode (dev mode)');
        try {
          const parts = identityToken.split('.');
          const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
          appleUserId = decoded.sub || decoded.user_id;
          email = decoded.email || userData?.email;
          if (!appleUserId) {
            return reply.code(400).send({ error: 'Invalid token: missing user identifier' });
          }
        } catch {
          return reply.code(400).send({ error: 'Invalid token format' });
        }
      }

      try {
        // Step 3: Check if user already exists with this Apple ID
        app.logger.debug({ appleUserId }, 'Looking up existing Apple account');
        const accounts = await app.db
          .select()
          .from(authSchema.account)
          .where(eq(authSchema.account.accountId, appleUserId));

        let user;
        let isNewUser = false;

        if (accounts.length > 0) {
          // Existing user - sign in
          app.logger.debug({ appleUserId }, 'Apple account found');
          const account = accounts[0];

          const users = await app.db
            .select()
            .from(authSchema.user)
            .where(eq(authSchema.user.id, account.userId));

          if (users.length === 0) {
            app.logger.error({ userId: account.userId, appleUserId }, 'Account exists but user not found');
            return reply.code(500).send({
              error: 'Account data is inconsistent',
            });
          }

          user = users[0];
          app.logger.info({ userId: user.id, appleUserId }, 'Existing Apple user authenticated');
        } else {
          // No existing Apple account - check if user exists by email
          if (email) {
            app.logger.debug({ email }, 'Looking up existing user by email');
            const existingUsers = await app.db
              .select()
              .from(authSchema.user)
              .where(eq(authSchema.user.email, email));

            if (existingUsers.length > 0) {
              // User exists with this email - link Apple account
              user = existingUsers[0];
              app.logger.info({ userId: user.id, appleUserId, email }, 'Found existing user by email');

              // Create account linked to Apple ID for this user
              const accountId = crypto.randomUUID();
              await app.db
                .insert(authSchema.account)
                .values({
                  id: accountId,
                  userId: user.id,
                  providerId: 'apple',
                  accountId: appleUserId,
                });

              app.logger.info({ userId: user.id, appleUserId }, 'Apple account linked to existing user');
            } else {
              // User doesn't exist - create new user
              isNewUser = true;
              const userId = crypto.randomUUID();

              // Determine name
              let name = 'Apple User';
              if (userData?.name?.firstName) {
                name = userData.name.firstName;
                if (userData.name.lastName) {
                  name += ` ${userData.name.lastName}`;
                }
              }

              app.logger.info({ appleUserId, email, name }, 'Creating new Apple user');

              const [newUser] = await app.db
                .insert(authSchema.user)
                .values({
                  id: userId,
                  email,
                  name,
                  emailVerified: true,
                  subscription_status: 'inactive',
                })
                .returning();

              user = newUser;
              app.logger.debug({ userId, appleUserId }, 'User record created');

              // Create account linked to Apple ID
              const accountId = crypto.randomUUID();
              await app.db
                .insert(authSchema.account)
                .values({
                  id: accountId,
                  userId,
                  providerId: 'apple',
                  accountId: appleUserId,
                });

              app.logger.info({ userId, appleUserId }, 'Apple account record created');
            }
          } else {
            // No Apple account and no email - create new user with generated email
            app.logger.debug({ appleUserId }, 'No existing account or email provided, creating new user');
            isNewUser = true;
            const userId = crypto.randomUUID();

            // Determine name
            let name = 'Apple User';
            if (userData?.name?.firstName) {
              name = userData.name.firstName;
              if (userData.name?.lastName) {
                name += ` ${userData.name.lastName}`;
              }
            }

            const userEmail = `apple_${appleUserId}@seatime.com`;

            app.logger.info({ appleUserId, email: userEmail, name }, 'Creating new Apple user with generated email');

            const [newUser] = await app.db
              .insert(authSchema.user)
              .values({
                id: userId,
                email: userEmail,
                name,
                emailVerified: false,
                subscription_status: 'inactive',
              })
              .returning();

            user = newUser;
            app.logger.debug({ userId, appleUserId }, 'User record created');

            // Create account linked to Apple ID
            const accountId = crypto.randomUUID();
            await app.db
              .insert(authSchema.account)
              .values({
                id: accountId,
                userId,
                providerId: 'apple',
                accountId: appleUserId,
              });

            app.logger.info({ userId, appleUserId }, 'Apple account record created');
          }
        }

        // Step 4: Create session
        app.logger.debug({ userId: user.id }, 'Creating session');
        const sessionId = crypto.randomUUID();
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const [session] = await app.db
          .insert(authSchema.session)
          .values({
            id: sessionId,
            userId: user.id,
            token,
            expiresAt,
          })
          .returning();

        app.logger.info(
          { userId: user.id, sessionId, isNewUser, appleUserId },
          'Apple authentication successful'
        );

        const response = {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            emailVerified: user.emailVerified,
            image: user.image,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
          },
          session: {
            id: session.id,
            token: session.token,
            expiresAt: session.expiresAt.toISOString(),
          },
          isNewUser,
        };

        // Send response immediately to user
        reply.code(200).send(response);

        // Ensure user has notification schedule (non-blocking, fire-and-forget)
        ensureUserNotificationSchedule(app, user.id).catch(err => {
          app.logger.warn(
            { userId: user.id, email: user.email, appleUserId, err },
            'Failed to ensure notification schedule during Apple sign-in (non-critical)'
          );
        });

        // Track new Apple signups in HubSpot (non-blocking, fire-and-forget)
        if (isNewUser && user.email) {
          upsertHubspotContact(
            { email: user.email, firstName: user.name || undefined, source: 'signup_apple' },
            app.logger
          ).catch((err) => {
            app.logger.warn(
              { userId: user.id, email: user.email, err },
              'Failed to create HubSpot contact for Apple signup (non-critical)'
            );
          });

          // Send welcome email for new Apple signups
          sendWelcomeEmail({ email: user.email, name: user.name || undefined }, app.logger).catch((err) => {
            app.logger.warn(
              { userId: user.id, email: user.email, err },
              'Failed to send welcome email for Apple signup (non-critical)'
            );
          });
        }
      } catch (error) {
        app.logger.error({ err: error, appleUserId }, 'Database error during Apple Sign-In');
        return reply.code(500).send({
          error: 'Authentication service error',
        });
      }
    }
  );

  // GET /api/auth/user - Get current authenticated user
  fastify.get(
    '/api/auth/user',
    {
      schema: {
        description: 'Get current authenticated user profile',
        tags: ['auth'],
        response: {
          200: {
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  name: { type: 'string' },
                  emailVerified: { type: 'boolean' },
                  image: { type: ['string', 'null'] },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                },
              },
            },
          },
          401: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      app.logger.info({}, 'User profile request');

      try {
        // Get token from Authorization header
        const authHeader = request.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
          app.logger.warn({}, 'No authentication token provided');
          return reply.code(401).send({
            error: 'No authentication token provided',
          });
        }

        // Find session by token
        const sessions = await app.db
          .select()
          .from(authSchema.session)
          .where(eq(authSchema.session.token, token));

        if (sessions.length === 0) {
          app.logger.warn({}, 'Session not found');
          return reply.code(401).send({
            error: 'Invalid or expired token',
          });
        }

        const session = sessions[0];

        // Check if session is expired
        if (session.expiresAt < new Date()) {
          app.logger.warn({ sessionId: session.id }, 'Session expired');
          return reply.code(401).send({
            error: 'Session expired',
          });
        }

        // Get user
        const users = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.id, session.userId));

        if (users.length === 0) {
          app.logger.warn({ userId: session.userId }, 'User not found');
          return reply.code(401).send({
            error: 'User not found',
          });
        }

        const user = users[0];

        app.logger.info({ userId: user.id, email: user.email }, 'User profile retrieved');

        return reply.code(200).send({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            emailVerified: user.emailVerified,
            image: user.image,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
          },
        });
      } catch (error) {
        app.logger.error({ err: error }, 'Error retrieving user profile');
        return reply.code(401).send({
          error: 'Failed to retrieve user profile',
        });
      }
    }
  );

  // POST /api/auth/sign-out - Sign out user
  fastify.post(
    '/api/auth/sign-out',
    {
      schema: {
        description: 'Sign out current user',
        tags: ['auth'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          401: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      app.logger.info({}, 'Sign-out request');

      try {
        // Get token from Authorization header
        const authHeader = request.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
          app.logger.warn({}, 'No token for sign-out');
          return reply.code(401).send({
            error: 'No authentication token provided',
          });
        }

        // Delete session
        await app.db
          .delete(authSchema.session)
          .where(eq(authSchema.session.token, token));

        app.logger.info({}, 'User signed out');

        return reply.code(200).send({
          success: true,
        });
      } catch (error) {
        app.logger.error({ err: error }, 'Sign-out error');
        return reply.code(401).send({
          error: 'Failed to sign out',
        });
      }
    }
  );

  // POST /api/auth/test-user - Create test user (development only)
  if (process.env.NODE_ENV === 'production') {
    app.logger.info('Skipping test-user endpoint registration in production');
  } else {
  fastify.post(
    '/api/auth/test-user',
    {
      schema: {
        description: 'Create test user account (development only)',
        tags: ['auth'],
        response: {
          200: {
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  name: { type: 'string' },
                  emailVerified: { type: 'boolean' },
                  image: { type: ['string', 'null'] },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                },
              },
              session: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  token: { type: 'string' },
                  expiresAt: { type: 'string' },
                },
              },
              message: { type: 'string' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const email = 'test@seatime.com';
      const password = 'testpassword123';
      const name = 'Test User';

      app.logger.info({ email }, 'Test user creation request');

      try {
        // Check if test user already exists
        const existingUsers = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.email, email));

        if (existingUsers.length > 0) {
          app.logger.info({ email }, 'Test user already exists');

          // Create a new session for existing test user
          const user = existingUsers[0];
          const sessionId = crypto.randomUUID();
          const token = crypto.randomBytes(32).toString('hex');
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

          const [session] = await app.db
            .insert(authSchema.session)
            .values({
              id: sessionId,
              userId: user.id,
              token,
              expiresAt,
            })
            .returning();

          return reply.code(200).send({
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              emailVerified: user.emailVerified,
              image: user.image,
              createdAt: user.createdAt.toISOString(),
              updatedAt: user.updatedAt.toISOString(),
            },
            session: {
              id: session.id,
              token: session.token,
              expiresAt: session.expiresAt.toISOString(),
            },
            message: 'Test user already exists - new session created',
          });
        }

        // Create new test user
        const userId = crypto.randomUUID();
        const [user] = await app.db
          .insert(authSchema.user)
          .values({
            id: userId,
            email,
            name,
            emailVerified: false,
          })
          .returning();

        app.logger.info({ userId, email }, 'Test user created');

        // Create account with password
        const accountId = crypto.randomUUID();
        const passwordHash = hashPassword(password);
        await app.db
          .insert(authSchema.account)
          .values({
            id: accountId,
            userId,
            providerId: 'credential',
            accountId: email,
            password: passwordHash,
          });

        // Create session
        const sessionId = crypto.randomUUID();
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const [session] = await app.db
          .insert(authSchema.session)
          .values({
            id: sessionId,
            userId,
            token,
            expiresAt,
          })
          .returning();

        app.logger.info({ userId, sessionId }, 'Test user session created');

        return reply.code(200).send({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            emailVerified: user.emailVerified,
            image: user.image,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
          },
          session: {
            id: session.id,
            token: session.token,
            expiresAt: session.expiresAt.toISOString(),
          },
          message: 'Test user created successfully',
        });
      } catch (error) {
        app.logger.error({ err: error, email }, 'Test user creation error');
        return reply.code(400).send({
          error: 'Failed to create test user',
        });
      }
    }
  );
  } // end test-user dev guard

  // POST /api/auth/forgot-password - Request password reset code
  fastify.post<{ Body: { email: string } }>(
    '/api/auth/forgot-password',
    {
      schema: {
        description: 'Request a password reset code. Code will be sent via email.',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              resetCodeId: { type: 'string', description: 'ID of the reset code record (for testing)' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body;
      const clientIp = request.ip || 'unknown';

      // Rate limit: 3 reset attempts per IP per 15 minutes
      const resetLimit = checkRateLimit(`reset:${clientIp}`, 3, 15 * 60 * 1000);
      if (!resetLimit.allowed) {
        app.logger.warn({ ip: clientIp, email }, 'Password reset rate limit exceeded');
        return reply.code(429).send({ error: 'Too many reset attempts. Please try again later.' });
      }

      app.logger.info({ email }, 'Password reset requested');

      try {
        // Check if user exists
        const users = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.email, email));

        if (users.length === 0) {
          app.logger.warn({ email }, 'Password reset failed: user not found');
          // Return success with a fake UUID for security (prevent email enumeration)
          return reply.code(200).send({
            message: 'If an account exists with this email, a password reset code will be sent',
            resetCodeId: crypto.randomUUID(),
          });
        }

        const user = users[0];

        // Generate reset code (6-digit numeric code)
        const resetCode = crypto.randomInt(100000, 1000000).toString();

        // Create verification entry with 15-minute expiry
        const resetId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        await app.db
          .insert(authSchema.verification)
          .values({
            id: resetId,
            identifier: `password-reset:${user.id}`,
            value: resetCode,
            expiresAt,
          });

        app.logger.info(
          { userId: user.id, email, resetId, expiresAt: expiresAt.toISOString() },
          'Password reset code generated'
        );

        // Send email with reset code
        const resendApiKey = process.env.RESEND_API_KEY;

        if (!resendApiKey) {
          // Development/testing mode: log the code to console for manual testing
          app.logger.warn(
            { userId: user.id, email, resetCode, expiresAt: expiresAt.toISOString() },
            'RESEND_API_KEY not configured - cannot send password reset email. Set RESEND_API_KEY environment variable for production email sending.'
          );
          return reply.code(400).send({
            error: 'Failed to send password reset email. Please try again later.',
          });
        } else {
          // Production mode: send email via Resend
          const fromAddress = process.env.FROM_EMAIL || 'SeaTime Tracker <noreply@forelandmarine.com>';

          app.logger.info(
            { userId: user.id, email, from: fromAddress, resetId },
            'Attempting to send password reset email via Resend'
          );

          try {
            const resend = new Resend(resendApiKey);
            const { data, error: emailError } = await resend.emails.send({
              from: fromAddress,
              to: email,
              subject: 'SeaTime Tracker - Password Reset Code',
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
                  <div style="background-color: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h2 style="color: #1f2937; margin-top: 0; margin-bottom: 24px;">Password Reset Request</h2>

                    <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                      Hi ${user.name},
                    </p>

                    <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                      We received a request to reset your SeaTime Tracker password. If you made this request, use the code below to reset your password:
                    </p>

                    <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 30px 0; text-align: center;">
                      <div style="font-size: 32px; font-weight: bold; color: #0066cc; letter-spacing: 4px; font-family: 'Courier New', monospace;">
                        ${resetCode}
                      </div>
                    </div>

                    <p style="color: #9ca3af; font-size: 14px; margin: 20px 0;">
                      This code expires in <strong>15 minutes</strong>. If you didn't request this reset, you can safely ignore this email.
                    </p>

                    <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
                      For security reasons:
                    </p>

                    <ul style="color: #4b5563; font-size: 14px; line-height: 1.8; margin: 0 0 20px 20px; padding: 0;">
                      <li>Never share this code with anyone</li>
                      <li>SeaTime Tracker staff will never ask for this code</li>
                      <li>This code is valid for 15 minutes only</li>
                    </ul>

                    <div style="border-top: 1px solid #e5e7eb; margin-top: 30px; padding-top: 20px;">
                      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        © SeaTime Tracker. All rights reserved.
                      </p>
                    </div>
                  </div>
                </div>
              `,
              text: `Password Reset Code: ${resetCode}\n\nThis code expires in 15 minutes. If you didn't request this, you can safely ignore this email.`,
            });

            if (emailError) {
              app.logger.error(
                {
                  userId: user.id,
                  email,
                  from: fromAddress,
                  resetId,
                  resendError: emailError.message,
                },
                'Resend returned an error sending password reset email — check API key validity and domain verification for noreply@seatime.com'
              );
              return reply.code(400).send({
                error: 'Failed to send password reset email. Please try again later.',
              });
            }

            app.logger.info(
              { userId: user.id, email, from: fromAddress, resetId, emailId: data?.id },
              'Password reset email sent successfully'
            );
          } catch (emailSendError) {
            const errMessage = emailSendError instanceof Error ? emailSendError.message : String(emailSendError);
            const errStack = emailSendError instanceof Error ? emailSendError.stack : undefined;
            const errCause = emailSendError instanceof Error && (emailSendError as NodeJS.ErrnoException).cause
              ? String((emailSendError as NodeJS.ErrnoException).cause)
              : undefined;

            app.logger.error(
              {
                userId: user.id,
                email,
                from: fromAddress,
                resetId,
                resendError: errMessage,
                stack: errStack,
                cause: errCause,
              },
              'Exception thrown while sending password reset email via Resend — check RESEND_API_KEY validity and domain verification for noreply@seatime.com'
            );

            return reply.code(400).send({
              error: 'Failed to send password reset email. Please try again later.',
            });
          }
        }

        return reply.code(200).send({
          message: 'If an account exists with this email, a password reset code will be sent',
          resetCodeId: resetId,
        });
      } catch (error) {
        app.logger.error({ err: error, email }, 'Password reset request error');
        return reply.code(500).send({
          error: 'Failed to process password reset request',
        });
      }
    }
  );

  // POST /api/auth/verify-reset-code - Verify the reset code is valid
  fastify.post<{ Body: { resetCodeId: string; code: string } }>(
    '/api/auth/verify-reset-code',
    {
      schema: {
        description: 'Verify that a password reset code is valid before allowing password change',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['resetCodeId', 'code'],
          properties: {
            resetCodeId: { type: 'string', description: 'ID returned from /forgot-password' },
            code: { type: 'string', description: '6-digit reset code' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              valid: { type: 'boolean' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { resetCodeId, code } = request.body;

      // Rate limit: 5 verify attempts per resetCodeId per 15 minutes
      const verifyLimit = checkRateLimit(`verify:${resetCodeId}`, 5, 15 * 60 * 1000);
      if (!verifyLimit.allowed) {
        return reply.code(429).send({ error: 'Too many verification attempts. Please request a new code.' });
      }

      app.logger.info({ resetCodeId }, 'Password reset code verification attempted');

      try {
        // Find the reset code
        const verification = await app.db
          .select()
          .from(authSchema.verification)
          .where(eq(authSchema.verification.id, resetCodeId));

        if (verification.length === 0) {
          app.logger.warn({ resetCodeId }, 'Reset code not found');
          return reply.code(404).send({
            error: 'Reset code not found',
          });
        }

        const resetRecord = verification[0];

        // Check if code is expired
        if (new Date() > resetRecord.expiresAt) {
          app.logger.warn({ resetCodeId }, 'Reset code expired');
          return reply.code(400).send({
            error: 'Reset code has expired. Please request a new one.',
          });
        }

        // Check if code matches
        if (resetRecord.value !== code) {
          app.logger.warn({ resetCodeId }, 'Invalid reset code provided');
          return reply.code(400).send({
            error: 'Invalid reset code',
          });
        }

        // Verify it's a password reset identifier
        if (!resetRecord.identifier.startsWith('password-reset:')) {
          app.logger.warn({ resetCodeId, identifier: resetRecord.identifier }, 'Invalid verification record type');
          return reply.code(400).send({
            error: 'Invalid reset code',
          });
        }

        app.logger.info({ resetCodeId }, 'Reset code verified successfully');

        return reply.code(200).send({
          message: 'Reset code is valid',
          valid: true,
        });
      } catch (error) {
        app.logger.error({ err: error, resetCodeId }, 'Reset code verification error');
        return reply.code(400).send({
          error: 'Failed to verify reset code',
        });
      }
    }
  );

  // POST /api/auth/reset-password - Set new password using reset code
  fastify.post<{ Body: { resetCodeId: string; code: string; newPassword: string } }>(
    '/api/auth/reset-password',
    {
      schema: {
        description: 'Set a new password using a valid reset code',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['resetCodeId', 'code', 'newPassword'],
          properties: {
            resetCodeId: { type: 'string', description: 'ID returned from /forgot-password' },
            code: { type: 'string', description: '6-digit reset code' },
            newPassword: { type: 'string', minLength: 8, description: 'New password (min 8 characters)' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  name: { type: 'string' },
                },
              },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { resetCodeId, code, newPassword } = request.body;

      app.logger.info({ resetCodeId }, 'Password reset attempted');

      try {
        // Find and validate the reset code
        const verification = await app.db
          .select()
          .from(authSchema.verification)
          .where(eq(authSchema.verification.id, resetCodeId));

        if (verification.length === 0) {
          app.logger.warn({ resetCodeId }, 'Reset code not found');
          return reply.code(404).send({
            error: 'Reset code not found',
          });
        }

        const resetRecord = verification[0];

        // Check if code is expired
        if (new Date() > resetRecord.expiresAt) {
          app.logger.warn({ resetCodeId }, 'Reset code expired');
          return reply.code(400).send({
            error: 'Reset code has expired. Please request a new one.',
          });
        }

        // Check if code matches
        if (resetRecord.value !== code) {
          app.logger.warn({ resetCodeId }, 'Invalid reset code provided');
          return reply.code(400).send({
            error: 'Invalid reset code',
          });
        }

        // Verify it's a password reset identifier
        if (!resetRecord.identifier.startsWith('password-reset:')) {
          app.logger.warn({ resetCodeId, identifier: resetRecord.identifier }, 'Invalid verification record type');
          return reply.code(400).send({
            error: 'Invalid reset code',
          });
        }

        // Extract user ID from identifier
        const userId = resetRecord.identifier.split(':')[1];

        // Find user
        const users = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.id, userId));

        if (users.length === 0) {
          app.logger.error({ resetCodeId, userId }, 'User not found for reset code');
          return reply.code(404).send({
            error: 'User not found',
          });
        }

        const user = users[0];

        // Find or create account for password-based authentication
        const accounts = await app.db
          .select()
          .from(authSchema.account)
          .where(eq(authSchema.account.userId, userId));

        const passwordHash = hashPassword(newPassword);

        // Check if user has a credential account
        const hasCredentialAccount = accounts.some(a => a.providerId === 'credential');

        if (hasCredentialAccount) {
          // Update existing credential account password
          await app.db
            .update(authSchema.account)
            .set({
              password: passwordHash,
            })
            .where(and(
              eq(authSchema.account.userId, userId),
              eq(authSchema.account.providerId, 'credential'),
            ));

          app.logger.info({ userId, email: user.email }, 'Password updated');
        } else {
          // Create new account with password
          const accountId = crypto.randomUUID();
          await app.db
            .insert(authSchema.account)
            .values({
              id: accountId,
              userId,
              providerId: 'credential',
              accountId: user.email,
              password: passwordHash,
            });

          app.logger.info({ userId, email: user.email }, 'Password account created');
        }

        // Delete the used reset code to prevent reuse
        await app.db
          .delete(authSchema.verification)
          .where(eq(authSchema.verification.id, resetCodeId));

        // Revoke all existing sessions - forces re-login on all devices
        await app.db
          .delete(authSchema.session)
          .where(eq(authSchema.session.userId, userId));

        app.logger.info({ userId, email: user.email, resetCodeId }, 'Password reset successful, all sessions revoked');

        return reply.code(200).send({
          message: 'Password reset successfully',
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
          },
        });
      } catch (error) {
        app.logger.error({ err: error, resetCodeId }, 'Password reset error');
        return reply.code(500).send({
          error: 'Failed to reset password',
        });
      }
    }
  );

}
