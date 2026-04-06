import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['./src/db/schema.ts', './src/db/auth-schema.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  ...(process.env.DATABASE_URL && {
    dbCredentials: {
      url: process.env.DATABASE_URL,
    },
  }),
  // PGlite doesn't need connection details - migrations are applied in code
  // In production with DATABASE_URL, drizzle-kit can connect to Neon
  migrations: {
    prefix: 'timestamp', // Ensures unique migration filenames across branches
  },
});
