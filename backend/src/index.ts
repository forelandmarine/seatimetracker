import { createApplication, runMigrations, logger } from "@specific-dev/framework";
import * as schema from './db/schema.js';
import * as authSchema from './db/auth-schema.js';

// Merge auth schema with main schema for complete database type support
const combinedSchema = { ...schema, ...authSchema } as typeof schema & typeof authSchema;

// Run database migrations on startup to ensure all tables exist
logger.info('Running database migrations...');
try {
  await runMigrations({ logger });
  logger.info('Database migrations completed successfully');
} catch (migrationError) {
  logger.error({ err: migrationError }, 'Database migrations failed');
  process.exit(1);
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
app.withStorage();
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
