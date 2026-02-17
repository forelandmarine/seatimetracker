import { runMigrations, logger } from "@specific-dev/framework";

runMigrations({ logger })
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
