/**
 * MCA figures for the PDF report, so the report's totals match the summary:
 * the headline total is qualifyingSeaDays (yard capped at 90 days, stand-by
 * within the MSN 1858 limits, port excluded), and each vessel block shows the
 * stand-by days credited to it out of those logged.
 */

import { creditedStandbyDates, distinctSeaDates, qualifyingSeaDays } from './seaTime.js';

interface ReportEntry {
  start_time: Date | string;
  end_time: Date | string | null;
  sea_days?: number | null;
  status?: string | null;
  service_type?: string | null;
  vessel_id?: string | null;
}

export interface McaReportFigures {
  total: number;
  /** Logged stand-by days the MSN 1858 limits leave out. */
  standby_not_credited: number;
  /** Yard days over the 90-day cap. */
  yard_over_cap: number;
  /** Per block, the stand-by days credited to it. */
  block_standby_credited: number[];
}

export function mcaReportFigures(all: ReportEntry[], blocks: ReportEntry[][]): McaReportFigures {
  const q = qualifyingSeaDays(all);
  const credited = creditedStandbyDates(all);
  const isStandby = (e: ReportEntry) => e.service_type === 'standby_service';
  return {
    total: q.qualifying_total,
    standby_not_credited: q.standby_logged - q.standby,
    yard_over_cap: q.yard - q.yard_credited,
    block_standby_credited: blocks.map((b) => [...distinctSeaDates(b.filter(isStandby))].filter((d) => credited.has(d)).length),
  };
}
