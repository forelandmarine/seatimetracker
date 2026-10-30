/**
 * "Explain training pathways": answers crew questions about certification from the
 * library in `knowledge_chunks`, never from the model's own memory of the rules.
 *
 * Each request gives the model three things:
 *  1. A frozen system prompt holding the app's full requirement table for the
 *     authority (cached, so repeat questions pay a fraction of its cost).
 *  2. The user's own figures (pathway, target, qualifying days by type and sector),
 *     worked out here by the same counting code as the reports, so the model never
 *     has to count anything itself.
 *  3. A `search_library` tool over the official guidance and provider notes.
 *
 * The final turn is constrained to ANSWER_SCHEMA, and every cited passage id is
 * checked against what the model was actually shown before it reaches the app.
 */
import Anthropic from '@anthropic-ai/sdk';
import { and, asc, eq, sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { amsaCreditableDays, countDistinctSeaDays, mnzCreditableDays, qualifyingSeaDays, uscgCreditableDays } from './seaTime.js';

// Sonnet 5.5 at medium effort matched Opus 5.5 on the eval at about a third of the cost
// (scripts/eval-pathway-assistant.ts, 2026-10-25); Haiku 5.5 got stage-specific rules wrong.
export const ASSISTANT_MODEL = process.env.PATHWAY_ASSISTANT_MODEL || 'claude-sonnet-5-5';
const ASSISTANT_EFFORT = (process.env.PATHWAY_ASSISTANT_EFFORT || 'medium') as 'low' | 'medium' | 'high';
const MAX_SEARCHES = 4;
const SEARCH_RESULTS = 8;

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-opus-5']);

/** USD per million tokens, for the cost column only. Cache writes bill at 1.25x input. */
const PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

/**
 * Authorities with a library. `short` is how answers refer to the body that decides,
 * `stages` names its own application milestones for the stage-search rule, and
 * `spelling` matches what its crew read in their own guidance.
 */
export const AUTHORITIES: Record<string, { name: string; short: string; stages: string; spelling: string }> = {
  mca: {
    name: 'the UK Maritime and Coastguard Agency (MCA)',
    short: 'the MCA',
    stages: 'the Notice of Eligibility (NoE), the oral exam, issue of the CoC, revalidation',
    spelling: 'British English',
  },
  uscg: {
    name: 'the United States Coast Guard (USCG) and its National Maritime Center (NMC)',
    short: 'the Coast Guard (NMC)',
    stages: 'the MMC application, approval to test, the exam, issue of the credential, renewal',
    spelling: 'American English',
  },
  amsa: {
    name: 'the Australian Maritime Safety Authority (AMSA)',
    short: 'AMSA',
    stages: 'the application, the final assessment or oral exam, issue of the certificate, revalidation',
    spelling: 'Australian English',
  },
  mnz: {
    name: 'Maritime New Zealand',
    short: 'Maritime NZ',
    stages: 'the application, the oral exam or assessment, issue of the certificate, revalidation',
    spelling: 'New Zealand English',
  },
};

/**
 * Authorities answered in production. Maritime NZ has a library, but its guidance is
 * licensed for personal use only, so it stays off until Maritime NZ agrees to this use.
 * Override with PATHWAY_ASSISTANT_AUTHORITIES (comma-separated) once it does.
 */
const ENABLED_AUTHORITIES = new Set(
  (process.env.PATHWAY_ASSISTANT_AUTHORITIES || 'mca,uscg,amsa').split(',').map((a) => a.trim()).filter(Boolean),
);

export const isAuthorityEnabled = (authority: string) => !!AUTHORITIES[authority] && ENABLED_AUTHORITIES.has(authority);

export interface PathwaySource {
  id: string;
  title: string;
  ref: string | null;
  section: string | null;
  url: string | null;
  source_type: string;
}

export interface PathwayAnswer {
  in_scope: boolean;
  short_answer: string;
  steps: { title: string; detail: string }[];
  applies_to_you: string | null;
  follow_ups: string[];
  sources: PathwaySource[];
}

export interface AskResult {
  answer: PathwayAnswer;
  model: string;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number; costUsd: number };
}

const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['in_scope', 'short_answer', 'steps', 'applies_to_you', 'follow_ups', 'source_ids'],
  properties: {
    in_scope: {
      type: 'boolean',
      description: 'False when the library does not cover the question or it is not about seafarer training and certification.',
    },
    short_answer: { type: 'string', description: 'One to three plain sentences that answer the question directly.' },
    steps: {
      type: 'array',
      description: 'Ordered things the crew member has to do or have. Empty when the question needs no steps.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'detail'],
        properties: { title: { type: 'string' }, detail: { type: 'string' } },
      },
    },
    applies_to_you: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: "How this applies to the user's own logged service and target, using only the figures provided. Null when the question is general and their figures add nothing.",
    },
    follow_ups: { type: 'array', items: { type: 'string' }, description: 'Up to three short follow-up questions the user is likely to ask next.' },
    source_ids: { type: 'array', items: { type: 'string' }, description: 'Ids of the passages the answer relies on, most important first.' },
  },
} as const;

const SEARCH_TOOL: Anthropic.Beta.BetaTool = {
  name: 'search_library',
  description:
    'Full-text search over the official certification guidance (MSNs, MGNs, gov.uk pages) and paraphrased training-provider notes for this authority. Returns passages with ids. Use specific terms the documents would use, e.g. "yard service maximum days", "OOW yachts less than 3000 GT sea service", "notice of eligibility application". Search again with different wording if the first results miss.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['query'],
    properties: { query: { type: 'string', description: 'Search terms, a few words.' } },
  },
};

interface ChunkRow {
  id: string;
  doc_title: string;
  doc_ref: string | null;
  section: string | null;
  content: string;
  source_type: string;
  url: string | null;
  currency_note?: string | null;
  expired?: boolean;
}

type Db = any;

/** System prompts are built once per authority and reused, so the cache prefix never changes between requests. */
const systemPromptCache = new Map<string, Promise<{ text: string; rules: Map<string, ChunkRow> }>>();

async function loadSystemPrompt(db: Db, authority: string) {
  const rows: ChunkRow[] = await db
    .select({
      id: schema.knowledge_chunks.id,
      doc_title: schema.knowledge_chunks.doc_title,
      doc_ref: schema.knowledge_chunks.doc_ref,
      section: schema.knowledge_chunks.section,
      content: schema.knowledge_chunks.content,
      source_type: schema.knowledge_chunks.source_type,
      url: schema.knowledge_chunks.url,
    })
    .from(schema.knowledge_chunks)
    .where(and(eq(schema.knowledge_chunks.authority, authority), eq(schema.knowledge_chunks.source_type, 'app_rules')))
    .orderBy(asc(schema.knowledge_chunks.id));

  const table = rows.map((r) => `<rule id="${r.id}">\n${r.content}\n</rule>`).join('\n');
  const body = AUTHORITIES[authority];
  const text = `You explain seafarer training and certification pathways inside SeaTime Tracker, an app crew use to log sea service. You answer for ${body.name}.

How to answer:
- Answer only from the certificate table below and from passages returned by search_library. Do not rely on your own memory of the rules: they change, and an out-of-date answer can cost a crew member months. Search before answering anything the table does not settle (courses, exams, evidence, applications, what counts as sea service, edge cases).
- When a question is about a stage of the process (${body.stages}), search for that stage by name and answer for that stage only. What must be done at an early stage is often less than what is needed before the certificate is issued; say which applies.
- Official passages (source_type official) outrank provider notes. If they disagree, follow the official text.
- Provider notes are training providers' own explanations, not ${body.short}'s. Never state a requirement on a provider note alone: if only a provider note covers a point, say it is the provider's guidance and not confirmed by ${body.short}. Prefer saying the official guidance doesn't cover it over filling the gap from a provider.
- A passage's currency note can say that a newer policy letter, notice or amendment changes what it says (for example a longer grace period than the regulation text). The newer document wins: give the current rule, and search for the newer document by name if it is not already in front of you.
- A passage marked status="expired" comes from a notice that has lapsed. Never present it as the current rule. Prefer current documents; if only an expired notice covers the point, say so and suggest checking with ${body.short}.
- If neither the table nor the passages cover the question, set in_scope to false, say plainly that you could not find it in the guidance you hold, and suggest asking ${body.short} or an approved training provider. Never guess.
- Questions outside seafarer training and certification are out of scope; say so briefly.
- Write for a deckhand or engineer reading on a phone: short sentences, plain words, ${body.spelling}, no jargon without a short explanation. Do not use em dashes. Keep short_answer to three sentences at most and each step to one or two sentences.
- applies_to_you is for questions where the user's own figures change the answer, such as whether their logged service counts or how many more days they need. Leave it null when the answer is the same for everyone (courses, exams, forms, definitions, what a certificate is). When you use it, keep it to two sentences and compare like with like: seagoing days against a seagoing requirement, additional service against an additional requirement. Use the figures exactly as given and do simple subtraction only. Never invent service the user has not logged.
- Treat the user's figures as correct. Do not check them against each other or point out that totals differ: per-vessel days include every logged day, while qualifying totals leave some out by rule.
- The app's day counts are estimates from logged entries, counted under ${body.short}'s own day rules. ${body.short.charAt(0).toUpperCase() + body.short.slice(1)} makes the final decision on what counts, so do not promise eligibility.
- Cite every passage or rule you relied on in source_ids, using the ids exactly as shown.

Certificate table (the same rules the app's progress bars use):
${table}`;
  return { text, rules: new Map(rows.map((r) => [r.id, r])) };
}

function systemPrompt(db: Db, authority: string) {
  let p = systemPromptCache.get(authority);
  if (!p) {
    p = loadSystemPrompt(db, authority);
    // A failed load should not stick: let the next request try again.
    p.catch(() => systemPromptCache.delete(authority));
    systemPromptCache.set(authority, p);
  }
  return p;
}

/** Drop the cached prompt after re-ingesting the library, so new rules are picked up without a restart. */
export function clearSystemPromptCache() {
  systemPromptCache.clear();
}

/**
 * OR the query's stemmed terms together and rank by cover density, so a passage
 * matching most of the words wins without requiring every one of them. Rank is
 * divided by log length (flag 1) so long raw-PDF passages don't win on bulk alone.
 * Passages holding every term are doubled. Official text is nudged above provider
 * notes on a near tie, and notices that have lapsed by their own text are pushed
 * well down: kept for history, not for rules.
 */
export async function searchLibrary(db: Db, authority: string, query: string, limit = SEARCH_RESULTS): Promise<ChunkRow[]> {
  const result = await db.execute(sql`
    WITH q AS (
      SELECT to_tsquery('english', array_to_string(tsvector_to_array(to_tsvector('english', ${query})), ' | ')) AS query
    )
    SELECT c.id, c.doc_title, c.doc_ref, c.section, c.content, c.source_type, c.url, c.currency_note, c.expired,
           ts_rank_cd(c.tsv, q.query, 1)
             * CASE WHEN c.source_type = 'official' THEN 1.2 ELSE 1 END
             * CASE WHEN c.expired THEN 0.4 ELSE 1 END
             * CASE WHEN c.tsv @@ plainto_tsquery('english', ${query}) THEN 2 ELSE 1 END AS rank
    FROM knowledge_chunks c, q
    WHERE c.authority = ${authority}
      AND c.source_type <> 'app_rules'
      AND q.query::text <> ''
      AND c.tsv @@ q.query
    ORDER BY rank DESC
    LIMIT ${limit}
  `);
  return (Array.isArray(result) ? result : result.rows) as ChunkRow[];
}

function renderPassages(rows: ChunkRow[]): string {
  if (rows.length === 0) return 'No passages matched. Try different wording.';
  return rows
    .map((r) => {
      const where = [r.doc_ref, r.section].filter(Boolean).join(', ');
      // The currency note travels with every passage, not just expired ones: it is where
      // the library records that a newer policy changes what older regulation text says.
      const note = (r.currency_note || '').replace(/"/g, "'").slice(0, 400);
      const status = r.expired ? ` status="expired: ${note}"` : note ? ` currency="${note}"` : '';
      return `<passage id="${r.id}" source_type="${r.source_type}" document="${r.doc_title}"${where ? ` where="${where}"` : ''}${status}>\n${r.content}\n</passage>`;
    })
    .join('\n');
}

/**
 * The user's own figures, counted the way /api/reports/summary counts them
 * (confirmed entries only, calendar days deduplicated), under the authority's own
 * day rules: MCA 4 hours per date with yard capped, USCG and AMSA an 8-hour day,
 * Maritime NZ inside a 10-year window. Each figure is labelled with what it can
 * answer, because the cheaper models otherwise subtract the wrong total.
 */
export async function buildUserContext(db: Db, user: any, authority: string, targetId: string | null): Promise<string> {
  const entries = (
    await db.query.sea_time_entries.findMany({
      with: { vessel: true },
      where: eq(schema.sea_time_entries.user_id, user.id),
    })
  ).filter((e: any) => e.status === 'confirmed');

  const vessels = new Map<string, any>();
  for (const e of entries) if (e.vessel) vessels.set(e.vessel.id, e.vessel);
  const vesselLines = [...vessels.values()].map((v) => {
    const days = countDistinctSeaDays(entries.filter((e: any) => e.vessel?.id === v.id));
    const size = [v.length_metres && `${Number(v.length_metres)}m`, v.gross_tonnes && `${Number(v.gross_tonnes)} GT`].filter(Boolean).join(', ');
    return `- ${v.vessel_name}: ${v.sector === 'commercial' ? 'commercial' : 'yacht'}${size ? `, ${size}` : ', size not recorded'}, ${days} logged days (all service types)`;
  });

  return [
    `Authority: ${authority.toUpperCase()}. Department: ${user.department || 'not set (treat as deck)'}. Sector chosen in the app: ${user.vessel_sector || 'yachting'}.`,
    `Target certificate: ${targetId ? `rule id ${authority}/app/${targetId}` : 'not chosen'}.`,
    entries.length === 0 ? 'No confirmed sea service logged yet.' : serviceLines(authority, entries, user),
    vesselLines.length ? `Vessels:\n${vesselLines.join('\n')}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function serviceLines(authority: string, entries: any[], user: any): string {
  switch (authority) {
    case 'uscg': {
      const u = uscgCreditableDays(entries);
      return [
        `USCG creditable days (8-hour day, 46 CFR 10.107): ${u.creditable_total}. Use this for any days of service requirement.`,
        u.two_watch_days ? `Of these, ${u.two_watch_days} days of 12 hours or more on vessels the user marked as two-watch were credited as 1.5 days each (+${u.two_watch_bonus}). The Coast Guard decides whether the vessel holds that authorisation.` : null,
        `Provisional days (4 to 8 hours on vessels under 100 GRT, creditable only if the Coast Guard accepts the schedule): ${u.provisional}.`,
        `Days of 4 to 8 hours on vessels of 100 GRT or more (do not make a day): ${u.short_of_standard_day}. Under 4 hours: ${u.below_minimum}.`,
        u.awaiting_tonnage ? `Days waiting for the vessel tonnage to be recorded: ${u.awaiting_tonnage} (${u.vessels_awaiting_tonnage.join(', ')}).` : null,
        `Stand-by days ${u.standby} and yard days ${u.yard} are logged but not credited as USCG sea service.`,
      ].filter(Boolean).join('\n');
    }
    case 'amsa': {
      const a = amsaCreditableDays(entries);
      return [
        `AMSA days underway (8-hour day, Marine Order 505): ${a.underway}. Use this for any sea service requirement.`,
        `Days gained while not underway (stand-by, yard, port): ${a.not_underway}. These count only up to 15 per cent of required deck service or 33 per cent of engineering service.`,
        `Leftover qualifying hours not yet making a whole day: ${a.part_day_hours}.`,
        `Days from logged navigational watch hours: ${a.navigational_watch}. From engine-room watch hours: ${a.engineering_watch}.`,
        `Holds a completed AMSA task book: ${user.has_record_book ? 'yes' : 'no'}.`,
      ].join('\n');
    }
    case 'mnz': {
      const m = mnzCreditableDays(entries);
      return [
        `Maritime NZ days inside the 10-year window: actual sea ${m.actual}, stand-by ${m.standby}, yard ${m.yard}, in port ${m.port} (not credited).`,
        `Combined sea + stand-by + yard: ${m.qualifying_total} (the combination the yacht certificates use; not sea service on its own).`,
        `Watchkeeping days from logged watch hours: ${m.watchkeeping}. Hours on board (for certificates stated in hours): ${m.hours}.`,
        m.outside_window ? `Days older than 10 years, not counted: ${m.outside_window}.` : null,
        `Holds a training record book or completed cadet programme: ${user.has_record_book ? 'yes' : 'no'}.`,
      ].filter(Boolean).join('\n');
    }
    default: {
      // MCA yacht deck CoCs only credit yacht service, so the sectors are counted apart.
      const isCommercial = (e: any) => e.vessel?.sector === 'commercial';
      const yacht = entries.filter((e) => !isCommercial(e));
      const commercial = entries.filter(isCommercial);
      return [mcaLine('Yacht service', yacht), commercial.length ? mcaLine('Commercial vessel service', commercial) : null].filter(Boolean).join('\n');
    }
  }
}

function mcaLine(label: string, list: any[]): string {
  const b = qualifyingSeaDays(list);
  const byType = new Map<string, any[]>();
  for (const e of list) {
    const type = e.service_type || 'actual_sea_service';
    byType.set(type, [...(byType.get(type) ?? []), e]);
  }
  const types = [...byType.entries()].map(([t, es]) => `${t} ${countDistinctSeaDays(es)}`).join(', ');
  return `${label}: actual seagoing days ${b.actual} (use this for any seagoing service requirement). Stand-by days ${b.standby}. Yard days ${b.yard}, of which ${b.yard_credited} credited. In port ${b.port}, not counted. Combined sea + stand-by + credited yard: ${b.qualifying_total} (this is not seagoing service). By logged service type: ${types || 'none'}.`;
}

function costUsd(model: string, u: { input: number; output: number; cacheRead: number; cacheWrite: number }) {
  const p = PRICING[model] ?? PRICING['claude-opus-5-5'];
  return (u.input * p.input + u.cacheWrite * p.input * 1.25 + u.cacheRead * p.cacheRead + u.output * p.output) / 1_000_000;
}

const OUT_OF_SCOPE: Omit<PathwayAnswer, 'sources'> = {
  in_scope: false,
  short_answer: "I couldn't answer that one. Try asking about a certificate, a course or how your sea time counts.",
  steps: [],
  applies_to_you: null,
  follow_ups: [],
};

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

export async function askPathwayQuestion(opts: {
  db: Db;
  authority: string;
  question: string;
  userContext: string;
  history: { question: string; answer: PathwayAnswer }[];
  logger?: { warn: (o: any, m: string) => void };
}): Promise<AskResult> {
  const { db, authority, question, userContext, history } = opts;
  const { text: system, rules } = await systemPrompt(db, authority);

  // Earlier turns are replayed as plain text, append-only, so the cached prefix holds across a conversation.
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const turn of history) {
    messages.push({ role: 'user', content: turn.question });
    messages.push({ role: 'assistant', content: renderAnswerText(turn.answer) });
  }
  messages.push({
    role: 'user',
    content: `<user_figures>\n${userContext}\n</user_figures>\n\nQuestion: ${question}`,
  });

  const seen = new Map<string, ChunkRow>(rules);
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const useFallback = FALLBACK_MODELS.has(ASSISTANT_MODEL);

  let searches = 0;
  // One call per round of searches, plus a final call that must answer. The cap on
  // rounds is only a backstop: `searches` reaches MAX_SEARCHES first.
  for (let round = 0; round <= MAX_SEARCHES; round++) {
    // Once the search budget is spent the model is made to answer from what it has.
    // Only tool_choice changes on that call; the tool list stays the same for the cache.
    const mustAnswer = searches >= MAX_SEARCHES || round === MAX_SEARCHES;
    const response = await anthropic().beta.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 16000,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      cache_control: { type: 'ephemeral' },
      tools: [SEARCH_TOOL],
      ...(mustAnswer ? { tool_choice: { type: 'none' as const } } : {}),
      output_config: { effort: ASSISTANT_EFFORT, format: { type: 'json_schema', schema: ANSWER_SCHEMA as any } },
      messages,
      ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as any } : {}),
    });

    usage.input += response.usage.input_tokens;
    usage.output += response.usage.output_tokens;
    usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += response.usage.cache_creation_input_tokens ?? 0;

    if (response.stop_reason === 'refusal') {
      opts.logger?.warn({ category: response.stop_details?.category }, 'Pathway assistant refusal');
      return finish({ ...OUT_OF_SCOPE, source_ids: [] });
    }

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (response.stop_reason === 'tool_use' && toolUses.length && !mustAnswer) {
      messages.push({ role: 'assistant', content: response.content as any });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const use of toolUses) {
        if (searches >= MAX_SEARCHES) {
          results.push({ type: 'tool_result', tool_use_id: use.id, content: 'Search limit reached. Answer now from what you have.' });
          continue;
        }
        searches++;
        const query = String((use.input as any)?.query ?? '').slice(0, 300);
        const rows = await searchLibrary(db, authority, query);
        for (const r of rows) seen.set(r.id, r);
        results.push({ type: 'tool_result', tool_use_id: use.id, content: renderPassages(rows) });
      }
      messages.push({ role: 'user', content: results });
      continue;
    }

    const text = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    // A schema-valid but empty answer ("placeholder", a few words) is a failure, not an
    // answer: throwing means the user sees a retry message and is not charged a question.
    if (!parsed || String(parsed.short_answer ?? '').trim().split(/\s+/).length < 6) {
      opts.logger?.warn({ stop: response.stop_reason, text: text.slice(0, 200) }, 'Pathway assistant returned no usable answer');
      throw new Error('Pathway assistant returned no usable answer');
    }
    return finish(parsed);
  }
  opts.logger?.warn({ searches }, 'Pathway assistant ran out of rounds without answering');
  return finish({ ...OUT_OF_SCOPE, source_ids: [] });

  function finish(raw: Omit<PathwayAnswer, 'sources'> & { source_ids: string[] }): AskResult {
    // Only passages the model was actually shown can be cited; anything else is dropped.
    const sources: PathwaySource[] = [];
    for (const id of raw.source_ids ?? []) {
      const row = seen.get(id);
      if (!row || sources.some((s) => s.id === id)) continue;
      sources.push({ id, title: row.doc_title, ref: row.doc_ref, section: row.section, url: row.url, source_type: row.source_type });
    }
    const answer: PathwayAnswer = {
      in_scope: !!raw.in_scope,
      short_answer: String(raw.short_answer ?? ''),
      steps: Array.isArray(raw.steps) ? raw.steps.slice(0, 10) : [],
      applies_to_you: raw.applies_to_you || null,
      follow_ups: Array.isArray(raw.follow_ups) ? raw.follow_ups.slice(0, 3) : [],
      sources: sources.slice(0, 6),
    };
    return { answer, model: ASSISTANT_MODEL, usage: { ...usage, costUsd: costUsd(ASSISTANT_MODEL, usage) } };
  }
}

function renderAnswerText(a: PathwayAnswer): string {
  const parts = [a.short_answer];
  a.steps.forEach((s, i) => parts.push(`${i + 1}. ${s.title}: ${s.detail}`));
  if (a.applies_to_you) parts.push(`For you: ${a.applies_to_you}`);
  return parts.join('\n');
}
