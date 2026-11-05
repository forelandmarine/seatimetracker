/**
 * The From / To boxes on the edit entry screen.
 *
 * Ports are kept in two places: entries logged in the app write them into the
 * notes as "From: X" / "To: Y" lines, while others (shift clock-in, AIS and
 * imported entries) store them in from_port / to_port. The boxes are filled from
 * the column first and the notes line second, and each side is saved back to
 * where it came from, so a port is never copied from a column into the notes.
 */

export interface VoyagePortsState {
  from: string;
  to: string;
  /** Notes with the parsed From / To lines removed. */
  notes: string;
  /** True when that side is stored in from_port / to_port rather than the notes. */
  fromInColumn: boolean;
  toInColumn: boolean;
}

export function readVoyagePorts(entry: {
  notes?: string | null;
  from_port?: string | null;
  to_port?: string | null;
}): VoyagePortsState {
  const fromPort = (entry.from_port || '').trim();
  const toPort = (entry.to_port || '').trim();
  let noteFrom = '';
  let noteTo = '';
  const rest: string[] = [];
  for (const line of (entry.notes || '').split('\n')) {
    if (line.startsWith('From:') && !noteFrom) {
      noteFrom = line.replace('From:', '').trim();
      // Keep a notes line that says something different from the column
      if (fromPort && noteFrom !== fromPort) rest.push(line);
    } else if (line.startsWith('To:') && !noteTo) {
      noteTo = line.replace('To:', '').trim();
      if (toPort && noteTo !== toPort) rest.push(line);
    } else if (line.trim()) {
      rest.push(line);
    }
  }
  return {
    from: fromPort || noteFrom,
    to: toPort || noteTo,
    notes: rest.join('\n'),
    fromInColumn: !!fromPort,
    toInColumn: !!toPort,
  };
}

/** The update fields for the boxes: from_port / to_port for column sides, notes lines otherwise. */
export function writeVoyagePorts(s: VoyagePortsState): {
  notes: string | null;
  from_port?: string | null;
  to_port?: string | null;
} {
  const from = s.from.trim();
  const to = s.to.trim();
  const parts = [
    !s.fromInColumn && from ? `From: ${from}` : '',
    !s.toInColumn && to ? `To: ${to}` : '',
    s.notes,
  ].filter(Boolean);
  const out: { notes: string | null; from_port?: string | null; to_port?: string | null } = {
    notes: parts.join('\n') || null,
  };
  if (s.fromInColumn) out.from_port = from || null;
  if (s.toInColumn) out.to_port = to || null;
  return out;
}
