/**
 * End-to-end check of the pathway assistant without touching any real database:
 * loads the library into in-memory Postgres (PGlite), then asks a fixed set of
 * questions through the same askPathwayQuestion() the API uses.
 *
 *   PATHWAY_ASSISTANT_MODEL=claude-haiku-5-5 npx tsx scripts/eval-pathway-assistant.ts out.json
 *
 * Needs ANTHROPIC_API_KEY (read from backend/.env) and @electric-sql/pglite
 * (install with `npm install --no-save @electric-sql/pglite`). Costs real money:
 * roughly the per-question cost times the number of questions.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(__dirname, '../.env');
if (!process.env.ANTHROPIC_API_KEY && fs.existsSync(envFile)) {
  const match = fs.readFileSync(envFile, 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m);
  if (match) process.env.ANTHROPIC_API_KEY = match[1].trim();
}

/** A fictional crew member, so personalised answers have figures to work from. */
const DEMO_USER = `Authority: MCA. Department: deck. Sector chosen in the app: yachting.
Target certificate: rule id mca/app/oow-yachts-3000gt.
Yacht service: actual seagoing days 212 (use this for any seagoing service requirement). Stand-by days 30. Yard days 75, of which 75 credited. In port 14, not counted. Combined sea + stand-by + credited yard: 317 (this is not seagoing service). By logged service type: actual_sea_service 212, standby_service 30, yard_service 75, service_in_port 14.
Vessels:
- Corsair: yacht, 52m, 499 GT, 241 logged days (all service types)
- Sea Breeze: yacht, 38m, 290 GT, 90 logged days (all service types)`;

const QUESTIONS = [
  'Does yard time count toward my OOW Yachts <3000 GT?',
  'What courses do I need before I can apply for my OOW Yachts <3000 GT notice of eligibility?',
  'Who can sign my sea service testimonials?',
  'Is ECDIS mandatory for OOW Yachts?',
  'How often do I need to revalidate my CoC and what do I need to do it?',
  'Can time on a commercial workboat count toward my yacht OOW?',
  'What is the new Yacht Unlimited certificate?',
  'What is the best restaurant in Antibes?',
];

async function main() {
  const out = process.argv[2] || 'pathway-eval.json';
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('../src/db/schema.js');
  const { docsFromMarkdown, docsFromAppRules } = await import('./ingest-knowledge.js');
  const { askPathwayQuestion, ASSISTANT_MODEL } = await import('../src/utils/pathwayAssistant.js');

  const client = new PGlite();
  await client.exec(fs.readFileSync(path.resolve(__dirname, '../src/db/manual-migrations/2026-10-23_pathway_assistant.sql'), 'utf8'));
  const db = drizzle(client, { schema });
  const chunks = [...docsFromMarkdown('mca'), ...docsFromAppRules('mca' as any)];
  for (let i = 0; i < chunks.length; i += 200) {
    await db.insert(schema.knowledge_chunks).values(chunks.slice(i, i + 200) as any);
  }
  console.log(`Loaded ${chunks.length} passages. Model ${ASSISTANT_MODEL}.`);

  const results = [];
  for (const question of QUESTIONS) {
    const started = Date.now();
    try {
      const r = await askPathwayQuestion({ db, authority: 'mca', question, userContext: DEMO_USER, history: [], logger: console as any });
      const seconds = (Date.now() - started) / 1000;
      results.push({ question, seconds, ...r });
      console.log(`\n### ${question}\n${seconds.toFixed(1)}s, $${r.usage.costUsd.toFixed(4)}, in ${r.usage.input} (+${r.usage.cacheRead} cached, ${r.usage.cacheWrite} written), out ${r.usage.output}`);
      console.log(JSON.stringify(r.answer, null, 2));
    } catch (err: any) {
      results.push({ question, error: String(err?.message ?? err) });
      console.log(`\n### ${question}\nFAILED: ${err?.message ?? err}`);
    }
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  const total = results.reduce((n, r: any) => n + (r.usage?.costUsd ?? 0), 0);
  console.log(`\nTotal $${total.toFixed(4)} for ${results.length} questions, avg $${(total / results.length).toFixed(4)}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
