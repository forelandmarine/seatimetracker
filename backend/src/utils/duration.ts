/** 3.89 -> "3h 53m"; 0.5 -> "30m"; 5 -> "5h". */
export function formatHoursMinutes(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

/** Rewrites "over 3.89 hours" in notes written before 2.4.0 (reports, exports). */
export function formatEntryNotes(notes: string | null | undefined): string {
  if (!notes) return '';
  return notes.replace(/\bover (\d+(?:\.\d+)?) hours?\b/g, (_m, h) => `over ${formatHoursMinutes(parseFloat(h))}`);
}
