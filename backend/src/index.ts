/**
 * SeaTime Tracker Backend
 *
 * Authentication Configuration:
 * - Uses Better Auth for user authentication with email/password and Apple Sign-In
 * - Sessions stored in PostgreSQL with secure tokens
 *
 * Required Environment Variables:
 * - DATABASE_URL: PostgreSQL connection string (Neon in production, PGlite locally)
 * - MYSHIPTRACKING_API_KEY: API key for MyShipTracking AIS vessel tracking
 * - APPLE_CLIENT_ID: Apple Sign-In client ID (optional)
 * - APPLE_TEAM_ID: Apple team ID (optional)
 * - APPLE_KEY_ID: Apple key ID (optional)
 * - APPLE_PRIVATE_KEY: Apple private key (optional)
 *
 * Core Endpoints:
 * - Vessel Management: GET/POST /api/vessels, GET/PUT /api/vessels/:id
 * - AIS Tracking: POST /api/ais/check/:vesselId, GET /api/ais/:vesselId/history
 * - Sea Time Entries: GET/POST /api/sea-time, PUT /api/sea-time/:id/confirm
 * - Reports: GET /api/reports/csv, GET /api/reports/pdf, GET /api/reports/summary
 * - Tracking: GET /api/tracking/vessel/:vesselId
 * - Authentication: POST /api/auth/sign-up/email, POST /api/auth/sign-in/email, POST /api/auth/sign-in/apple, GET /api/auth/user, POST /api/auth/sign-out
 * - User Profile: GET /api/profile, PUT /api/profile, PUT /api/profile/department, POST /api/profile/upload-image
 * - Notifications: GET /api/notifications/schedule, PUT /api/notifications/schedule, GET /api/notifications/check-due
 */

import { createApplication } from "@specific-dev/framework";
import * as appSchema from './db/schema.js';
import * as authSchema from './db/auth-schema.js';

// Import route registration functions
import * as vesselsRoutes from './routes/vessels.js';
import * as aisRoutes from './routes/ais.js';
import * as seaTimeRoutes from './routes/sea-time.js';
import * as reportsRoutes from './routes/reports.js';
import * as trackingRoutes from './routes/tracking.js';
import * as authRoutes from './routes/auth.js';
import * as profileRoutes from './routes/profile.js';
import * as adminRoutes from './routes/admin.js';
import * as notificationsRoutes from './routes/notifications.js';
import * as subscriptionRoutes from './routes/subscription.js';

// Import scheduler service
import { startScheduler } from './services/scheduler.js';

// Import seed utilities
import { seedTestUser, seedSandboxUser } from './utils/seed.js';

// Combine schemas for full database type support (app + auth)
const schema = { ...appSchema, ...authSchema };

// Create application with combined schema
export const app = await createApplication(schema);

// Enable authentication with Better Auth
app.withAuth({
  socialProviders: {},
});

// Enable storage for file uploads (profile images, documents, etc.)
app.withStorage();

// Configure CORS for all origins (support authentication)
app.fastify.addHook('onRequest', async (request, reply) => {
  const origin = request.headers.origin;

  // Allow all origins with credentials support for authentication
  reply.header('Access-Control-Allow-Origin', origin || '*');
  reply.header('Access-Control-Allow-Credentials', 'true');
  reply.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS,PATCH,HEAD');
  reply.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept');
  reply.header('Access-Control-Max-Age', '3600');

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    reply.code(200).send();
  }
});

// Log all API requests
app.fastify.addHook('onRequest', async (request) => {
  app.logger.info({
    method: request.method,
    path: request.url,
  }, 'API request');
});

// Ensure JSON responses for authentication errors
app.fastify.addHook('onSend', async (request, reply, payload) => {
  // If the response is an error (4xx or 5xx), ensure it's JSON
  if (reply.statusCode >= 400) {
    const contentType = reply.getHeader('content-type');

    // If response is HTML or undefined, convert to JSON
    if (!contentType || contentType.toString().includes('text/html')) {
      app.logger.debug(
        { statusCode: reply.statusCode, path: request.url, contentType },
        'Converting error response to JSON'
      );

      reply.type('application/json');

      // If payload is HTML string, extract error or use default message
      if (typeof payload === 'string' && payload.includes('<')) {
        const statusMessage = reply.statusCode === 404
          ? 'Not found'
          : reply.statusCode === 400
          ? 'Bad request'
          : reply.statusCode === 401
          ? 'Unauthorized'
          : reply.statusCode === 403
          ? 'Forbidden'
          : 'Internal server error';

        return JSON.stringify({ error: statusMessage });
      }
    }
  }

  return payload;
});

// Global error handler to ensure JSON responses for all endpoints
app.fastify.setErrorHandler(async (error, request, reply) => {
  const statusCode = (error as any).statusCode || 500;
  const errorName = (error as any).name || 'Error';
  const errorMessage = (error as any).message || 'Unknown error';
  const errorStack = (error as any).stack;

  app.logger.error(
    {
      err: error,
      errorName,
      errorMessage,
      statusCode,
      method: request.method,
      path: request.url,
      url: request.url,
      headers: request.headers,
    },
    `Request error: ${errorName} - ${errorMessage}`
  );

  // Always return JSON for API errors - never HTML
  const responseMessage = statusCode === 404
    ? 'Not found'
    : statusCode === 400
    ? errorMessage || 'Bad request'
    : statusCode === 401
    ? 'Unauthorized'
    : statusCode === 403
    ? 'Forbidden'
    : 'Internal server error';

  // Ensure we always send JSON, never HTML
  reply.type('application/json');
  return reply.code(statusCode).send({
    error: responseMessage,
  });
});

// Verify database connection on startup
app.fastify.addHook('onReady', async () => {
  app.logger.info('Application ready - verifying database connection');

  try {
    // Test database connection by querying vessels table
    const vessels = await app.db.select().from(appSchema.vessels);
    app.logger.info({ vesselCount: vessels.length }, 'Database connection verified');

    // Seed test users for development/testing
    app.logger.info('Seeding development test users');
    await seedTestUser(app);
    await seedSandboxUser(app);
  } catch (error) {
    app.logger.warn({ err: error }, 'Database connection test failed or seeding error - will attempt to connect on first query');
  }
});

// Export App type for use in route files
export type App = typeof app;

// Register routes - add your route modules here
// IMPORTANT: Always use registration functions to avoid circular dependency issues
vesselsRoutes.register(app, app.fastify);
aisRoutes.register(app, app.fastify);
seaTimeRoutes.register(app, app.fastify);
reportsRoutes.register(app, app.fastify);
trackingRoutes.register(app, app.fastify);
authRoutes.register(app, app.fastify);
profileRoutes.register(app, app.fastify);
adminRoutes.register(app, app.fastify);
notificationsRoutes.register(app, app.fastify);
subscriptionRoutes.register(app, app.fastify);

// Log API configuration status
const aisApiKey = process.env.MYSHIPTRACKING_API_KEY;
if (aisApiKey) {
  app.logger.info('MyShipTracking API key configured');
} else {
  app.logger.warn('MyShipTracking API key not configured - AIS tracking will fail. Set MYSHIPTRACKING_API_KEY environment variable');
}

await app.run();
app.logger.info('Application running');

// Start the background scheduler for periodic vessel position checks
await startScheduler(app);
