// Re-export schema from the actual schema location
// The schema is defined in ./schema/schema.ts because drizzle.config.ts
// points to the ./src/db/schema/ directory for schema files
export * from './schema/schema.js';
