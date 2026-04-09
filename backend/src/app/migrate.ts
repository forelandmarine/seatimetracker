/**
 * Drizzle migration runner — replaces @specific-dev/framework's runMigrations.
 *
 * Sprint 7: dropped vendored framework. We now apply schema changes
 * via Supabase MCP, so this is mostly a no-op when SKIP_MIGRATIONS=true.
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

interface RunMigrationsOptions {
  migrationsFolder?: string;
  logger?: { info: (...args: any[]) => void; error: (...args: any[]) => void };
}

export async function runMigrations(options?: RunMigrationsOptions): Promise<void> {
  const folder = options?.migrationsFolder || './drizzle';
  const log = options?.logger;
  const url = process.env.DATABASE_URL;

  if (!url) {
    log?.info({ folder }, 'No DATABASE_URL set, skipping migrations');
    return;
  }

  log?.info({ folder, database: 'postgres' }, 'Starting migration process');
  const client = postgres(url, { prepare: false });
  const db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: folder });
    log?.info('Migrations applied successfully');
  } finally {
    await client.end();
  }
}
