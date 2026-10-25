/**
 * Load the pathway assistant's library into `knowledge_chunks`.
 *
 *   DATABASE_URL=... npx tsx scripts/ingest-knowledge.ts mca            # write
 *   npx tsx scripts/ingest-knowledge.ts mca --dry-run                   # print stats only
 *
 * Reads every markdown file under knowledge/<authority>/ (official/ and providers/),
 * plus the app's own requirement tables from constants/, splits them into passages
 * under their heading path, and replaces each document's rows wholesale so a
 * re-run after editing a file leaves no stale passages behind.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import type { MaritimeAuthority, MCARequirement } from '../../constants/mcaRequirements';
// The app's constants are CommonJS to Node (the root package is not "type": "module"),
// so named imports fail; load the module and read its exports instead.
import * as requirementsModule from '../../constants/mcaRequirements';
const requirements: typeof requirementsModule = (requirementsModule as any).default ?? requirementsModule;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_ROOT = path.resolve(__dirname, '../knowledge');

/** Roughly 450 tokens: long enough to keep a rule with its conditions, short enough to rank well. */
const MAX_CHUNK_CHARS = 1800;

export interface Chunk {
  id: string;
  authority: string;
  source_type: 'official' | 'provider' | 'app_rules';
  doc_id: string;
  doc_title: string;
  doc_ref: string | null;
  url: string | null;
  version_date: string | null;
  section: string | null;
  currency_note: string | null;
  expired: boolean;
  content: string;
}

interface Frontmatter {
  [key: string]: string;
}

function parseFrontmatter(raw: string): { meta: Frontmatter; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { meta: {}, body: raw };
  const meta: Frontmatter = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return { meta, body: raw.slice(match[0].length) };
}

/**
 * Split on headings, keeping the heading path as the passage's section. Paragraphs
 * are packed up to MAX_CHUNK_CHARS; a single paragraph or table larger than that is
 * cut on line boundaries so nothing is dropped.
 */
export function chunkMarkdown(body: string): { section: string | null; content: string }[] {
  const out: { section: string | null; content: string }[] = [];
  const headings: string[] = [];
  let buffer: string[] = [];

  const sectionPath = () => (headings.filter(Boolean).length ? headings.filter(Boolean).join(' > ') : null);
  const flush = () => {
    const text = buffer.join('\n\n').trim();
    buffer = [];
    if (!text) return;
    for (const piece of splitLong(text)) out.push({ section: sectionPath(), content: piece });
  };

  for (const raw of body.split(/\n{2,}/)) {
    const block = promoteNumberedTitle(raw);
    const heading = block.match(/^(#{1,4})\s+(.+)$/m);
    if (heading && block.trim().startsWith('#')) {
      flush();
      const level = heading[1].length;
      headings.length = level - 1;
      // PDF conversions often bold their headings; the asterisks only add noise to the section path.
      headings[level - 1] = heading[2].replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
      const rest = block.trim().split('\n').slice(1).join('\n').trim();
      if (rest) buffer.push(rest);
      continue;
    }
    const pending = buffer.join('\n\n').length;
    if (pending && pending + block.length > MAX_CHUNK_CHARS) flush();
    buffer.push(block.trim());
  }
  flush();
  return out;
}

/**
 * MCA PDFs set their top-level section titles as a bold numbered line on its own
 * ("**10. Notice of Eligibility (NOE)**", "**5.** **Yacht Service Requirements**")
 * rather than as headings. Without this every passage of a notice shares one
 * section path, so a search for "notice of eligibility" can't find section 10.
 * Only a one-line block counts, which leaves the multi-line contents list alone.
 */
export function promoteNumberedTitle(block: string): string {
  const line = block.trim();
  if (!line.startsWith('**') || line.includes('\n')) return block;
  const title = line.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  return /^\d{1,2}\.\s+[A-Z][^.]{2,90}$/.test(title) ? `### ${title}` : block;
}

function splitLong(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const pieces: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (current && current.length + line.length + 1 > MAX_CHUNK_CHARS) {
      pieces.push(current.trim());
      current = '';
    }
    current += line + '\n';
  }
  if (current.trim()) pieces.push(current.trim());
  return pieces;
}

export function docsFromMarkdown(authority: string): Chunk[] {
  const chunks: Chunk[] = [];
  for (const folder of ['official', 'providers'] as const) {
    const dir = path.join(KNOWLEDGE_ROOT, authority, folder);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
      const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(dir, file), 'utf8'));
      const docId = `${authority}/${folder}/${file.replace(/\.md$/, '')}`;
      chunkMarkdown(body).forEach((c, i) => {
        chunks.push({
          id: `${docId}#${i}`,
          authority,
          source_type: folder === 'official' ? 'official' : 'provider',
          doc_id: docId,
          doc_title: meta.title || file,
          doc_ref: meta.doc_ref || null,
          url: meta.url || null,
          version_date: meta.version_date || meta.retrieved || null,
          section: c.section,
          currency_note: meta.currency_note || null,
          expired: /^EXPIRED\b/i.test(meta.currency_note || ''),
          content: c.content,
        });
      });
    }
  }
  return chunks;
}

/** The app's requirement tables, one passage per certificate, so answers match the progress bars. */
export function docsFromAppRules(authority: MaritimeAuthority): Chunk[] {
  const chunks: Chunk[] = [];
  for (const department of ['deck', 'engineering'] as const) {
    for (const req of requirements.getRequirementsByAuthority(authority, department)) {
      chunks.push({
        id: `${authority}/app/${req.id}`,
        authority,
        source_type: 'app_rules',
        doc_id: `${authority}/app/${department}`,
        doc_title: `SeaTime Tracker ${authority.toUpperCase()} ${department} requirements`,
        doc_ref: req.regulation,
        url: null,
        version_date: null,
        section: req.title,
        currency_note: null,
        expired: false,
        content: renderRequirement(req, department),
      });
    }
  }
  return chunks;
}

function renderRequirement(req: MCARequirement, department: string): string {
  const lines = [`${req.title} (${department}, id ${req.id})`, `Regulation: ${req.regulation}`, req.description];
  if (req.totalDays) lines.push(`Headline qualifying service: ${req.totalDays} days`);
  if (req.watchkeepingDays) lines.push(`Of which watchkeeping: ${req.watchkeepingDays} days`);
  if (req.sectors) lines.push(`Shown for sectors: ${req.sectors.join(', ')}`);
  if (req.commercialService) {
    lines.push(req.commercialService === 'yacht_only'
      ? 'Only service on yachts counts toward this certificate.'
      : 'Service on commercial vessels also counts toward this certificate.');
  }
  for (const r of req.requirements) {
    lines.push(`- ${r.label}: ${r.value}`);
    for (const d of r.details ?? []) lines.push(`  - ${d}`);
  }
  for (const n of req.notes ?? []) lines.push(`Note: ${n}`);
  return lines.join('\n');
}

async function main() {
  const authority = (process.argv[2] || 'mca') as MaritimeAuthority;
  const dryRun = process.argv.includes('--dry-run');
  const chunks = [...docsFromMarkdown(authority), ...docsFromAppRules(authority)];

  const byDoc = new Map<string, Chunk[]>();
  for (const c of chunks) byDoc.set(c.doc_id, [...(byDoc.get(c.doc_id) ?? []), c]);
  const chars = chunks.reduce((n, c) => n + c.content.length, 0);
  console.log(`${authority}: ${byDoc.size} documents, ${chunks.length} passages, ~${Math.round(chars / 4 / 1000)}k tokens`);
  if (dryRun) return;

  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    await sql.begin(async (tx) => {
      // Documents removed from disk are removed from the library too.
      await tx`DELETE FROM knowledge_chunks WHERE authority = ${authority}`;
      for (const docChunks of byDoc.values()) {
        await tx`INSERT INTO knowledge_chunks ${tx(docChunks.map((c) => ({ ...c, updated_at: new Date() })))}`;
      }
    });
    console.log('Written.');
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
