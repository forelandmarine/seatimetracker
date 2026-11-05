-- Route selection: the route the user is taking to their target certification
-- (an id from the app's constants/certRoutes.ts, null = the default route) and
-- the date that route counts service from (college registration, Action Plan;
-- null = all service counts).
-- Railway runs with SKIP_MIGRATIONS=true: apply this to production by hand
-- before the backend that selects the columns is deployed.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "target_route" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "route_start_date" date;
