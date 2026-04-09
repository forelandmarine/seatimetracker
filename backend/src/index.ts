import { createApplication, runMigrations, logger } from "@specific-dev/framework";
import * as schema from './db/schema.js';
import * as authSchema from './db/auth-schema.js';
import { initSentry } from './utils/sentry.js';

// Initialize Sentry as early as possible. Safe no-op when not configured.
initSentry();

// Merge auth schema with main schema for complete database type support
const combinedSchema = { ...schema, ...authSchema } as typeof schema & typeof authSchema;

// Run database migrations on startup unless explicitly skipped.
// Set SKIP_MIGRATIONS=true when migrations are managed externally (e.g. via Supabase MCP).
if (process.env.SKIP_MIGRATIONS === 'true') {
  logger.info('SKIP_MIGRATIONS=true, skipping database migrations');
} else {
  logger.info('Running database migrations...');
  try {
    await runMigrations({ logger });
    logger.info('Database migrations completed successfully');
  } catch (migrationError) {
    logger.error({ err: migrationError }, 'Database migrations failed');
    process.exit(1);
  }
}

// Import route registration functions
import { register as registerAuthRoutes } from './routes/auth.js';
import { register as registerProfileRoutes } from './routes/profile.js';
import { register as registerVesselsRoutes } from './routes/vessels.js';
import { register as registerSeaTimeRoutes } from './routes/sea-time.js';
import { register as registerAisRoutes } from './routes/ais.js';
import { register as registerReportsRoutes } from './routes/reports.js';
import { register as registerNotificationsRoutes } from './routes/notifications.js';
import { register as registerTrackingRoutes } from './routes/tracking.js';
import { register as registerSubscriptionRoutes } from './routes/subscription.js';
import { register as registerUsersRoutes } from './routes/users.js';

// Create application with schema for full database type support
export const app = await createApplication(combinedSchema);

// Storage is optional — only enable if AWS_S3_BUCKET or STORAGE_API_BASE_URL is set.
// Profile image upload features will be unavailable when storage is not configured.
if (process.env.AWS_S3_BUCKET || process.env.STORAGE_API_BASE_URL) {
  try {
    app.withStorage();
    logger.info('Storage enabled');
  } catch (storageError) {
    logger.warn({ err: storageError }, 'Storage initialization failed, continuing without storage');
  }
} else {
  logger.info('Storage not configured, profile image features will be unavailable');
}

app.withAuth();

// Export App type for use in route files
export type App = typeof app;

// Register routes - add your route modules here
// IMPORTANT: Always use registration functions to avoid circular dependency issues
registerAuthRoutes(app, app.fastify);
registerProfileRoutes(app, app.fastify);
registerVesselsRoutes(app, app.fastify);
registerSeaTimeRoutes(app, app.fastify);
registerAisRoutes(app, app.fastify);
registerReportsRoutes(app, app.fastify);
registerNotificationsRoutes(app, app.fastify);
registerTrackingRoutes(app, app.fastify);
registerSubscriptionRoutes(app, app.fastify);
registerUsersRoutes(app, app.fastify);

// Health check — used by frontend warm-up ping (authRetry.ts) and monitoring
app.fastify.get('/api/health', async () => ({ status: 'ok' }));

await app.run();
app.logger.info('Application running');

// Start the background scheduler for AIS checks and notifications
import('./services/scheduler.js').then(({ startScheduler }) => {
  startScheduler(app).catch((err) => {
    app.logger.error({ err }, 'Failed to start scheduler');
  });
});
