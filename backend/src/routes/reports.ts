import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import PDFDocument from "pdfkit";
import { Readable } from "stream";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

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

    // SECTION 1: Build CSV with vessel particulars (existing summary section)
    const headers = [
      'Date',
      'Vessel Name',
      'MMSI',
      'Flag',
      'Official Number',
      'Vessel Type',
      'Length (metres)',
      'Gross Tonnes',
      'Start Time',
      'End Time',
      'Sea Days',
      'Service Type',
      'Status',
      'Notes',
    ];
    const rows = entries.map((entry) => [
      new Date(entry.start_time).toISOString().split('T')[0],
      entry.vessel?.vessel_name || '',
      entry.vessel?.mmsi || '',
      entry.vessel?.flag || '',
      entry.vessel?.official_number || '',
      entry.vessel?.type || '',
      entry.vessel?.length_metres || '',
      entry.vessel?.gross_tonnes || '',
      new Date(entry.start_time).toISOString(),
      entry.end_time ? new Date(entry.end_time).toISOString() : '',
      entry.sea_days || 0,
      entry.service_type || 'actual_sea_service',
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
      'Flag',
      'Official Number',
      'Vessel Type',
      'Length (metres)',
      'Gross Tonnes',
      'Start Position',
      'End Position',
      'Distance (nm)',
      'Sea Days',
      'Service Type',
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

      return [
        String(index + 1), // Voyage number
        formatDate(entry.start_time), // Start date
        entry.end_time ? formatDate(entry.end_time) : '', // End date
        entry.vessel?.vessel_name || '',
        entry.vessel?.mmsi || '',
        entry.vessel?.flag || '',
        entry.vessel?.official_number || '',
        entry.vessel?.type || '',
        entry.vessel?.length_metres || '',
        entry.vessel?.gross_tonnes || '',
        startPosition,
        endPosition,
        distance,
        entry.sea_days || 0,
        formatServiceType(entry.service_type),
        entry.notes || '',
      ];
    });

    const voyageSection = [
      voyageHeaders.map((h) => `"${h}"`).join(','),
      ...voyageRows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ];

    // Combine both sections with header and blank rows between them
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

    // Calculate total days (sum of sea_days column - each entry is 0 or 1)
    let total_days = 0;
    entries.forEach((entry) => {
      if (entry.sea_days) {
        total_days += entry.sea_days;
      }
    });

    // Group by vessel - return as array
    const vesselMap: { [key: string]: number } = {};
    entries.forEach((entry) => {
      const vessel_name = entry.vessel?.vessel_name || 'Unknown';
      if (!vesselMap[vessel_name]) {
        vesselMap[vessel_name] = 0;
      }
      if (entry.sea_days) {
        vesselMap[vessel_name] += entry.sea_days;
      }
    });

    const entries_by_vessel = Object.entries(vesselMap)
      .map(([vessel_name, total_days]) => ({
        vessel_name,
        total_days,
      }))
      .sort((a, b) => b.total_days - a.total_days); // Sort by days descending

    // Group by month - return as array
    const monthMap: { [key: string]: number } = {};
    entries.forEach((entry) => {
      const month = new Date(entry.start_time).toISOString().slice(0, 7); // YYYY-MM format
      if (!monthMap[month]) {
        monthMap[month] = 0;
      }
      if (entry.sea_days) {
        monthMap[month] += entry.sea_days;
      }
    });

    const entries_by_month = Object.entries(monthMap)
      .map(([month, total_days]) => ({
        month,
        total_days,
      }))
      .sort((a, b) => a.month.localeCompare(b.month)); // Sort by month ascending

    // Group by service type
    const serviceTypeMap: { [key: string]: number } = {};
    entries.forEach((entry) => {
      const service_type = entry.service_type || 'actual_sea_service';
      if (!serviceTypeMap[service_type]) {
        serviceTypeMap[service_type] = 0;
      }
      if (entry.sea_days) {
        serviceTypeMap[service_type] += entry.sea_days;
      }
    });

    const entries_by_service_type = Object.entries(serviceTypeMap)
      .map(([service_type, total_days]) => ({
        service_type,
        total_days,
      }))
      .sort((a, b) => b.total_days - a.total_days); // Sort by days descending

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
      entries_by_vessel,
      entries_by_month,
      entries_by_service_type,
    });
  });

  // GET /api/reports/pdf - Generate PDF report with date filtering
  fastify.get<{ Querystring: { startDate?: string; endDate?: string } }>('/api/reports/pdf', {
    schema: {
      description: 'Generate PDF report of sea time entries with optional date filtering (requires authentication)',
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

    const { startDate, endDate } = request.query;

    app.logger.info({ userId, startDate, endDate }, 'Generating PDF report for user');

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

    const entriesByVessel: { [vesselId: string]: typeof confirmedEntries } = {};
    confirmedEntries.forEach((entry) => {
      if (!entriesByVessel[entry.vessel_id]) entriesByVessel[entry.vessel_id] = [];
      entriesByVessel[entry.vessel_id].push(entry);
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
    doc.text('SEA TIME REPORT', ML, 82, { characterSpacing: 2.5 });

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
      vesselKeys.forEach((vesselId, vesselIndex) => {
        const vesselEntries = entriesByVessel[vesselId];
        const vessel = allVessels.find((v) => v.id === vesselId);
        if (!vessel) return;

        // Build particulars
        const particulars: Array<[string, string]> = [];
        if (vessel.mmsi) particulars.push(['MMSI', vessel.mmsi]);
        if (vessel.callsign) particulars.push(['Callsign', vessel.callsign]);
        if (vessel.flag) particulars.push(['Flag', vessel.flag]);
        if (vessel.official_number) particulars.push(['Official No.', vessel.official_number]);
        if (vessel.type) particulars.push(['Type', vessel.type]);
        if (vessel.length_metres) particulars.push(['Length', `${vessel.length_metres}m`]);
        if (vessel.gross_tonnes) particulars.push(['Gross Tonnes', String(vessel.gross_tonnes)]);

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
