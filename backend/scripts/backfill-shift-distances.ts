// One-off backfill for 2.5.0 shift mileage.
//
// Shifts clocked out before 27c853c stored the straight line from the clock-in to
// the clock-out position, so a CTV that starts and ends at its SOV shows about 0 nm
// after a day of turbine-to-turbine running. For each logged shift entry (notes
// start with "Manual shift", end_time set, not rejected) this recomputes the miles
// from the vessel's AIS fixes between clock-in and clock-out with the same helpers
// clock-out now uses (cumulativeTrackDistanceNm + shiftMiles, via
// backfilledShiftMiles), and only writes where the track gives a larger figure.
//
// Dry run by default: prints each change (old -> new) and the totals, writes nothing.
//   TZ=UTC DATABASE_URL=... npx tsx scripts/backfill-shift-distances.ts
//   TZ=UTC DATABASE_URL=... npx tsx scripts/backfill-shift-distances.ts --apply
// Options: --user=<user id> to limit to one user.
import postgres from 'postgres';
import { MANUAL_SHIFT_NOTE_PREFIX, backfilledShiftMiles } from '../src/utils/shifts.js';

const APPLY = process.argv.includes('--apply');
const userFilter = process.argv.find((a) => a.startsWith('--user='))?.slice(7) ?? null;
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Nothing done.');
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

// Everything runs in one transaction. A dry run's is READ ONLY, so it cannot write even by mistake.
try {
  await sql.begin(APPLY ? 'read write' : 'read only', async (tx) => {
    console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: shift entries${userFilter ? ` for user ${userFilter}` : ''}`);
    if (!APPLY) console.log('transaction read only:', (await tx`show transaction_read_only`)[0].transaction_read_only);

    const shifts = await tx<{
      id: string; user_id: string | null; vessel_id: string; start_time: Date; end_time: Date;
      status: string; distance_nm: string | null; vessel_name: string | null;
    }[]>`
      select e.id, e.user_id, e.vessel_id, e.start_time, e.end_time, e.status, e.distance_nm, v.vessel_name
      from sea_time_entries e
      left join vessels v on v.id = e.vessel_id
      where e.notes like ${`${MANUAL_SHIFT_NOTE_PREFIX}%`}
        and e.end_time is not null
        and e.status <> 'rejected'
        and e.user_id is not null
        ${userFilter ? tx`and e.user_id = ${userFilter}` : tx``}
      order by e.start_time`;
    console.log(`shift entries: ${shifts.length}`);

    const changes: { id: string; old: number; next: number }[] = [];
    let noTrack = 0;
    let oldTotal = 0;
    for (const s of shifts) {
      const stored = s.distance_nm == null ? 0 : Number(s.distance_nm);
      oldTotal += stored;
      // Same window and ownership as trackDistances(): this user's fixes for this vessel, clock-in to clock-out.
      const fixes = await tx<{ latitude: string | null; longitude: string | null; check_time: Date }[]>`
        select latitude, longitude, check_time
        from ais_checks
        where user_id = ${s.user_id} and vessel_id = ${s.vessel_id}
          and check_time >= ${s.start_time} and check_time <= ${s.end_time}
        order by check_time`;
      if (fixes.length < 2) noTrack++;
      const next = backfilledShiftMiles(fixes, stored);
      if (next == null) continue;
      changes.push({ id: s.id, old: stored, next });
      console.log(
        `${s.start_time.toISOString().slice(0, 16)}  ${(s.vessel_name ?? s.vessel_id).padEnd(24)} ${s.status.padEnd(9)} ` +
        `${stored.toFixed(2)} -> ${next.toFixed(2)} nm  (${fixes.length} fixes)  ${s.id}`,
      );
    }

    const gain = changes.reduce((sum, c) => sum + (c.next - c.old), 0);
    console.log(
      `\n${changes.length} of ${shifts.length} shifts change; ${noTrack} have under two fixes and keep their figure.` +
      `\nTotal shift miles: ${oldTotal.toFixed(2)} -> ${(oldTotal + gain).toFixed(2)} nm (+${gain.toFixed(2)}).`,
    );

    if (!APPLY) {
      console.log('Dry run: nothing written. Re-run with --apply to write.');
    } else {
      for (const c of changes) {
        await tx`update sea_time_entries set distance_nm = ${c.next.toFixed(2)} where id = ${c.id}`;
      }
      console.log(`Written: ${changes.length} entries.`);
    }
  });
} finally {
  await sql.end();
}
