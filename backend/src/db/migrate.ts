import { runMigrations } from "../app/migrate.js";
import { logger } from "../app/logger.js";

runMigrations({ logger })
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
