// READ-ONLY. Exits 0 once the new deploy has written an ais_checks row.
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  const [r] = await sql`SELECT count(*)::int AS n, max(created_at) AS last FROM ais_checks WHERE created_at > '2026-09-13T06:35:38Z'`;
  console.log(`${r.n} ${r.last ? r.last.toISOString() : ''}`);
  process.exitCode = r.n > 0 ? 0 : 3;
} finally { await sql.end(); }
