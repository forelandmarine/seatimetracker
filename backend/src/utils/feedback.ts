/** Why people leave. Keys are stored; the app owns the wording. */
export const EXIT_REASONS = [
  "too_expensive",
  "not_at_sea",
  "tracking_issues",
  "missing_feature",
  "hard_to_use",
  "other_app",
  "short_term_need",
  "other",
] as const;
export type ExitReason = (typeof EXIT_REASONS)[number];

export const EXIT_TRIGGERS = ["cancelled", "lapsed"] as const;

export const MAX_COMMENT_LENGTH = 2000;

/** Known reasons only, each once, in the canonical order. */
export function cleanReasons(input: unknown): ExitReason[] {
  if (!Array.isArray(input)) return [];
  const given = new Set(input.filter((r): r is string => typeof r === "string"));
  return EXIT_REASONS.filter((r) => given.has(r));
}

/** Trimmed comment, capped, or null when empty. */
export function cleanComment(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().slice(0, MAX_COMMENT_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}
