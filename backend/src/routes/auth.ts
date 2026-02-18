import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import crypto from "crypto";
import { Resend } from "resend";
import { ensureUserNotificationSchedule } from "./notifications.js";

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
    return computedHash === storedHash;
  } catch (error) {
    return false;
  }
}

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
            password: { type: 'string', minLength: 6 },
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
          400: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { email, password, name } = request.body;

      app.logger.info({ email, name }, 'User registration attempt');

      try {
        // Check if user already exists
        const existingUser = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.email, email));

        if (existingUser.length > 0) {
          app.logger.warn({ email }, 'Registration failed: email already exists');
          return reply.code(400).send({
            error: 'Email already registered',
          });
        }

        // Create user
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

        app.logger.info({ userId, email }, 'User created');

        // Create default notification schedule for the user
        await ensureUserNotificationSchedule(app, userId);

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
        });
      } catch (error) {
        app.logger.error({ err: error, email }, 'Registration error');
        return reply.code(400).send({
          error: 'Failed to register user',
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

      app.logger.info({ email }, 'Sign-in attempt received');

      try {
        // Find user
        app.logger.debug({ email }, 'Querying database for user');
        const users = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.email, email));

        if (users.length === 0) {
          app.logger.warn({ email }, 'Sign-in failed: user not found in database');
          return reply.code(401).send({
            error: 'Invalid email or password',
          });
        }

        const user = users[0];
        app.logger.debug({ email, userId: user.id }, 'User found in database');

        // Find account with password
        app.logger.debug({ userId: user.id }, 'Querying for password account');
        const accounts = await app.db
          .select()
          .from(authSchema.account)
          .where(eq(authSchema.account.userId, user.id));

        if (accounts.length === 0) {
          app.logger.warn({ email, userId: user.id }, 'Sign-in failed: no account found for user');
          return reply.code(401).send({
            error: 'Invalid email or password',
          });
        }

        if (!accounts[0].password) {
          app.logger.warn({ email, userId: user.id }, 'Sign-in failed: no password configured on account');
          return reply.code(401).send({
            error: 'Invalid email or password',
          });
        }

        const account = accounts[0];
        app.logger.debug({ email, userId: user.id }, 'Password account found');

        // Verify password
        app.logger.debug({ email }, 'Verifying password');
        if (!verifyPassword(password, account.password)) {
          app.logger.warn({ email, userId: user.id }, 'Sign-in failed: password verification failed');
          return reply.code(401).send({
            error: 'Invalid email or password',
          });
        }

        app.logger.info({ email, userId: user.id }, 'Password verification successful');

        // Ensure user has notification schedule
        app.logger.debug({ userId: user.id }, 'Ensuring user notification schedule');
        await ensureUserNotificationSchedule(app, user.id);

        // Create session
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

        app.logger.info({ email, userId: user.id, sessionId }, 'Session created successfully');

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
        });
      } catch (error) {
        app.logger.error({ err: error, email }, 'Sign-in error: database or processing error');
        return reply.code(401).send({
          error: 'Authentication failed',
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

      // Step 1: Parse and validate JWT token format
      if (!identityToken || typeof identityToken !== 'string') {
        app.logger.warn({ tokenType: typeof identityToken }, 'Invalid token format: not a string');
        return reply.code(400).send({
          error: 'Invalid token format: identityToken must be a string',
        });
      }

      // Decode JWT token
      let decodedToken: any = {};
      try {
        const parts = identityToken.split('.');
        app.logger.debug({ parts: parts.length }, 'JWT token structure check');

        if (parts.length !== 3) {
          app.logger.warn({ parts: parts.length }, 'Invalid JWT: expected 3 parts, got ' + parts.length);
          return reply.code(400).send({
            error: 'Invalid token format: JWT must have 3 parts (header.payload.signature)',
          });
        }

        const payload = parts[1];
        if (!payload) {
          app.logger.warn({}, 'Invalid JWT: empty payload');
          return reply.code(400).send({
            error: 'Invalid token format: empty payload',
          });
        }

        let decoded: string;
        try {
          decoded = Buffer.from(payload, 'base64').toString('utf-8');
        } catch (e) {
          app.logger.warn({ err: e }, 'Base64 decoding failed');
          return reply.code(400).send({
            error: 'Invalid token format: unable to decode base64 payload',
          });
        }

        try {
          decodedToken = JSON.parse(decoded);
        } catch (e) {
          app.logger.warn({ err: e, payload: decoded.substring(0, 100) }, 'JSON parsing failed');
          return reply.code(400).send({
            error: 'Invalid token format: payload is not valid JSON',
          });
        }
      } catch (error) {
        app.logger.error({ err: error }, 'Unexpected error during token decoding');
        return reply.code(500).send({
          error: 'Failed to decode authentication token',
        });
      }

      // Step 2: Extract claims from decoded token
      const appleUserId = decodedToken.sub || decodedToken.user_id;
      const email = decodedToken.email || userData?.email;

      if (!appleUserId) {
        app.logger.warn({ claims: Object.keys(decodedToken) }, 'Token missing required user identifier (sub or user_id)');
        return reply.code(400).send({
          error: 'Invalid token: missing user identifier',
        });
      }

      app.logger.info({ appleUserId, hasEmail: !!email }, 'Apple token decoded successfully');

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

        // Step 4: Ensure user has notification schedule
        app.logger.debug({ userId: user.id }, 'Ensuring notification schedule exists');
        await ensureUserNotificationSchedule(app, user.id);

        // Step 5: Create session
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
          isNewUser,
        });
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

  // POST /api/auth/test-user - Create test user (no authentication required)
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
          404: { type: 'object', properties: { error: { type: 'string' } } },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body;

      app.logger.info({ email }, 'Password reset requested');

      try {
        // Check if user exists
        const users = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.email, email));

        if (users.length === 0) {
          app.logger.warn({ email }, 'Password reset failed: user not found');
          // Return success anyway for security (prevent email enumeration)
          return reply.code(200).send({
            message: 'If an account exists with this email, a password reset code will be sent',
            resetCodeId: 'N/A',
          });
        }

        const user = users[0];

        // Generate reset code (6-digit numeric code)
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

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
            'RESEND_API_KEY not configured - password reset code logged to console for development. Set RESEND_API_KEY environment variable for production email sending.'
          );
        } else {
          // Production mode: send email via Resend
          try {
            const resend = new Resend(resendApiKey);
            const { data, error: emailError } = await resend.emails.send({
              from: 'SeaTime Tracker <noreply@seatime.com>',
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
                { userId: user.id, email, emailError: emailError.message },
                'Failed to send password reset email - user should still receive success response'
              );
              // Still return success to prevent email enumeration attacks
            } else {
              app.logger.info(
                { userId: user.id, email, resetId, emailId: data?.id },
                'Password reset email sent successfully'
              );
            }
          } catch (emailError) {
            app.logger.error(
              { userId: user.id, email, emailError: emailError instanceof Error ? emailError.message : String(emailError) },
              'Failed to send password reset email - user should still receive success response'
            );
            // Still return success to prevent email enumeration attacks
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
            newPassword: { type: 'string', minLength: 6, description: 'New password (min 6 characters)' },
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

        if (accounts.length > 0) {
          // Update existing password
          await app.db
            .update(authSchema.account)
            .set({
              password: passwordHash,
            })
            .where(eq(authSchema.account.userId, userId));

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

        app.logger.info({ userId, email: user.email, resetCodeId }, 'Password reset successful, reset code invalidated');

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
