import { defineConfig } from 'drizzle-kit';

// Build config conditionally based on DATABASE_URL
const config = {
  schema: ['./src/db/schema.ts', './src/db/auth-schema.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  migrations: {
    prefix: 'timestamp', // Ensures unique migration filenames across branches
  },
} as any;

// Only add database credentials if DATABASE_URL is provided
// This prevents drizzle-kit from trying to connect when using PGlite locally
if (process.env.DATABASE_URL) {
  config.dbCredentials = {
    url: process.env.DATABASE_URL,
  };
}

export default defineConfig(config);
