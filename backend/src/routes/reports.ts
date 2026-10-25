import type { FastifyInstance } from "fastify";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import PDFDocument from "pdfkit";
import { Readable } from "stream";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import { workboatService } from "../utils/workboat.js";
import { amsaCreditableDays, countDistinctSeaDays, mnzCreditableDays, qualifyingSeaDays, uscgCreditableDays, cumulativeTrackDistanceNm, type TrackFix } from "../utils/seaTime.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { entriesWithIdentity, identityChanges } from '../services/vesselIdentity.js';
import { identityAsOf } from '../utils/vesselIdentity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// In dev (tsx): __dirname = src/routes/, assets at src/assets/
// In prod (esbuild bundle): __dirname = dist/, assets at dist/assets/
const ASSETS_DIR = fs.existsSync(path.join(__dirname, "..", "assets"))
  ? path.join(__dirname, "..", "assets")
  : path.join(__dirname, "assets");

export function register(app: App, fastify: FastifyInstance) {
  // GET /api/reports/csv - Generate CSV file of sea time entries with date filtering
  fastify.get<{ Querystring: { startDate?: string; endDate?: string } }>('/api/reports/csv', {
    schema: {
      description: 'Generate CSV file of sea time entries for MCA testimonials (requires authentication)',
      tags: ['reports'],
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'ISO 8601 date string' },
          endDate: { type: 'string', description: 'ISO 8601 date string' },
        },
      },
      response: {
        200: { type: 'string' },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'CSV report requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    // Check subscription status
    const users = await app.db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId));

    if (users.length === 0) {
      return reply.code(401).send({ error: 'User not found' });
    }

    const user = users[0];
    const subscriptionStatus = (user as any).subscription_status || 'inactive';
    const subscriptionExpiresAt = (user as any).subscription_expires_at;

    let isSubscriptionActive = subscriptionStatus === 'active' || subscriptionStatus === 'trial';
    if (isSubscriptionActive && subscriptionExpiresAt) {
      try {
        const expiryDate = new Date(subscriptionExpiresAt);
        if (isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
          isSubscriptionActive = false;
        }
      } catch {
        isSubscriptionActive = false;
      }
    }

    if (!isSubscriptionActive) {
      app.logger.warn(
        { userId, subscriptionStatus },
        'CSV report denied: subscription not active'
      );
      return reply.code(403).send({
        error: 'Active subscription required to generate reports',
      });
    }

    const { startDate, endDate } = request.query;

    app.logger.info({ userId, startDate, endDate }, 'Generating CSV report for user');

    // Helper function to calculate distance in nautical miles using Haversine formula
    const calculateDistanceNauticalMiles = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const EARTH_RADIUS_NM = 3440.065; // Nautical miles

      // Convert degrees to radians
      const dLat = (lat2 - lat1) * (Math.PI / 180);
      const dLon = (lon2 - lon1) * (Math.PI / 180);
      const lat1Rad = lat1 * (Math.PI / 180);
      const lat2Rad = lat2 * (Math.PI / 180);

      // Haversine formula
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.asin(Math.sqrt(a));
      const distance = EARTH_RADIUS_NM * c;

      return Math.round(distance * 100) / 100;
    };

    // Helper function to format service type with proper labels
    const formatServiceType = (serviceType: string | null | undefined): string => {
      const serviceTypeMap: { [key: string]: string } = {
        'actual_sea_service': 'Actual Sea Service',
        'watchkeeping_service': 'Watchkeeping Service',
        'standby_service': 'Stand-by Service',
        'yard_service': 'Yard Service',
        'service_in_port': 'Service in Port',
      };
      return serviceTypeMap[serviceType || 'actual_sea_service'] || 'Actual Sea Service';
    };

    // Helper function to format date as DD/MM/YYYY
    const formatDate = (date: Date | string) => {
      const d = typeof date === 'string' ? new Date(date) : date;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    };

    let entries = await app.db.query.sea_time_entries.findMany({
      with: {
        vessel: true,
      },
      where: eq(schema.sea_time_entries.user_id, userId),
    });
    // Name, flag, MMSI and call sign as they were on each entry's day (renames, reflags)
    entries = await entriesWithIdentity(app, entries);

    // Filter by date if provided
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      entries = entries.filter((entry) => {
        const entryDate = new Date(entry.start_time);
        if (start && entryDate < start) return false;
        if (end && entryDate > end) return false;
        return true;
      });
    }

    // Only include confirmed entries
    entries = entries.filter((entry) => entry.status === 'confirmed');

    // Sort entries by start_time ascending (oldest first)
    entries.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    app.logger.info({ count: entries.length }, 'Filtered entries for CSV report');

    // Cumulative AIS-track mileage: for entries that have recorded AIS fixes, sum the
    // great-circle legs between consecutive fixes rather than a single start-to-end
    // straight line. This captures continuous / short-leg operations (e.g. a CTV
    // working turbine to turbine in a wind farm), which point-to-point understates.
    // Entries without fixes fall back to the point-to-point distance below.
    const trackDistanceByEntry = new Map<string, number>();
    if (entries.length > 0) {
      const vesselIds = [...new Set(entries.map((e) => e.vessel_id).filter(Boolean))] as string[];
      const times = entries.flatMap((e) => [
        new Date(e.start_time).getTime(),
        e.end_time ? new Date(e.end_time).getTime() : new Date(e.start_time).getTime(),
      ]);
      if (vesselIds.length > 0 && times.length > 0) {
        const windowStart = new Date(Math.min(...times));
        const windowEnd = new Date(Math.max(...times));
        const fixes = await app.db
          .select({
            vessel_id: schema.ais_checks.vessel_id,
            latitude: schema.ais_checks.latitude,
            longitude: schema.ais_checks.longitude,
            check_time: schema.ais_checks.check_time,
          })
          .from(schema.ais_checks)
          .where(
            and(
              eq(schema.ais_checks.user_id, userId),
              inArray(schema.ais_checks.vessel_id, vesselIds),
              gte(schema.ais_checks.check_time, windowStart),
              lte(schema.ais_checks.check_time, windowEnd),
            ),
          );
        const byVessel = new Map<string, TrackFix[]>();
        for (const f of fixes) {
          if (!f.vessel_id) continue;
          const arr = byVessel.get(f.vessel_id) ?? [];
          arr.push(f as TrackFix);
          byVessel.set(f.vessel_id, arr);
        }
        for (const e of entries) {
          if (!e.vessel_id || !e.end_time) continue;
          const vf = byVessel.get(e.vessel_id);
          if (!vf) continue;
          const s = new Date(e.start_time).getTime();
          const en = new Date(e.end_time).getTime();
          const inWindow = vf.filter((f) => {
            const t = f.check_time instanceof Date ? f.check_time.getTime() : new Date(f.check_time).getTime();
            return t >= s && t <= en;
          });
          if (inWindow.length >= 2) trackDistanceByEntry.set(e.id, cumulativeTrackDistanceNm(inWindow));
        }
      }
    }

    // SECTION 1: Build CSV with vessel particulars (existing summary section)
    const headers = [
      'Date',
      'Vessel Name',
      'MMSI',
      'IMO Number',
      'Flag',
      'Official Number',
      'Vessel Type',
      'Length (metres)',
      'Gross Tonnes',
      'ITC Tonnage',
      'Start Time',
      'End Time',
      'Sea Days',
      'Service Type',
      'Rank',
      'Date Joined',
      'Date Left',
      'Trade Area',
      'Bridge Watch Hours',
      'Engine Watch Hours',
      'Night Watch Hours',
      'Status',
      'Notes',
    ];
    const rows = entries.map((entry) => [
      new Date(entry.start_time).toISOString().split('T')[0],
      entry.vessel?.vessel_name || '',
      entry.vessel?.mmsi || '',
      entry.vessel?.imo_number || '',
      entry.vessel?.flag || '',
      entry.vessel?.official_number || '',
      entry.vessel?.type || '',
      entry.vessel?.length_metres ?? '',
      entry.vessel?.gross_tonnes ?? '',
      entry.vessel?.tonnage_itc ?? '',
      new Date(entry.start_time).toISOString(),
      entry.end_time ? new Date(entry.end_time).toISOString() : '',
      entry.sea_days ?? 0,
      entry.service_type || 'actual_sea_service',
      entry.rank || '',
      entry.date_joined || '',
      entry.date_left || '',
      entry.trade_area || '',
      entry.bridge_watch_hours ?? '',
      entry.engine_watch_hours ?? '',
      entry.night_watch_hours ?? '',
      entry.status,
      entry.notes || '',
    ]);

    const summarySection = [
      headers.map((h) => `"${h}"`).join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ];

    // SECTION 2: Build detailed voyage records table
    const voyageHeaders = [
      'Voyage Number',
      'Start Date',
      'End Date',
      'Vessel Name',
      'MMSI',
      'IMO Number',
      'Flag',
      'Official Number',
      'Vessel Type',
      'Length (metres)',
      'Gross Tonnes',
      'ITC Tonnage',
      'Start Position',
      'End Position',
      'Distance (nm)',
      'Sea Days',
      'Service Type',
      'Rank',
      'Date Joined',
      'Date Left',
      'Trade Area',
      'Bridge Watch Hours',
      'Engine Watch Hours',
      'Night Watch Hours',
      'Notes',
    ];

    const voyageRows = entries.map((entry, index) => {
      // Format positions
      let startPosition = 'Not recorded';
      if (entry.start_latitude !== null && entry.start_longitude !== null) {
        const lat = typeof entry.start_latitude === 'string' ? parseFloat(entry.start_latitude) : entry.start_latitude;
        const lon = typeof entry.start_longitude === 'string' ? parseFloat(entry.start_longitude) : entry.start_longitude;
        startPosition = `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
      }

      let endPosition = 'Not recorded';
      if (entry.end_latitude !== null && entry.end_longitude !== null) {
        const lat = typeof entry.end_latitude === 'string' ? parseFloat(entry.end_latitude) : entry.end_latitude;
        const lon = typeof entry.end_longitude === 'string' ? parseFloat(entry.end_longitude) : entry.end_longitude;
        endPosition = `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
      }

      // Calculate distance
      let distance = 'N/A';
      if (
        entry.start_latitude !== null &&
        entry.start_longitude !== null &&
        entry.end_latitude !== null &&
        entry.end_longitude !== null
      ) {
        const startLat = typeof entry.start_latitude === 'string' ? parseFloat(entry.start_latitude) : entry.start_latitude;
        const startLon = typeof entry.start_longitude === 'string' ? parseFloat(entry.start_longitude) : entry.start_longitude;
        const endLat = typeof entry.end_latitude === 'string' ? parseFloat(entry.end_latitude) : entry.end_latitude;
        const endLon = typeof entry.end_longitude === 'string' ? parseFloat(entry.end_longitude) : entry.end_longitude;
        distance = String(calculateDistanceNauticalMiles(startLat, startLon, endLat, endLon));
      }
      // Prefer cumulative AIS-track distance when we have the fixes for it.
      const trackDistance = trackDistanceByEntry.get(entry.id);
      if (trackDistance !== undefined) {
        distance = String(trackDistance);
      }

      return [
        String(index + 1), // Voyage number
        formatDate(entry.start_time), // Start date
        entry.end_time ? formatDate(entry.end_time) : '', // End date
        entry.vessel?.vessel_name || '',
        entry.vessel?.mmsi || '',
        entry.vessel?.imo_number || '',
        entry.vessel?.flag || '',
        entry.vessel?.official_number || '',
        entry.vessel?.type || '',
        entry.vessel?.length_metres ?? '',
        entry.vessel?.gross_tonnes ?? '',
        entry.vessel?.tonnage_itc ?? '',
        startPosition,
        endPosition,
        distance,
        entry.sea_days ?? 0,
        formatServiceType(entry.service_type),
        entry.rank || '',
        entry.date_joined ? formatDate(entry.date_joined) : '',
        entry.date_left ? formatDate(entry.date_left) : '',
        entry.trade_area || '',
        entry.bridge_watch_hours ?? '',
        entry.engine_watch_hours ?? '',
        entry.night_watch_hours ?? '',
        entry.notes || '',
      ];
    });

    const voyageSection = [
      voyageHeaders.map((h) => `"${h}"`).join(','),
      ...voyageRows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ];

    // SECTION 3: Leave Periods
    const leavePeriods = await app.db.select()
      .from(schema.leave_periods)
      .where(eq(schema.leave_periods.user_id, userId));

    const csvVessels = await app.db.select().from(schema.vessels).where(eq(schema.vessels.user_id, userId));

    const leaveHeaders = [
      'Start Date',
      'End Date',
      'Vessel',
      'Reason',
      'Notes',
    ];

    const formatLeaveReason = (reason: string | null): string => {
      const map: { [key: string]: string } = {
        'annual_leave': 'Annual Leave',
        'sick_leave': 'Sick Leave',
        'personal': 'Personal',
        'training': 'Training',
        'other': 'Other',
      };
      return map[reason || ''] || reason || '';
    };

    const leaveChanges = await identityChanges(app, csvVessels.map((v) => v.id));
    const leaveRows = leavePeriods
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
      .map((lp) => {
        const record = csvVessels.find((v) => v.id === lp.vessel_id);
        const vessel = record && identityAsOf(record, leaveChanges.get(record.id) ?? [], new Date(lp.start_date));
        return [
          formatDate(lp.start_date),
          formatDate(lp.end_date),
          vessel?.vessel_name || '',
          formatLeaveReason(lp.reason),
          lp.notes || '',
        ];
      });

    const leaveSection = [
      leaveHeaders.map((h) => `"${h}"`).join(','),
      ...leaveRows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ];

    // Combine all sections with header and blank rows between them
    const csv = [
      'SeaTime Tracker',
      'Digital Sea Time Logbook',
      '',
      ...summarySection,
      '', // Blank rows for separation
      '',
      `"DETAILED VOYAGE RECORDS"`,
      '',
      ...voyageSection,
      '',
      '',
      `"LEAVE PERIODS"`,
      '',
      ...leaveSection,
    ].join('\n');

    app.logger.info(
      { summaryRows: rows.length, voyageRows: voyageRows.length, totalRows: rows.length + voyageRows.length },
      'CSV report with voyage records generated'
    );

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="sea-time-entries.csv"');
    return csv;
  });

  // GET /api/reports/summary - Return summary statistics with date filtering
  fastify.get<{ Querystring: { startDate?: string; endDate?: string } }>('/api/reports/summary', {
    schema: {
      description: 'Get summary statistics of confirmed sea time entries with aggregations by vessel and month (requires authentication)',
      tags: ['reports'],
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'ISO 8601 date string' },
          endDate: { type: 'string', description: 'ISO 8601 date string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            total_days: { type: 'number' },
            sea_service: {
              type: 'object',
              properties: {
                actual: { type: 'number' },
                standby: { type: 'number' },
                yard: { type: 'number' },
                port: { type: 'number' },
                yard_credited: { type: 'number' },
                qualifying_total: { type: 'number' },
              },
            },
            uscg_service: {
              type: 'object',
              properties: {
                creditable: { type: 'number' },
                provisional: { type: 'number' },
                short_of_standard_day: { type: 'number' },
                awaiting_tonnage: { type: 'number' },
                vessels_awaiting_tonnage: { type: 'array', items: { type: 'string' } },
                below_minimum: { type: 'number' },
                standby: { type: 'number' },
                yard: { type: 'number' },
                port: { type: 'number' },
              },
            },
            amsa_service: {
              type: 'object',
              properties: {
                underway: { type: 'number' },
                not_underway: { type: 'number' },
                part_day_hours: { type: 'number' },
                qualifying_hours: { type: 'number' },
                navigational_watch: { type: 'number' },
                engineering_watch: { type: 'number' },
              },
            },
            mnz_service: {
              type: 'object',
              properties: {
                actual: { type: 'number' },
                standby: { type: 'number' },
                yard: { type: 'number' },
                port: { type: 'number' },
                qualifying_total: { type: 'number' },
                watchkeeping: { type: 'number' },
                hours: { type: 'number' },
                outside_window: { type: 'number' },
              },
            },
            entries_by_vessel: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  vessel_name: { type: 'string' },
                  total_days: { type: 'number' },
                },
              },
            },
            entries_by_month: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  month: { type: 'string' },
                  total_days: { type: 'number' },
                },
              },
            },
            entries_by_service_type: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  service_type: { type: 'string' },
                  total_days: { type: 'number' },
                },
              },
            },
            commercial_service: {
              type: 'object',
              properties: {
                qualifying_total: { type: 'number' },
                vessels: { type: 'array', items: { type: 'string' } },
                yacht_entries_by_service_type: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      service_type: { type: 'string' },
                      total_days: { type: 'number' },
                    },
                  },
                },
              },
            },
            workboat_service: {
              type: 'object',
              properties: {
                sea_service: { type: 'number' },
                sea_service_15m: { type: 'number' },
                watchkeeping_15m: { type: 'number' },
                workboat_15m: { type: 'number' },
                recent_sea_service: { type: 'number' },
                workboats_without_length: { type: 'number' },
              },
            },
          },
        },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'Summary report requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    // Summary stats are available to all authenticated users (no subscription gate)
    const { startDate, endDate } = request.query;

    app.logger.info({ userId, startDate, endDate }, 'Generating summary report for user');

    let entries = await app.db.query.sea_time_entries.findMany({
      with: {
        vessel: true,
      },
      where: eq(schema.sea_time_entries.user_id, userId),
    });
    // Name, flag, MMSI and call sign as they were on each entry's day (renames, reflags)
    entries = await entriesWithIdentity(app, entries);

    // Filter by date if provided
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      entries = entries.filter((entry) => {
        const entryDate = new Date(entry.start_time);
        if (start && entryDate < start) return false;
        if (end && entryDate > end) return false;
        return true;
      });
    }

    // Only include confirmed entries
    entries = entries.filter((entry) => entry.status === 'confirmed');

    app.logger.info({ count: entries.length }, 'Filtered confirmed entries for summary');

    // Total qualifying sea service: yard service capped at 90 days (MSN 1858)
    // and service in port excluded (not sea service). Stand-by is counted in
    // full; its certificate-structure limits are left to the assessor. Days are
    // deduplicated across service types so a calendar date is only counted once.
    // `total_days` is this figure; `sea_service` exposes the breakdown behind it.
    const breakdown = qualifyingSeaDays(entries as any);
    const total_days = breakdown.qualifying_total;

    // USCG applicants need the same entries counted under 46 CFR 10.107 rules:
    // an 8-hour working day, with yard and port time not treated as sea
    // service. Returned alongside the MCA figure so the client can show the
    // one that matches the user's chosen authority.
    const uscg_service = uscgCreditableDays(entries as any);

    // AMSA counts an 8-hour day and caps service gained while the vessel is not
    // underway; Maritime NZ counts in 30-day months inside a 10-year window and
    // measures two of its certificates in hours. Neither is the MCA figure, so
    // each is returned separately and the client shows the one matching the
    // user's chosen authority.
    const amsa_service = amsaCreditableDays(entries as any);
    const mnz_service = mnzCreditableDays(entries as any);

    // Group by vessel, counting distinct days within each vessel.
    const vesselGroups: { [key: string]: any[] } = {};
    entries.forEach((entry) => {
      const vessel_name = entry.vessel?.vessel_name || 'Unknown';
      (vesselGroups[vessel_name] ||= []).push(entry);
    });

    const entries_by_vessel = Object.entries(vesselGroups)
      .map(([vessel_name, group]) => ({
        vessel_name,
        total_days: countDistinctSeaDays(group as any),
      }))
      .sort((a, b) => b.total_days - a.total_days); // Sort by days descending

    // Group by month (bucketed by the entry's start month).
    const monthGroups: { [key: string]: any[] } = {};
    entries.forEach((entry) => {
      const month = new Date(entry.start_time).toISOString().slice(0, 7); // YYYY-MM format
      (monthGroups[month] ||= []).push(entry);
    });

    const entries_by_month = Object.entries(monthGroups)
      .map(([month, group]) => ({
        month,
        total_days: countDistinctSeaDays(group as any),
      }))
      .sort((a, b) => a.month.localeCompare(b.month)); // Sort by month ascending

    // Group by service type.
    const serviceTypeGroups: { [key: string]: any[] } = {};
    entries.forEach((entry) => {
      const service_type = entry.service_type || 'actual_sea_service';
      (serviceTypeGroups[service_type] ||= []).push(entry);
    });

    const entries_by_service_type = Object.entries(serviceTypeGroups)
      .map(([service_type, group]) => ({
        service_type,
        total_days: countDistinctSeaDays(group as any),
      }))
      .sort((a, b) => b.total_days - a.total_days); // Sort by days descending

    // Service on vessels tagged commercial. MSN 1858 only credits yacht service
    // toward the yacht deck CoCs, while ratings, small vessel engineer and ETO
    // CoCs accept it, so the client needs both figures to decide what carries
    // over for the certificate being tracked. Untagged vessels count as yachts.
    const commercialEntries = entries.filter((entry) => entry.vessel?.sector === 'commercial');
    const yachtTypeGroups: { [key: string]: any[] } = {};
    entries
      .filter((entry) => entry.vessel?.sector !== 'commercial')
      .forEach((entry) => {
        const service_type = entry.service_type || 'actual_sea_service';
        (yachtTypeGroups[service_type] ||= []).push(entry);
      });
    const commercial_service = {
      qualifying_total: qualifyingSeaDays(commercialEntries as any).qualifying_total,
      vessels: [...new Set(commercialEntries.map((entry) => entry.vessel?.vessel_name || 'Unknown'))],
      yacht_entries_by_service_type: Object.entries(yachtTypeGroups).map(([service_type, group]) => ({
        service_type,
        total_days: countDistinctSeaDays(group as any),
      })),
    };

    // Master (Workboat) <500 GT gates (MGN 496): any vessel, 15 m and over, workboats, recency
    const workboat_service = workboatService(entries as any);

    app.logger.info(
      {
        total_days,
        vesselCount: entries_by_vessel.length,
        monthCount: entries_by_month.length,
        serviceTypeCount: entries_by_service_type.length
      },
      'Summary report generated'
    );

    return reply.code(200).send({
      total_days,
      sea_service: breakdown,
      uscg_service,
      amsa_service,
      mnz_service,
      entries_by_vessel,
      entries_by_month,
      entries_by_service_type,
      commercial_service,
      workboat_service,
    });
  });

  // GET /api/reports/xlsx - Generate Excel report
  fastify.get<{ Querystring: { startDate?: string; endDate?: string } }>('/api/reports/xlsx', {
    schema: {
      description: 'Generate Excel (.xlsx) sea time report (requires authentication)',
      tags: ['reports'],
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'ISO 8601 date string' },
          endDate: { type: 'string', description: 'ISO 8601 date string' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    // Check subscription
    const users = await app.db.select().from(authSchema.user).where(eq(authSchema.user.id, userId));
    if (users.length === 0) return reply.code(401).send({ error: 'User not found' });
    const user = users[0];
    const status = (user as any).subscription_status || 'inactive';
    const expires = (user as any).subscription_expires_at;
    let active = status === 'active' || status === 'trial';
    if (active && expires) {
      try {
        const exp = new Date(expires);
        if (isNaN(exp.getTime()) || exp <= new Date()) active = false;
      } catch {
        active = false;
      }
    }
    if (!active) {
      return reply.code(403).send({ error: 'Active subscription required to generate reports' });
    }

    const { startDate, endDate } = request.query;

    let entries = await app.db.query.sea_time_entries.findMany({
      with: { vessel: true },
      where: eq(schema.sea_time_entries.user_id, userId),
    });
    entries = await entriesWithIdentity(app, entries);
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      entries = entries.filter((e) => {
        const d = new Date(e.start_time);
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
    }
    entries = entries
      .filter((e) => e.status === 'confirmed')
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    try {
      // Lazy import — package may not be installed in dev
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.default.Workbook();
      workbook.creator = 'SeaTime Tracker by Foreland Marine';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('Sea Time Records');
      sheet.columns = [
        { header: 'Start Date', key: 'start', width: 12 },
        { header: 'End Date', key: 'end', width: 12 },
        { header: 'Vessel', key: 'vessel', width: 20 },
        { header: 'MMSI', key: 'mmsi', width: 12 },
        { header: 'Flag', key: 'flag', width: 8 },
        { header: 'Type', key: 'type', width: 14 },
        { header: 'Length (m)', key: 'length', width: 10 },
        { header: 'Gross Tonnes', key: 'gt', width: 12 },
        { header: 'Service Type', key: 'serviceType', width: 18 },
        { header: 'Sea Days', key: 'days', width: 10 },
        { header: 'Duration (h)', key: 'hours', width: 12 },
        { header: 'Notes', key: 'notes', width: 30 },
      ];

      // Header style
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0077BE' },
      };
      sheet.getRow(1).alignment = { vertical: 'middle' };
      sheet.getRow(1).height = 22;

      entries.forEach((e: any) => {
        sheet.addRow({
          start: new Date(e.start_time).toLocaleDateString('en-GB'),
          end: e.end_time ? new Date(e.end_time).toLocaleDateString('en-GB') : '',
          vessel: e.vessel?.vessel_name || '',
          mmsi: e.vessel?.mmsi || '',
          flag: e.vessel?.flag || '',
          type: e.vessel?.type || '',
          length: e.vessel?.length_metres ?? '',
          gt: e.vessel?.gross_tonnes ?? '',
          serviceType: e.service_type || '',
          days: e.sea_days ?? 0,
          hours: e.duration_hours ?? '',
          notes: e.notes || '',
        });
      });

      // Totals row: qualifying sea service (yard <= 90 days, port excluded,
      // stand-by in full, days deduplicated), matching /api/reports/summary.
      const totalDays = qualifyingSeaDays(entries as any).qualifying_total;
      sheet.addRow({});
      const totalRow = sheet.addRow({ vessel: 'TOTAL (qualifying sea service)', days: totalDays });
      totalRow.font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();

      reply.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      reply.header(
        'Content-Disposition',
        `attachment; filename="seatime_report_${new Date().toISOString().split('T')[0]}.xlsx"`
      );
      return reply.send(Buffer.from(buffer));
    } catch (err: any) {
      app.logger.error({ err }, 'Failed to generate Excel report');
      return reply.code(500).send({
        error: 'Failed to generate Excel report',
        detail: err?.message || String(err),
      });
    }
  });

  // GET /api/reports/pdf - Generate PDF report with date filtering
  fastify.get<{ Querystring: { startDate?: string; endDate?: string; template?: string } }>('/api/reports/pdf', {
    schema: {
      description: 'Generate PDF report of sea time entries (requires authentication)',
      tags: ['reports'],
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'ISO 8601 date string' },
          endDate: { type: 'string', description: 'ISO 8601 date string' },
          template: {
            type: 'string',
            enum: ['mca', 'uscg', 'mnz', 'amsa', 'generic'],
            description: 'Certification body template (default: mca)',
          },
        },
      },
      response: {
        200: { type: 'string' },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'PDF report requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    // Check subscription status
    const users = await app.db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId));

    if (users.length === 0) {
      return reply.code(401).send({ error: 'User not found' });
    }

    const user = users[0];
    const subscriptionStatus = (user as any).subscription_status || 'inactive';
    const subscriptionExpiresAt = (user as any).subscription_expires_at;

    let isSubscriptionActive = subscriptionStatus === 'active' || subscriptionStatus === 'trial';
    if (isSubscriptionActive && subscriptionExpiresAt) {
      try {
        const expiryDate = new Date(subscriptionExpiresAt);
        if (isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
          isSubscriptionActive = false;
        }
      } catch {
        isSubscriptionActive = false;
      }
    }

    if (!isSubscriptionActive) {
      app.logger.warn(
        { userId, subscriptionStatus },
        'PDF report denied: subscription not active'
      );
      return reply.code(403).send({
        error: 'Active subscription required to generate reports',
      });
    }

    const { startDate, endDate, template = 'mca' } = request.query;

    // Template configuration: each certification body has a slightly different
    // header / declaration. The schema mostly stays the same but the title and
    // signed-by text differ.
    const TEMPLATES: Record<string, { title: string; bodyName: string; declaration: string }> = {
      mca: {
        title: 'SEA TIME TESTIMONIAL',
        bodyName: 'Maritime and Coastguard Agency (MCA)',
        declaration: 'I certify that the seafarer named above has performed the sea service detailed in this testimonial in accordance with MCA requirements.',
      },
      uscg: {
        title: 'SEA SERVICE LETTER',
        bodyName: 'United States Coast Guard (USCG)',
        declaration: 'I certify that the seafarer named above has performed the sea service detailed in this letter in accordance with USCG requirements (46 CFR).',
      },
      mnz: {
        title: 'SEA SERVICE TESTIMONIAL',
        bodyName: 'Maritime New Zealand (MNZ)',
        declaration: 'I certify that the seafarer named above has performed the sea service detailed in this testimonial in accordance with Maritime New Zealand requirements under Maritime Rules Part 32. Sea service is stated in days, where 30 days is one month.',
      },
      amsa: {
        title: 'RECORD OF SEA SERVICE',
        bodyName: 'Australian Maritime Safety Authority (AMSA)',
        declaration: 'I certify that the seafarer named above has performed the sea service detailed in this record in accordance with Marine Order 505, where a day of sea service is 8 hours of qualifying work. This record is provided in support of, or in place of, AMSA form 771.',
      },
      generic: {
        title: 'SEA TIME REPORT',
        bodyName: 'Maritime Authority',
        declaration: 'I certify that the seafarer named above has performed the sea service detailed in this report.',
      },
    };
    const tpl = TEMPLATES[template] || TEMPLATES.mca;

    app.logger.info({ userId, startDate, endDate, template }, 'Generating PDF report for user');

    // Fetch user profile data
    const userProfile = await app.db.query.user.findFirst({
      where: eq(authSchema.user.id, userId),
    });

    if (!userProfile) {
      app.logger.warn({ userId }, 'User profile not found for PDF report');
      return reply.code(401).send({ error: 'User profile not found' });
    }

    // Fetch sea time entries for authenticated user with vessel data
    let entries = await app.db.query.sea_time_entries.findMany({
      with: {
        vessel: true,
      },
      where: eq(schema.sea_time_entries.user_id, userId),
    });
    // Name, flag, MMSI and call sign as they were on each entry's day (renames, reflags)
    entries = await entriesWithIdentity(app, entries);

    // Filter by date if provided
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      entries = entries.filter((entry) => {
        const entryDate = new Date(entry.start_time);
        if (start && entryDate < start) return false;
        if (end && entryDate > end) return false;
        return true;
      });
    }

    // Only include confirmed entries
    const confirmedEntries = entries.filter((entry) => entry.status === 'confirmed');

    // Get user's vessels only
    const allVessels = await app.db.select().from(schema.vessels).where(eq(schema.vessels.user_id, userId));

    // Fetch leave periods for the user
    const pdfLeavePeriods = await app.db.select()
      .from(schema.leave_periods)
      .where(eq(schema.leave_periods.user_id, userId));

    // --- Helpers ---
    const formatDate = (date: Date | string) => {
      const d = typeof date === 'string' ? new Date(date) : date;
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };

    const formatDateOfBirth = (date: Date | string | null | undefined): string => {
      if (!date) return '';
      return formatDate(date);
    };

    const formatDepartment = (dept: string | null | undefined): string => {
      if (!dept) return '';
      return dept.charAt(0).toUpperCase() + dept.slice(1);
    };

    const formatServiceType = (serviceType: string | null | undefined): string => {
      const map: { [key: string]: string } = {
        'actual_sea_service': 'Actual Sea Service',
        'watchkeeping_service': 'Watchkeeping Service',
        'standby_service': 'Stand-by Service',
        'yard_service': 'Yard Service',
        'service_in_port': 'Service in Port',
      };
      return map[serviceType || 'actual_sea_service'] || 'Actual Sea Service';
    };

    // --- Calculate statistics ---
    let totalDays = 0;
    confirmedEntries.forEach((entry) => { if (entry.sea_days) totalDays += entry.sea_days; });

    // One block per vessel identity: a renamed or reflagged vessel gets a block for
    // each name/flag, in date order, with the particulars in force at the time.
    const entriesByVessel: { [vesselKey: string]: typeof confirmedEntries } = {};
    [...confirmedEntries]
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .forEach((entry) => {
        const key = `${entry.vessel_id}|${(entry as { identity_period?: string }).identity_period ?? "start"}`;
        if (!entriesByVessel[key]) entriesByVessel[key] = [];
        entriesByVessel[key].push(entry);
      });

    // --- Foreland Marine brand palette ---
    const STEEL_BLUE = '#5386B6';
    const DEEP_NAVY = '#040D1A';
    const TEXT_BODY = '#4A5568';
    const LIGHT_BG = '#F7F9FC';
    const BORDER = '#E2E8F0';

    // --- Create PDF ---
    const doc = new PDFDocument({
      bufferPages: true,
      size: 'A4',
      margins: { top: 50, bottom: 70, left: 50, right: 50 },
    });

    // Register Nunito Sans fonts
    const fontsDir = path.join(ASSETS_DIR, 'fonts');
    try {
      doc.registerFont('NunitoSans-Light', path.join(fontsDir, 'NunitoSans-Light.ttf'));
      doc.registerFont('NunitoSans', path.join(fontsDir, 'NunitoSans-Regular.ttf'));
      doc.registerFont('NunitoSans-SemiBold', path.join(fontsDir, 'NunitoSans-SemiBold.ttf'));
    } catch (err) {
      app.logger.warn({ err }, 'Failed to load Nunito Sans fonts, falling back to Helvetica');
      doc.registerFont('NunitoSans-Light', 'Helvetica');
      doc.registerFont('NunitoSans', 'Helvetica');
      doc.registerFont('NunitoSans-SemiBold', 'Helvetica-Bold');
    }

    const ML = 50;  // margin left
    const MR = 50;  // margin right
    const PW = doc.page.width;
    const CW = PW - ML - MR; // content width
    const PAGE_BOTTOM = doc.page.height - 70;

    const ensureSpace = (needed: number) => {
      if (doc.y + needed > PAGE_BOTTOM) doc.addPage();
    };

    // ============================================================
    // HEADER
    // ============================================================
    const logoPath = path.join(ASSETS_DIR, 'brandmark-logo.png');
    try {
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, ML, 38, { width: 150 });
      }
    } catch (err) {
      app.logger.warn({ err }, 'Failed to load logo from disk');
    }

    // Report date (right-aligned)
    doc.font('NunitoSans').fontSize(9).fillColor(TEXT_BODY);
    doc.text(formatDate(new Date()), 0, 45, { width: PW - MR, align: 'right' });

    // Section label
    doc.font('NunitoSans-SemiBold').fontSize(9).fillColor(STEEL_BLUE);
    doc.text(tpl.title, ML, 82, { characterSpacing: 2.5 });

    // Accent line
    doc.strokeColor(STEEL_BLUE).lineWidth(0.75);
    doc.moveTo(ML, 100).lineTo(PW - MR, 100).stroke();
    doc.y = 115;

    // ============================================================
    // SEAFARER DETAILS
    // ============================================================
    doc.font('NunitoSans-Light').fontSize(20).fillColor(DEEP_NAVY);
    doc.text(userProfile.name || 'Unnamed Seafarer', ML, doc.y);
    doc.moveDown(0.5);

    const detailStartY = doc.y;
    const leftColX = ML;
    const rightColX = ML + 260;
    const detailLineH = 16;

    const drawDetail = (label: string, value: string, x: number, y: number): number => {
      doc.font('NunitoSans-SemiBold').fontSize(7.5).fillColor(STEEL_BLUE);
      doc.text(label.toUpperCase(), x, y, { characterSpacing: 1 });
      doc.font('NunitoSans').fontSize(9).fillColor(DEEP_NAVY);
      doc.text(value, x, y + 10, { width: 230 });
      const h = doc.heightOfString(value, { width: 230 });
      return y + 10 + h + 6;
    };

    // Left column
    let leftY = detailStartY;
    if (userProfile.email) leftY = drawDetail('Email', userProfile.email, leftColX, leftY);
    if (userProfile.department) leftY = drawDetail('Department', formatDepartment(userProfile.department), leftColX, leftY);
    if (userProfile.address) leftY = drawDetail('Address', userProfile.address, leftColX, leftY);

    // Right column
    let rightY = detailStartY;
    if (userProfile.tel_no) rightY = drawDetail('Telephone', userProfile.tel_no, rightColX, rightY);
    if (userProfile.date_of_birth) rightY = drawDetail('Date of birth', formatDateOfBirth(userProfile.date_of_birth), rightColX, rightY);
    if ((userProfile as any).nationality) rightY = drawDetail('Nationality', (userProfile as any).nationality, rightColX, rightY);
    if (userProfile.srb_no) rightY = drawDetail('SRB number', userProfile.srb_no, rightColX, rightY);
    if (userProfile.pya_membership_no) rightY = drawDetail('PYA membership', userProfile.pya_membership_no, rightColX, rightY);
    if ((userProfile as any).maritime_authority) {
      const authorityLabels: { [key: string]: string } = {
        'mca': 'MCA (UK)',
        'uscg': 'USCG (USA)',
        'amsa': 'AMSA (Australia)',
        'mnz': 'MNZ (New Zealand)',
      };
      const authorityValue = authorityLabels[(userProfile as any).maritime_authority] || (userProfile as any).maritime_authority;
      rightY = drawDetail('Maritime Authority', authorityValue, rightColX, rightY);
    }

    doc.y = Math.max(leftY, rightY) + 5;

    // Separator
    doc.strokeColor(STEEL_BLUE).lineWidth(0.5);
    doc.moveTo(ML, doc.y).lineTo(PW - MR, doc.y).stroke();
    doc.y += 15;

    // ============================================================
    // TOTAL SERVICE SUMMARY
    // ============================================================
    const summaryY = doc.y;
    doc.fillColor(STEEL_BLUE).rect(ML, summaryY, 3, 48).fill();
    doc.fillColor(LIGHT_BG).rect(ML + 3, summaryY, CW - 3, 48).fill();

    doc.font('NunitoSans-SemiBold').fontSize(8).fillColor(STEEL_BLUE);
    doc.text('TOTAL SERVICE', ML + 15, summaryY + 8, { characterSpacing: 1.5 });

    doc.font('NunitoSans-Light').fontSize(22).fillColor(DEEP_NAVY);
    doc.text(`${totalDays} days`, ML + 15, summaryY + 22);

    doc.y = summaryY + 58;
    doc.moveDown(0.3);

    // ============================================================
    // VESSEL BREAKDOWN
    // ============================================================
    if (Object.keys(entriesByVessel).length > 0) {
      doc.font('NunitoSans-SemiBold').fontSize(8).fillColor(STEEL_BLUE);
      doc.text('VESSEL BREAKDOWN', ML, doc.y, { characterSpacing: 2 });
      doc.moveDown(0.5);

      const vesselKeys = Object.keys(entriesByVessel);
      vesselKeys.forEach((vesselKey, vesselIndex) => {
        const vesselEntries = entriesByVessel[vesselKey];
        const vesselId = vesselKey.split('|')[0];
        const record = allVessels.find((v) => v.id === vesselId);
        if (!record) return;
        // Identity fields as of this block's entries; other particulars from the record
        const vessel = { ...record, ...(vesselEntries[0]?.vessel ?? {}) };

        // Build particulars
        const particulars: Array<[string, string]> = [];
        if (vessel.mmsi) particulars.push(['MMSI', vessel.mmsi]);
        if (vessel.imo_number) particulars.push(['IMO Number', vessel.imo_number]);
        if (vessel.callsign) particulars.push(['Callsign', vessel.callsign]);
        if (vessel.flag) particulars.push(['Flag', vessel.flag]);
        if (vessel.official_number) particulars.push(['Official No.', vessel.official_number]);
        if (vessel.type) particulars.push(['Type', vessel.type]);
        if (vessel.length_metres) particulars.push(['Length', `${vessel.length_metres}m`]);
        if (vessel.gross_tonnes) particulars.push(['Gross Tonnes', String(vessel.gross_tonnes)]);
        if (vessel.tonnage_itc) particulars.push(['ITC Tonnage', String(vessel.tonnage_itc)]);
        // AMSA and MNZ engineering certificates are banded on propulsion power
        // rather than tonnage, so a testimonial without kW is missing the one
        // figure the assessor needs.
        if (vessel.engine_kilowatts) particulars.push(['Propulsion Power', `${vessel.engine_kilowatts} kW`]);
        // A renamed or reflagged vessel is split into blocks: show which dates each covers
        if (vesselKeys.filter((k) => k.startsWith(`${vesselId}|`)).length > 1 && vesselEntries.length) {
          const last = vesselEntries[vesselEntries.length - 1];
          particulars.push(['Service Dates', `${formatDate(vesselEntries[0].start_time)} to ${formatDate(last.end_time ?? last.start_time)}`]);
        }

        // Calculate service types for this vessel
        const vesselServiceTypes: { [key: string]: number } = {};
        vesselEntries.forEach((entry) => {
          const st = entry.service_type || 'actual_sea_service';
          if (!vesselServiceTypes[st]) vesselServiceTypes[st] = 0;
          if (entry.sea_days) vesselServiceTypes[st] += entry.sea_days;
        });

        const particularsRows = Math.ceil(particulars.length / 2);
        const serviceRows = Object.keys(vesselServiceTypes).length;
        const spaceNeeded = 35 + (particularsRows * 18) + 25 + (serviceRows * 16) + 35;
        ensureSpace(spaceNeeded);

        // Accent line above vessel name
        doc.strokeColor(STEEL_BLUE).lineWidth(1);
        doc.moveTo(ML, doc.y).lineTo(PW - MR, doc.y).stroke();
        doc.y += 10;

        // Vessel name
        doc.font('NunitoSans-Light').fontSize(16).fillColor(DEEP_NAVY);
        doc.text(vessel.vessel_name, ML, doc.y);
        doc.moveDown(0.4);

        // Vessel particulars — two-column grid
        const pLeftX = ML;
        const pRightX = ML + 250;
        let pY = doc.y;

        for (let i = 0; i < particulars.length; i += 2) {
          const [label1, value1] = particulars[i];

          doc.font('NunitoSans-SemiBold').fontSize(7.5).fillColor(STEEL_BLUE);
          doc.text(label1.toUpperCase(), pLeftX, pY, { characterSpacing: 0.5 });
          doc.font('NunitoSans').fontSize(9).fillColor(DEEP_NAVY);
          doc.text(value1, pLeftX + 85, pY, { width: 150 });

          if (particulars[i + 1]) {
            const [label2, value2] = particulars[i + 1];
            doc.font('NunitoSans-SemiBold').fontSize(7.5).fillColor(STEEL_BLUE);
            doc.text(label2.toUpperCase(), pRightX, pY, { characterSpacing: 0.5 });
            doc.font('NunitoSans').fontSize(9).fillColor(DEEP_NAVY);
            doc.text(value2, pRightX + 85, pY, { width: 150 });
          }
          pY += 18;
        }
        doc.y = pY + 5;

        // Service breakdown label
        doc.font('NunitoSans-SemiBold').fontSize(7.5).fillColor(STEEL_BLUE);
        doc.text('SERVICE BREAKDOWN', ML, doc.y, { characterSpacing: 1 });
        doc.moveDown(0.3);

        // Service type rows
        Object.entries(vesselServiceTypes).forEach(([serviceType, days]) => {
          const rowY = Math.round(doc.y);
          doc.font('NunitoSans').fontSize(9).fillColor(DEEP_NAVY);
          doc.text(formatServiceType(serviceType), ML + 10, rowY, { width: 350 });
          doc.font('NunitoSans-SemiBold').fontSize(9).fillColor(DEEP_NAVY);
          doc.text(`${days}d`, 0, rowY, { width: PW - MR, align: 'right' });
          doc.y = rowY + 16;
        });

        // Watchkeeping hours for this vessel
        let vesselBridgeHours = 0;
        let vesselEngineHours = 0;
        vesselEntries.forEach((entry) => {
          if (entry.bridge_watch_hours) vesselBridgeHours += parseFloat(String(entry.bridge_watch_hours));
          if (entry.engine_watch_hours) vesselEngineHours += parseFloat(String(entry.engine_watch_hours));
        });
        if (vesselBridgeHours > 0 || vesselEngineHours > 0) {
          const wkY = Math.round(doc.y);
          doc.font('NunitoSans-SemiBold').fontSize(7.5).fillColor(STEEL_BLUE);
          doc.text('WATCHKEEPING HOURS', ML, wkY, { characterSpacing: 1 });
          doc.y = wkY + 14;

          if (vesselBridgeHours > 0) {
            const bY = Math.round(doc.y);
            doc.font('NunitoSans').fontSize(9).fillColor(DEEP_NAVY);
            doc.text('Bridge Watch', ML + 10, bY, { width: 350 });
            doc.font('NunitoSans-SemiBold').fontSize(9).fillColor(DEEP_NAVY);
            doc.text(`${vesselBridgeHours.toFixed(1)}h`, 0, bY, { width: PW - MR, align: 'right' });
            doc.y = bY + 16;
          }
          if (vesselEngineHours > 0) {
            const eY = Math.round(doc.y);
            doc.font('NunitoSans').fontSize(9).fillColor(DEEP_NAVY);
            doc.text('Engine Watch', ML + 10, eY, { width: 350 });
            doc.font('NunitoSans-SemiBold').fontSize(9).fillColor(DEEP_NAVY);
            doc.text(`${vesselEngineHours.toFixed(1)}h`, 0, eY, { width: PW - MR, align: 'right' });
            doc.y = eY + 16;
          }
        }

        // Vessel subtotal
        doc.y += 3;
        let vesselDays = 0;
        vesselEntries.forEach((entry) => { if (entry.sea_days) vesselDays += entry.sea_days; });

        const subY = Math.round(doc.y);
        doc.fillColor(STEEL_BLUE).rect(ML, subY, 3, 24).fill();
        doc.fillColor(LIGHT_BG).rect(ML + 3, subY, CW - 3, 24).fill();
        doc.font('NunitoSans-SemiBold').fontSize(10).fillColor(DEEP_NAVY);
        doc.text(`Vessel subtotal: ${vesselDays} days`, ML + 12, subY + 6);
        doc.y = subY + 32;

        if (vesselIndex < vesselKeys.length - 1) {
          doc.moveDown(0.4);
        }
      });

      doc.moveDown(0.3);
    }

    // ============================================================
    // SERVICE TYPE DEFINITIONS
    // ============================================================
    ensureSpace(140);
    doc.moveDown(0.3);
    doc.strokeColor(BORDER).lineWidth(0.5);
    doc.moveTo(ML, doc.y).lineTo(PW - MR, doc.y).stroke();
    doc.y += 12;

    doc.font('NunitoSans-SemiBold').fontSize(8).fillColor(STEEL_BLUE);
    doc.text('SERVICE TYPE DEFINITIONS', ML, doc.y, { characterSpacing: 2 });
    doc.moveDown(0.5);

    const serviceTypeDefinitions = [
      { type: 'Actual Sea Service', desc: 'Sea service performed while the vessel is underway, engaged in trading or on passage.' },
      { type: 'Watchkeeping Service', desc: 'Time spent on bridge watch or engine room watch while at sea.' },
      { type: 'Stand-by Service', desc: 'Service performed during periods of standby while the vessel is at sea.' },
      { type: 'Service in Port', desc: 'Service performed while the vessel is in port, including maintenance and cargo operations.' },
      { type: 'Yard Service', desc: 'Service performed during shipyard periods, including new building or major repairs.' },
    ];

    serviceTypeDefinitions.forEach((def) => {
      doc.font('NunitoSans-SemiBold').fontSize(9).fillColor(STEEL_BLUE);
      doc.text(def.type, ML, doc.y);
      doc.font('NunitoSans').fontSize(8.5).fillColor(TEXT_BODY);
      doc.text(def.desc, ML, doc.y, { width: CW });
      doc.moveDown(0.4);
    });

    // ============================================================
    // LEAVE PERIODS
    // ============================================================
    if (pdfLeavePeriods.length > 0) {
      const formatLeaveReasonPdf = (reason: string | null): string => {
        const map: { [key: string]: string } = {
          'annual_leave': 'Annual Leave',
          'sick_leave': 'Sick Leave',
          'personal': 'Personal',
          'training': 'Training',
          'other': 'Other',
        };
        return map[reason || ''] || reason || '';
      };

      ensureSpace(80);
      doc.moveDown(0.3);
      doc.strokeColor(BORDER).lineWidth(0.5);
      doc.moveTo(ML, doc.y).lineTo(PW - MR, doc.y).stroke();
      doc.y += 12;

      doc.font('NunitoSans-SemiBold').fontSize(8).fillColor(STEEL_BLUE);
      doc.text('LEAVE PERIODS', ML, doc.y, { characterSpacing: 2 });
      doc.moveDown(0.5);

      // Table header
      const lpColWidths = [90, 90, 130, 100, CW - 410];
      const lpHeaders = ['From', 'To', 'Vessel', 'Reason', 'Notes'];

      const lpHeaderY = Math.round(doc.y);
      doc.fillColor(LIGHT_BG).rect(ML, lpHeaderY - 2, CW, 16).fill();
      doc.font('NunitoSans-SemiBold').fontSize(7.5).fillColor(STEEL_BLUE);
      let lpX = ML;
      lpHeaders.forEach((header, i) => {
        doc.text(header.toUpperCase(), lpX + 4, lpHeaderY, { width: lpColWidths[i], characterSpacing: 0.5 });
        lpX += lpColWidths[i];
      });
      doc.y = lpHeaderY + 18;

      // Sort by start_date
      const sortedLeavePeriods = [...pdfLeavePeriods].sort(
        (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
      );

      const leaveChanges = await identityChanges(app, allVessels.map((v) => v.id));
      sortedLeavePeriods.forEach((lp) => {
        ensureSpace(20);
        const rowY = Math.round(doc.y);
        const record = allVessels.find((v) => v.id === lp.vessel_id);
        const vessel = record && identityAsOf(record, leaveChanges.get(record.id) ?? [], new Date(lp.start_date));

        doc.font('NunitoSans').fontSize(8.5).fillColor(DEEP_NAVY);
        let x = ML;
        const cells = [
          formatDate(lp.start_date),
          formatDate(lp.end_date),
          vessel?.vessel_name || '--',
          formatLeaveReasonPdf(lp.reason),
          lp.notes || '',
        ];
        cells.forEach((cell, i) => {
          doc.text(cell, x + 4, rowY, { width: lpColWidths[i] - 8 });
          x += lpColWidths[i];
        });
        doc.y = rowY + 16;
      });

      doc.moveDown(0.3);
    }

    // ============================================================
    // DECLARATION block — required for testimonial submissions
    // ============================================================
    ensureSpace(160);
    doc.moveDown(0.6);
    doc.strokeColor(BORDER).lineWidth(0.5);
    doc.moveTo(ML, doc.y).lineTo(PW - MR, doc.y).stroke();
    doc.y += 12;

    doc.font('NunitoSans-SemiBold').fontSize(8).fillColor(STEEL_BLUE);
    doc.text('DECLARATION', ML, doc.y, { characterSpacing: 2 });
    doc.moveDown(0.4);

    doc.font('NunitoSans').fontSize(9).fillColor(TEXT_BODY);
    doc.text(tpl.declaration, ML, doc.y, { width: CW, lineGap: 3 });
    doc.moveDown(1);

    doc.font('NunitoSans').fontSize(8).fillColor(TEXT_BODY);
    doc.text(`Submitted to: ${tpl.bodyName}`, ML, doc.y);
    doc.moveDown(1.5);

    // Signature line + name + date.
    // If the user has saved a signature image, embed it on top of the line;
    // otherwise leave the line blank for printing/scanning.
    const sigLineY = doc.y;
    const userSignature = (userProfile as any).signature_image as string | null | undefined;

    doc.strokeColor(DEEP_NAVY).lineWidth(0.5);
    doc.moveTo(ML, sigLineY + 30).lineTo(ML + 220, sigLineY + 30).stroke();
    doc.moveTo(ML + 260, sigLineY + 30).lineTo(ML + 380, sigLineY + 30).stroke();

    if (userSignature && userSignature.startsWith('data:image/')) {
      try {
        // Strip the data URL prefix to get raw base64
        const base64 = userSignature.split(',')[1];
        const buffer = Buffer.from(base64, 'base64');
        doc.image(buffer, ML, sigLineY, { width: 200, height: 32, fit: [200, 32] });
        // Auto-fill the date next to the signature
        doc.font('NunitoSans').fontSize(10).fillColor(DEEP_NAVY);
        doc.text(formatDate(new Date()), ML + 260, sigLineY + 12);
      } catch (sigErr) {
        app.logger.warn({ err: sigErr }, 'Failed to embed user signature, leaving blank');
      }
    }

    doc.font('NunitoSans').fontSize(8).fillColor(TEXT_BODY);
    doc.text('Signature', ML, sigLineY + 36);
    doc.text('Date', ML + 260, sigLineY + 36);

    doc.y = sigLineY + 60;
    doc.font('NunitoSans-SemiBold').fontSize(9).fillColor(DEEP_NAVY);
    doc.text(userProfile.name || '', ML, doc.y);
    doc.font('NunitoSans').fontSize(8).fillColor(TEXT_BODY);
    doc.text('Name (please print)', ML, doc.y + 12);

    // ============================================================
    // FOOTER (on every page) — must happen BEFORE doc.end()
    // ============================================================
    const finalPageRange = doc.bufferedPageRange();
    const totalPages = finalPageRange.count;

    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);

      const footerY = doc.page.height - 55;

      doc.strokeColor(BORDER).lineWidth(0.5);
      doc.moveTo(ML, footerY).lineTo(PW - MR, footerY).stroke();

      doc.font('NunitoSans').fontSize(7).fillColor(TEXT_BODY);
      doc.text(
        'Foreland Marine Consultancy Ltd, 7 Bell Yard, London WC2A 2JR',
        ML, footerY + 8, { width: 300 }
      );

      doc.font('NunitoSans').fontSize(7).fillColor(TEXT_BODY);
      doc.text(
        `Page ${i + 1} of ${totalPages}  |  Generated by SeaTime Tracker`,
        0, footerY + 8, { width: PW - MR, align: 'right' }
      );
    }

    // End the document AFTER footers are written
    doc.end();

    app.logger.info(
      { entryCount: confirmedEntries.length, vesselCount: Object.keys(entriesByVessel).length, pageCount: totalPages },
      'PDF report generated successfully'
    );

    const stream = doc as unknown as Readable;
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="seatime_report_${new Date().toISOString().split('T')[0]}.pdf"`);
    return reply.send(stream);
  });
}
