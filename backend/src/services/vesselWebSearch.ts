/**
 * Vessel lookup: web-search fallback, used only when our own data finds no
 * name match. Claude Haiku 5.5 with the server-side web search tool, limited to
 * vessel tracking and yacht sites. Tested 2026-11 (10/14 right, about $0.02 and
 * 5 s a search). Returns [] on any failure so the app shows its no-results
 * pop-up; it never throws.
 */

import Anthropic from '@anthropic-ai/sdk';
import { parseWebReply, type RawCandidate, type LengthUnit } from '../utils/vesselLookup.js';

export const WEB_SEARCH_MODEL = 'claude-haiku-5-5';
const TIMEOUT_MS = 45_000;
// Leave enough time for a retry to be worth starting.
const MIN_RETRY_MS = 15_000;

export const ALLOWED_DOMAINS = [
  'myshiptracking.com', 'vesselfinder.com', 'marinetraffic.com', 'magicport.ai', 'balticshipping.com',
  'superyachtfan.com', 'superyachttimes.com', 'boatinternational.com', 'yachtcharterfleet.com',
  'shipspotting.com', 'vesseltracker.com', 'fleetmon.com', 'shipvault.com', 'marinevesseltraffic.com',
];

type Logger = { warn: (o: any, m?: string) => void; info?: (o: any, m?: string) => void };

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

export function webSearchConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function buildWebSearchPrompt(name: string, length: number | null, unit: LengthUnit): string {
  const lengthLine = length != null ? `Length overall: about ${length} ${unit === 'ft' ? 'feet' : 'metres'}` : 'Length overall: not given';
  return [
    "A sailor is adding their vessel to a sea-time app and can't find it. They typed:",
    `Vessel name: ${name}`,
    lengthLine,
    '',
    "Search vessel tracking and yacht websites to find this vessel's MMSI. It may have been renamed.",
    `Good first queries: "${name} MMSI" and "${name} yacht MMSI".`,
    'Vessel pages on sites like MyShipTracking, VesselFinder, MarineTraffic, MagicPort, BalticShipping and SuperYachtFan list the MMSI, call sign, flag and length.',
    'Return up to 5 candidates, best first.',
    'Only give an MMSI you actually saw on a web page for that vessel; never guess or construct one.',
    'Length is a hint only.',
    'Reply with JSON only:',
    '{"candidates":[{"name":"","mmsi":"","imo":"","call_sign":"","flag":"","length_m":null,"former_names":[],"source_url":""}]}',
  ].join('\n');
}

/** Text of a reply, or null if it can't be used (refusal, cut off, tool error). */
export function replyText(response: any, logger: Logger): string | null {
  const stop = response?.stop_reason;
  if (stop === 'refusal') {
    logger.warn({ category: response?.stop_details?.category }, 'Vessel web search refused');
    return null;
  }
  const content: any[] = Array.isArray(response?.content) ? response.content : [];
  for (const block of content) {
    // A server-tool error comes back as an object, not a list of results.
    if (block?.type === 'web_search_tool_result' && block.content && !Array.isArray(block.content)) {
      logger.warn({ error: block.content?.error_code }, 'Vessel web search tool error');
    }
  }
  const text = content.filter((b) => b?.type === 'text').map((b) => String(b.text || '')).join('');
  if (stop === 'max_tokens') logger.warn({}, 'Vessel web search hit max_tokens');
  return text || null;
}

async function attempt(prompt: string, deadline: number, logger: Logger): Promise<RawCandidate[]> {
  const messages: any[] = [{ role: 'user', content: prompt }];
  // A server-tool turn can pause (pause_turn); carry on once or twice within the deadline.
  for (let turn = 0; turn < 3; turn++) {
    const left = deadline - Date.now();
    if (left < 2_000) return [];
    const response: any = await anthropic().messages.create({
      model: WEB_SEARCH_MODEL,
      max_tokens: 4000,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3, allowed_domains: ALLOWED_DOMAINS }],
      output_config: { effort: 'low' },
      messages,
    } as any, { timeout: left, maxRetries: 0 });
    if (response?.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }
    const text = replyText(response, logger);
    return text ? parseWebReply(text) : [];
  }
  return [];
}

/**
 * Up to two tries (the second only if the first found nothing usable and there
 * is time left), all inside one 45 s budget.
 */
export async function searchVesselOnWeb(
  name: string,
  length: number | null,
  unit: LengthUnit,
  logger: Logger,
): Promise<RawCandidate[]> {
  if (!webSearchConfigured()) return [];
  const prompt = buildWebSearchPrompt(name, length, unit);
  const deadline = Date.now() + TIMEOUT_MS;
  for (let tryNo = 1; tryNo <= 2; tryNo++) {
    try {
      const found = await attempt(prompt, deadline, logger);
      if (found.length) return found;
    } catch (err: any) {
      logger.warn({ err: err?.message ?? String(err), status: err?.status, tryNo }, 'Vessel web search failed');
    }
    if (deadline - Date.now() < MIN_RETRY_MS) break;
  }
  return [];
}
