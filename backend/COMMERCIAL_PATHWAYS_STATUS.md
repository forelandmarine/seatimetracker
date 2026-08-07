# Commercial Pathways (CTV/workboat) — build status

Branch: `feat/commercial-pathways`. Everything here is **dark by default** behind the
`COMMERCIAL_PATHWAYS_ENABLED` env flag. With the flag unset/`false`, the live yachting
app is completely unaffected: no GeoJSON is loaded, no classification runs, no new
columns are written.

## Done (integration layer — verified)

1. **Classifier vendored** → `src/utils/seaAreas/` (dependency-free) + 4 GeoJSON layers.
   Flag-gated lazy singleton (`singleton.ts`), robust data-dir resolver (`load.ts`),
   build copies `src/utils/seaAreas/data` → `dist/data`. Verified in-process
   (Barrow Deep → Cat D summer / none winter; open North Sea → tidal, no category).
2. **Schema** (`db/schema/schema.ts`, additive/nullable):
   - `ais_checks`: `area_category`, `is_tidal`, `season` (per fix)
   - `sea_time_entries`: `area_category`, `is_tidal`, `dual_capacity`,
     `is_categorised_water`, `qualifying_service jsonb` (engine reserve)
   - `vessels`: `is_workboat`, `is_high_speed`
3. **Classify at ingest** (`classifyFix.ts`) — wired into BOTH `ais_checks` insert sites
   (`routes/ais.ts`, `services/scheduler.ts`). Null-safe, never throws, `{}` when off.
   Season derived from the fix timestamp (MSN 1837 Amdt 3: summer Apr–Oct, winter Nov–Mar).
4. **Aggregate to entry** (`aggregate.ts` pure + `enrichEntry.ts` writer) — most-exposed
   category (D>C>B>A) + any-tidal + is_categorised_water. Writer is flag-gated/best-effort.

Typecheck: 0 errors introduced by this work (the ~388 pre-existing route errors are a
separate fastify/pino typing backlog; CI typecheck is `continue-on-error`).

## Migrations — NOT applied (code-only handoff)

Apply against Supabase yourself (idempotent, `ADD COLUMN IF NOT EXISTS`, safe to re-run):
`src/db/manual-migrations/2026-07-09_ctv_workboat_foundation.sql` then
`src/db/manual-migrations/2026-08-07_ctv_classification_columns.sql`.
NOTE: `drizzle-kit generate` is unusable here — its meta snapshots are out of sync with
the live DB and it emits create-table/re-add-column statements that fail on prod. Use the
hand-written idempotent SQL until the snapshots are reconciled.

## Remaining seams (small)

- **Wire `enrichEntryClassification(app, entry)`** in at ONE point after sea-time entry
  creation, when enabling the flag (deliberately not threaded through the ~12 mutation
  sites while dark).
- **Frontend surface** (informational, read-only) — not started.

## Not started — the qualifying-service engine (tier D, the big piece)

`src/utils/pathways/` — rule modules per certificate (CTV/workboat Master & Mate,
Boatmaster, RYA/BML tidal-mileage, MCA CoC coastal/limited) that consume the classified
inputs + distance/safe-haven/watchkeeping/vessel-type and decide what a day counts toward,
writing `sea_time_entries.qualifying_service`. **Deliberately deferred:** land + enable the
integration, validate classification against real AIS tracks, THEN encode pathways.

## Launch gate (D2) — MCA/TSN

Until the pending MCA TSN determination lands (Dan via `infoline@mcga.gov.uk`), present any
output as **indicative / tracking only** — do NOT market "MCA-compliant certificate
evidence". This gates messaging, not the build.

Pointers: `HANDOFF-ENGINE.md`, `SEA_AREAS_INTEGRATION.md`, memory
`seatime_ctv_workboat_expansion`, `seatime_seaareas_tool`.
