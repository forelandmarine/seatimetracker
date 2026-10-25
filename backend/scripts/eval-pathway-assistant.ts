/**
 * End-to-end check of the pathway assistant without touching any real database:
 * loads the library into in-memory Postgres (PGlite), then asks a fixed set of
 * questions through the same askPathwayQuestion() the API uses.
 *
 *   PATHWAY_EVAL_AUTHORITY=uscg npx tsx scripts/eval-pathway-assistant.ts out.json
 *   (PATHWAY_ASSISTANT_MODEL / PATHWAY_ASSISTANT_EFFORT pick the model, as in the API)
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

/** A fictional crew member per authority, so personalised answers have figures to work from. */
const DEMO_USERS: Record<string, string> = {
  mca: `Authority: MCA. Department: deck. Sector chosen in the app: yachting.
Target certificate: rule id mca/app/oow-yachts-3000gt.
Yacht service: actual seagoing days 212 (use this for any seagoing service requirement). Stand-by days 30. Yard days 75, of which 75 credited. In port 14, not counted. Combined sea + stand-by + credited yard: 317 (this is not seagoing service). By logged service type: actual_sea_service 212, standby_service 30, yard_service 75, service_in_port 14.
Vessels:
- Corsair: yacht, 52m, 499 GT, 241 logged days (all service types)
- Sea Breeze: yacht, 38m, 290 GT, 90 logged days (all service types)`,
  uscg: `Authority: USCG. Department: deck. Sector chosen in the app: yachting.
Target certificate: rule id uscg/app/uscg-master-nc-200grt.
USCG creditable days (8-hour day, 46 CFR 10.107): 310. Use this for any days of service requirement.
Provisional days (4 to 8 hours on vessels under 100 GRT, creditable only if the Coast Guard accepts the schedule): 95.
Days of 4 to 8 hours on vessels of 100 GRT or more (do not make a day): 12. Under 4 hours: 20.
Stand-by days 25 and yard days 40 are logged but not credited as USCG sea service.
Vessels:
- Liberty: yacht, 45m, 380 GT, 330 logged days (all service types)
- Osprey: yacht, 18m, 60 GT, 160 logged days (all service types)`,
  amsa: `Authority: AMSA. Department: deck. Sector chosen in the app: commercial.
Target certificate: rule id amsa/app/amsa-master-24m-nc.
AMSA days underway (8-hour day, Marine Order 505): 290. Use this for any sea service requirement.
Days gained while not underway (stand-by, yard, port): 60. These count only up to 15 per cent of required deck service or 33 per cent of engineering service.
Leftover qualifying hours not yet making a whole day: 5.
Days from logged navigational watch hours: 120. From engine-room watch hours: 0.
Holds a completed AMSA task book: no.
Vessels:
- Reef Runner: commercial, 22m, 85 GT, 310 logged days (all service types)
- Whitsunday Star: commercial, 15m, 40 GT, 40 logged days (all service types)`,
  mnz: `Authority: MNZ. Department: deck. Sector chosen in the app: commercial.
Target certificate: rule id mnz/app/mnz-srl.
Maritime NZ days inside the 10-year window: actual sea 140, stand-by 10, yard 5, in port 8 (not credited).
Combined sea + stand-by + yard: 155 (the combination the yacht certificates use; not sea service on its own).
Watchkeeping days from logged watch hours: 30. Hours on board (for certificates stated in hours): 1450.
Holds a training record book or completed cadet programme: no.
Vessels:
- Kahu: commercial, 12m, 18 GT, 150 logged days (all service types)
- Tui: commercial, 9m, 6 GT, 13 logged days (all service types)`,
};

const QUESTIONS: Record<string, string[]> = {
  mca: [
    'Does yard time count toward my OOW Yachts <3000 GT?',
    'What courses do I need before I can apply for my OOW Yachts <3000 GT notice of eligibility?',
    'Who can sign my sea service testimonials?',
    'Is ECDIS mandatory for OOW Yachts?',
    'How often do I need to revalidate my CoC and what do I need to do it?',
    'Can time on a commercial workboat count toward my yacht OOW?',
    'What is the new Yacht Unlimited certificate?',
    'What is the best restaurant in Antibes?',
  ],
  uscg: [
    'How many days of sea service do I need for my Master 200 GRT near coastal?',
    'Do my 4-hour days on the 18 metre boat count?',
    'How do I document sea time on a privately owned yacht?',
    'What does a first-time MMC application need besides sea time?',
    'How often do I renew my MMC and what do I need?',
    'Do I need a TWIC card?',
    'What is the difference between OUPV and a Master 25 ton?',
    'What is the best bar in Fort Lauderdale?',
  ],
  amsa: [
    'How much sea service do I need for Master less than 24 metres?',
    'Do my days alongside count toward my Master <24m?',
    'What is a task book and would it shorten my sea time?',
    'What do I need to move up from Coxswain Grade 1 to Master <24m?',
    'Can sea time on a foreign-flagged superyacht count toward an AMSA certificate?',
    'What medical do I need for a near coastal certificate?',
    'How do I revalidate my certificate of competency?',
    'Where is the best surf in Byron Bay?',
  ],
  mnz: [
    'How much sea time do I need for Skipper Restricted Limits?',
    'Does sea time older than 10 years count?',
    'What do I need to go from SRL to Skipper Coastal/Offshore?',
    'Can I use my MCA yacht sea time toward a Maritime NZ certificate?',
    'What medical certificate do I need?',
    'How do I revalidate my certificate?',
    'What is SeaCert and does it change my existing certificate?',
    'Which is the best bach to rent in Coromandel?',
  ],
};

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
  const authority = process.env.PATHWAY_EVAL_AUTHORITY || 'mca';
  const chunks = [...docsFromMarkdown(authority), ...docsFromAppRules(authority as any)];
  for (let i = 0; i < chunks.length; i += 200) {
    await db.insert(schema.knowledge_chunks).values(chunks.slice(i, i + 200) as any);
  }
  console.log(`Loaded ${chunks.length} ${authority} passages. Model ${ASSISTANT_MODEL}.`);

  const results = [];
  for (const question of QUESTIONS[authority]) {
    const started = Date.now();
    try {
      const r = await askPathwayQuestion({ db, authority, question, userContext: DEMO_USERS[authority], history: [], logger: console as any });
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
