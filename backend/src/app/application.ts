/**
 * Application class — replaces @specific-dev/framework's createApplication.
 *
 * Wraps Fastify, drizzle, and better-auth into a single object that the
 * route registrars expect (app.fastify, app.db, app.logger, app.run()).
 *
 * Sprint 7: dropped the vendored framework, this is its in-house replacement.
 */

import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import postgres from 'postgres';
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';

const DATABASE_URL = process.env.DATABASE_URL;

export class Application<TSchema extends Record<string, unknown> = Record<string, unknown>> {
  fastify!: FastifyInstance;
  port: number;
  private _db: PostgresJsDatabase<TSchema>;
  private _client: ReturnType<typeof postgres>;
  private authInstance: ReturnType<typeof betterAuth> | null = null;
  private initialized = false;

  get db() {
    return this._db;
  }

  get logger() {
    return this.fastify.log;
  }

  constructor(schema: TSchema) {
    this.port = parseInt(process.env.PORT || '3001', 10);

    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    this._client = postgres(DATABASE_URL, { prepare: false });
    this._db = drizzlePostgres(this._client, { schema });
  }

  async init() {
    if (this.initialized) return;
    this.fastify = await this.createFastifyInstance();
    this.initialized = true;
  }

  /**
   * Storage is a no-op in this replacement — we never used the framework's
   * S3 storage in production. Profile image upload is unimplemented.
   * Kept as a chainable no-op for compatibility with existing index.ts.
   */
  withStorage() {
    this.fastify.log.info('withStorage() called — no-op (storage not configured in this build)');
    return this;
  }

  /**
   * Wire up better-auth with the user's database. Mounts /api/auth/* routes
   * and exposes app.authInstance for downstream session checks.
   */
  withAuth() {
    const auth = betterAuth({
      database: drizzleAdapter(this._db as any, { provider: 'pg' }),
      secret: process.env.BETTER_AUTH_SECRET,
      baseURL: process.env.BETTER_AUTH_URL || `http://localhost:${this.port}`,
      trustedOrigins: ['*'],
      emailAndPassword: { enabled: true },
      plugins: [bearer()],
      advanced: {
        defaultCookieAttributes: {
          sameSite: 'none',
          secure: true,
          partitioned: true,
        },
      },
    });

    this.authInstance = auth;

    // Cookie-to-bearer token conversion hook
    this.fastify.addHook('onRequest', async (request) => {
      if (request.headers.authorization) return;
      const cookieHeader = request.headers.cookie;
      if (!cookieHeader) return;
      const SESSION_COOKIE_NAME = 'better-auth.session_token';
      const cookies = cookieHeader.split(';').map((c) => c.trim());
      const sessionCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
      if (!sessionCookie) return;
      const token = sessionCookie.substring(SESSION_COOKIE_NAME.length + 1);
      request.headers.authorization = `Bearer ${token}`;
    });

    // Forward /api/auth/* to better-auth's handler
    this.fastify.route({
      method: ['GET', 'POST'],
      url: '/api/auth/*',
      async handler(request, reply) {
        try {
          const url = new URL(request.url, `http://${request.headers.host}`);
          const headers = new Headers();
          Object.entries(request.headers).forEach(([key, value]) => {
            if (value) headers.append(key, Array.isArray(value) ? value[0] : value);
          });
          const req = new Request(url.toString(), {
            method: request.method,
            headers,
            body: request.body ? JSON.stringify(request.body) : undefined,
          });
          const response = await auth.handler(req);
          reply.status(response.status);
          response.headers.forEach((value, key) => {
            reply.header(key, value);
          });
          const body = await response.text();
          return body ? reply.send(body) : reply.send();
        } catch (error) {
          request.log.error(error, 'Better Auth handler error');
          return reply.status(500).send({ error: 'Authentication error' });
        }
      },
    });

    return this;
  }

  /**
   * Internal — create the Fastify instance with all standard middleware.
   */
  private async createFastifyInstance(): Promise<FastifyInstance> {
    const fastify = Fastify({
      logger: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  translateTime: 'HH:MM:ss Z',
                  ignore: 'pid,hostname',
                },
              }
            : undefined,
      },
    });

    // Handle empty JSON body gracefully (e.g., DELETE with Content-Type: application/json)
    fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      const str = (body as string || '').trim();
      if (!str) {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(str));
      } catch (err: any) {
        err.statusCode = 400;
        done(err, undefined);
      }
    });

    // CORS preflight
    fastify.addHook('onRequest', async (request, reply) => {
      if (request.method === 'OPTIONS') {
        const origin = request.headers.origin || '*';
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header(
          'Access-Control-Allow-Methods',
          'GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS'
        );
        reply.header(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Requested-With'
        );
        reply.header('Access-Control-Allow-Credentials', 'true');
        reply.header('Access-Control-Max-Age', '86400');
        return reply.status(204).send();
      }
    });

    // CORS headers on all responses (override anything the app set)
    fastify.addHook('onSend', async (request, reply) => {
      if (request.method === 'OPTIONS') return;
      reply.removeHeader('access-control-allow-origin');
      reply.removeHeader('access-control-allow-credentials');
      reply.removeHeader('access-control-allow-methods');
      reply.removeHeader('access-control-allow-headers');
      reply.removeHeader('access-control-max-age');
      reply.removeHeader('access-control-expose-headers');
      const origin = request.headers.origin || '*';
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Credentials', 'true');
    });

    // Plugins
    await fastify.register(multipart);
    await fastify.register(websocket);

    // Health endpoint (the framework registered /health, our routes register /api/health)
    fastify.get('/health', async () => ({ status: 'ok' }));

    return fastify;
  }

  /**
   * Start the HTTP server.
   */
  async run() {
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
      this.fastify.log.info('Lambda environment detected, skipping server start');
      return;
    }

    await this.fastify.ready();
    try {
      await this.fastify.listen({ port: this.port, host: '0.0.0.0' });
      this.fastify.log.info({ port: this.port }, 'Server listening');
    } catch (err) {
      this.fastify.log.error(err, 'Failed to start server');
      process.exit(1);
    }
  }
}

export async function createApplication<TSchema extends Record<string, unknown>>(
  schema: TSchema
): Promise<Application<TSchema>> {
  const app = new Application(schema);
  await app.init();
  return app;
}
