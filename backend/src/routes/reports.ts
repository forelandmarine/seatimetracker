import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import PDFDocument from "pdfkit";
import { Readable } from "stream";
import { extractUserIdFromRequest } from "../middleware/auth.js";

// Helper function to fetch and convert image URL to Buffer with enhanced error logging
async function fetchImageAsBuffer(url: string): Promise<Buffer | null> {
  const maxRetries = 2;
  const timeout = 10000; // 10 seconds
  const retryDelay = 1000; // 1 second between retries

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[fetchImageAsBuffer] Attempt ${attempt}/${maxRetries}: Fetching image from ${url}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log(`[fetchImageAsBuffer] Response status: ${response.status}`);
      console.log(`[fetchImageAsBuffer] Response headers:`, {
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length'),
        etag: response.headers.get('etag'),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[fetchImageAsBuffer] HTTP error ${response.status}: ${response.statusText}`);
        console.error(`[fetchImageAsBuffer] Response body (first 500 chars): ${errorText.substring(0, 500)}`);
        throw new Error(`Failed to fetch image: HTTP ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('image')) {
        console.error(`[fetchImageAsBuffer] Invalid content-type: ${contentType} (expected image/*)`);
        throw new Error(`Invalid content-type: expected image/*, got ${contentType}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      console.log(`[fetchImageAsBuffer] Successfully fetched image. Buffer size: ${buffer.length} bytes`);
      return buffer;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[fetchImageAsBuffer] Attempt ${attempt} failed:`, {
        url,
        error: errorMessage,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      });

      if (attempt < maxRetries) {
        console.log(`[fetchImageAsBuffer] Waiting ${retryDelay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  console.error(`[fetchImageAsBuffer] Failed to fetch image after ${maxRetries} attempts: ${url}`);
  return null;
}

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
        'Summary report denied: subscription not active'
      );
      return reply.code(403).send({
        error: 'Active subscription required to generate reports',
      });
    }

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

    // Helper function to format date as DD/MM/YYYY
    const formatDate = (date: Date | string) => {
      const d = typeof date === 'string' ? new Date(date) : date;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    };

    // Helper function to format time as HH:MM
    const formatTime = (date: Date | string) => {
      const d = typeof date === 'string' ? new Date(date) : date;
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
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

    // Helper function to format coordinates
    const formatCoordinate = (coord: string | number | null | undefined) => {
      if (!coord) return '';
      const num = typeof coord === 'string' ? parseFloat(coord) : coord;
      return num.toFixed(4);
    };

    // Calculate summary statistics
    let totalDays = 0;
    confirmedEntries.forEach((entry) => {
      if (entry.sea_days) {
        totalDays += entry.sea_days;
      }
    });

    // Group entries by vessel
    const entriesByVessel: { [vesselId: string]: typeof confirmedEntries } = {};
    confirmedEntries.forEach((entry) => {
      if (!entriesByVessel[entry.vessel_id]) {
        entriesByVessel[entry.vessel_id] = [];
      }
      entriesByVessel[entry.vessel_id].push(entry);
    });

    // Calculate service type totals
    const serviceTypeTotals: { [key: string]: number } = {};
    confirmedEntries.forEach((entry) => {
      const serviceType = entry.service_type || 'actual_sea_service';
      if (!serviceTypeTotals[serviceType]) {
        serviceTypeTotals[serviceType] = 0;
      }
      if (entry.sea_days) {
        serviceTypeTotals[serviceType] += entry.sea_days;
      }
    });

    // Create PDF document with professional design
    const doc = new PDFDocument({
      bufferPages: true,
      size: 'A4',
      margin: 50,
      bufferSize: 4096,
    });

    // Color Palette from app design
    const PRIMARY_COLOR = '#0077BE';        // Ocean Blue
    const SECONDARY_COLOR = '#003D5C';      // Deep Sea Blue
    const ACCENT_COLOR = '#00A8E8';         // Bright Cyan
    const LIGHT_BG = '#F0F8FF';             // Alice Blue
    const CARD_BG = '#FFFFFF';              // White
    const TEXT_PRIMARY = '#1A1A1A';         // Dark text
    const TEXT_SECONDARY = '#5A6C7D';       // Muted text
    const BORDER_COLOR = '#D1E3F0';         // Light border
    const SUCCESS_COLOR = '#00C853';        // Green
    const HIGHLIGHT_BG = '#FFD54F';      // Gold

    // Helper function to format date of birth
    const formatDateOfBirth = (date: Date | string | null | undefined): string => {
      if (!date) return '';
      const d = typeof date === 'string' ? new Date(date) : date;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    };

    // Helper function to format department
    const formatDepartment = (dept: string | null | undefined): string => {
      if (!dept) return '';
      return dept.charAt(0).toUpperCase() + dept.slice(1);
    };

    // BRANDING HEADER TEXT (positioned on the left) - draw FIRST so logo appears on top
    doc.fillColor(PRIMARY_COLOR).fontSize(26).font('Helvetica-Bold').text('SeaTime Tracker', {
      x: 40,
      y: 38,
      width: 360,
      align: 'left'
    });
    doc.fillColor(TEXT_SECONDARY).fontSize(11).font('Helvetica').text('Digital Sea Time Logbook', {
      x: 40,
      y: 62,
      width: 360,
      align: 'left'
    });

    // Fetch and prepare logo to be drawn LAST (after all header elements)
    const logoUrl = 'https://prod-finalquest-user-projects-storage-bucket-aws.s3.amazonaws.com/user-projects/5e2bc1ec-bfa9-4840-8ffd-37bba15e1b0e/assets/images/28dfd0db-4dd4-428c-9b2e-c44573b6484d.png';
    app.logger.info({ logoUrl }, 'Starting logo fetch for PDF');
    const logoBuffer = await fetchImageAsBuffer(logoUrl);

    // Draw logo LAST so it appears on top layer
    if (logoBuffer) {
      try {
        app.logger.info({ bufferSize: logoBuffer.length }, 'Logo buffer received, embedding in PDF');
        doc.image(logoBuffer, 460, 30, { width: 100 });
        app.logger.info({ bufferSize: logoBuffer.length }, 'Foreland Marine Consultancy logo embedded successfully in PDF');
      } catch (error) {
        app.logger.warn({ err: error }, 'Failed to embed logo in PDF, continuing without logo');
      }
    } else {
      app.logger.warn({ logoUrl }, 'Logo buffer is null, continuing without logo');
    }

    // Set doc.y after header
    doc.y = 99;

    // USER INFORMATION HEADER BOX with two-column layout
    const headerBoxY = Math.round(doc.y);
    const headerBoxHeight = 99;
    doc.fillColor(LIGHT_BG).rect(40, headerBoxY, 520, headerBoxHeight).fill();
    doc.strokeColor(BORDER_COLOR).lineWidth(2).rect(40, headerBoxY, 520, headerBoxHeight).stroke();

    // Column positioning
    const leftColX = 55;
    const rightColX = 310;
    const colWidth = 220;
    const lineHeight = 12.1;

    // LEFT COLUMN: Address only
    let leftY = headerBoxY + 11;

    doc.fillColor(TEXT_PRIMARY).fontSize(9).font('Helvetica-Bold');
    doc.text('Address:', leftColX, leftY, { width: colWidth });
    leftY += lineHeight;

    doc.fontSize(9).font('Helvetica').fillColor(TEXT_SECONDARY);
    if (userProfile.address) {
      doc.text(userProfile.address, leftColX, leftY, { width: colWidth });
      leftY += lineHeight;
    }

    // RIGHT COLUMN: Tel, DOB, SRB, Generation Date
    let rightY = headerBoxY + 11;

    doc.fillColor(TEXT_PRIMARY).fontSize(9).font('Helvetica');

    if (userProfile.tel_no) {
      doc.fillColor(TEXT_SECONDARY);
      doc.text(`Tel: ${userProfile.tel_no}`, rightColX, rightY, { width: colWidth });
      rightY += lineHeight;
    }

    if (userProfile.date_of_birth) {
      doc.text(`DOB: ${formatDateOfBirth(userProfile.date_of_birth)}`, rightColX, rightY, { width: colWidth });
      rightY += lineHeight;
    }

    if (userProfile.srb_no) {
      doc.text(`SRB No: ${userProfile.srb_no}`, rightColX, rightY, { width: colWidth });
      rightY += lineHeight;
    }

    doc.text(`Generated: ${formatDate(new Date())}`, rightColX, rightY, { width: colWidth });
    rightY += lineHeight;

    doc.y = Math.round(headerBoxY + headerBoxHeight + 8.8);

    // Spacing before next section
    doc.moveDown(0.44);

    // TOTAL SERVICE DAYS SUMMARY - displayed before vessel breakdown
    const totalSummaryBoxY = Math.round(doc.y);
    doc.fillColor(LIGHT_BG).rect(40, totalSummaryBoxY, 520, 55).fill();
    doc.strokeColor(PRIMARY_COLOR).lineWidth(2).rect(40, totalSummaryBoxY, 520, 55).stroke();

    doc.fillColor(PRIMARY_COLOR).fontSize(13).font('Helvetica-Bold');
    doc.text(`Total Service Days: ${totalDays} days`, 55, totalSummaryBoxY + 8.8, { width: 450 });

    doc.fontSize(9).font('Helvetica');
    doc.fillColor(TEXT_SECONDARY).text('Across all vessels and service types', 55, totalSummaryBoxY + 27.5);

    doc.y = Math.round(totalSummaryBoxY + 60.5);
    doc.moveDown(0.33);

    // VESSEL-BY-VESSEL BREAKDOWN SECTION
    if (Object.keys(entriesByVessel).length > 0) {
      doc.fontSize(16).font('Helvetica-Bold').fillColor(PRIMARY_COLOR).text('Vessel-by-Vessel Breakdown');
      doc.moveDown(0.33);

      Object.entries(entriesByVessel).forEach(([vesselId, vesselEntries], vesselIndex) => {
        const vessel = allVessels.find((v) => v.id === vesselId);
        if (!vessel) return;

        // Calculate space needed for this vessel section
        const particulars: Array<[string, string]> = [];
        if (vessel.mmsi) particulars.push(['MMSI', vessel.mmsi]);
        if (vessel.callsign) particulars.push(['Callsign', vessel.callsign]);
        if (vessel.flag) particulars.push(['Flag', vessel.flag]);
        if (vessel.official_number) particulars.push(['Official Number', vessel.official_number]);
        if (vessel.type) particulars.push(['Type', vessel.type]);
        if (vessel.length_metres) particulars.push(['Length', `${vessel.length_metres}m`]);
        if (vessel.gross_tonnes) particulars.push(['Gross Tonnes', String(vessel.gross_tonnes)]);

        const vesselServiceTypes: { [key: string]: number } = {};
        vesselEntries.forEach((entry) => {
          const serviceType = entry.service_type || 'actual_sea_service';
          if (!vesselServiceTypes[serviceType]) {
            vesselServiceTypes[serviceType] = 0;
          }
          if (entry.sea_days) {
            vesselServiceTypes[serviceType] += entry.sea_days;
          }
        });

        const particularsRows = Math.ceil(particulars.length / 2);
        const serviceTypeRows = Object.keys(vesselServiceTypes).length;
        const spaceNeeded = 30.8 + (particularsRows * 15.4) + 17.6 + (serviceTypeRows * 13.2) + 25.3 + 8.8; // Header + particulars + service title + service items + subtotal + spacing

        // Check if we need a new page BEFORE vessel header
        if (doc.y > Math.round(doc.page.height - spaceNeeded - 66)) {
          doc.addPage();
        }

        // Vessel header with accent background
        const vesselHeaderY = Math.round(doc.y);
        doc.fillColor(ACCENT_COLOR).rect(40, vesselHeaderY, 520, 30.8).fill();
        doc.strokeColor(ACCENT_COLOR).lineWidth(2).rect(40, vesselHeaderY, 520, 30.8).stroke();
        doc.fillColor(PRIMARY_COLOR).fontSize(13).font('Helvetica-Bold');
        doc.text(vessel.vessel_name, 50, vesselHeaderY + 7.7, { width: 500 });
        doc.y = Math.round(vesselHeaderY + 33);

        // Vessel particulars - two column layout with reduced spacing
        doc.fillColor(TEXT_PRIMARY).fontSize(10).font('Helvetica');
        const leftX = 50;
        const rightX = 300;
        let currentY = Math.round(doc.y);

        for (let i = 0; i < particulars.length; i += 2) {
          const [label1, value1] = particulars[i];
          const [label2, value2] = particulars[i + 1] || [null, null];

          doc.fillColor(SECONDARY_COLOR).fontSize(10).font('Helvetica-Bold');
          doc.text(`${label1}:`, leftX, currentY);
          doc.fillColor(TEXT_PRIMARY).fontSize(10).font('Helvetica');
          doc.text(value1, leftX + 75, currentY, { width: 150 });

          if (label2) {
            doc.fillColor(SECONDARY_COLOR).fontSize(10).font('Helvetica-Bold');
            doc.text(`${label2}:`, rightX, currentY);
            doc.fillColor(TEXT_PRIMARY).fontSize(10).font('Helvetica');
            doc.text(value2, rightX + 75, currentY, { width: 150 });
          }

          currentY += 15.4;
        }

        doc.y = Math.round(currentY + 4.4);

        // Service type breakdown for this vessel
        doc.fontSize(11).font('Helvetica-Bold').fillColor(PRIMARY_COLOR).text('Sea Service Definition Breakdown:');
        doc.moveDown(0.22);

        doc.fillColor(TEXT_PRIMARY).fontSize(9).font('Helvetica');
        Object.entries(vesselServiceTypes).forEach(([serviceType, days]) => {
          const label = formatServiceType(serviceType);
          doc.text(`  • ${label}`, 50, Math.round(doc.y));
          doc.text(`${days}d`, 450, Math.round(doc.y), { align: 'right', width: 80 });
          doc.moveDown(0.275);
        });

        // Vessel totals in highlighted box
        let vesselDays = 0;
        vesselEntries.forEach((entry) => {
          if (entry.sea_days) {
            vesselDays += entry.sea_days;
          }
        });

        doc.moveDown(0.22);
        const vesselSubtotalY = Math.round(doc.y);
        doc.fillColor(LIGHT_BG).rect(40, vesselSubtotalY, 520, 25.3).fill();
        doc.strokeColor(ACCENT_COLOR).lineWidth(2).rect(40, vesselSubtotalY, 520, 25.3).stroke();
        doc.fillColor(PRIMARY_COLOR).fontSize(11).font('Helvetica-Bold');
        doc.text(`Vessel Subtotal: ${vesselDays} days`, 55, vesselSubtotalY + 4.4);
        doc.y = Math.round(vesselSubtotalY + 28.6);

        // Add minimal spacing between vessels
        if (vesselIndex < Object.keys(entriesByVessel).length - 1) {
          doc.moveDown(0.165);
        }
      });

      doc.moveDown(0.22);
    }

    // SERVICE TYPE DEFINITIONS SECTION
    doc.moveDown(0.33);

    doc.strokeColor(BORDER_COLOR).lineWidth(1.5).moveTo(40, Math.round(doc.y)).lineTo(560, Math.round(doc.y)).stroke();
    doc.moveDown(0.22);

    doc.fontSize(14).font('Helvetica-Bold').fillColor(PRIMARY_COLOR).text('Service Type Definitions');
    doc.moveDown(0.22);

    const serviceTypeDefinitions = [
      {
        type: 'Actual Sea Service',
        desc: 'Sea service performed while the vessel is underway, engaged in trading or on passage.',
      },
      {
        type: 'Watchkeeping Service',
        desc: 'Time spent on bridge watch or engine room watch while at sea.',
      },
      {
        type: 'Stand-by Service',
        desc: 'Service performed during periods of standby while the vessel is at sea.',
      },
      {
        type: 'Service in Port',
        desc: 'Service performed while the vessel is in port, including maintenance and cargo operations.',
      },
      {
        type: 'Yard Service',
        desc: 'Service performed during shipyard periods, including new building or major repairs.',
      },
    ];

    doc.fillColor(TEXT_PRIMARY).fontSize(9).font('Helvetica');
    serviceTypeDefinitions.forEach((def, index) => {
      const rowHeight = 22;
      // Alternate row backgrounds
      if (index % 2 === 0) {
        doc.fillColor(LIGHT_BG).rect(40, Math.round(doc.y) - 1, 520, rowHeight).fill();
      }

      // Left accent border
      doc.fillColor(ACCENT_COLOR).rect(40, Math.round(doc.y) - 1, 4, rowHeight).fill();

      doc.fillColor(SECONDARY_COLOR).fontSize(10).font('Helvetica-Bold');
      doc.text(def.type, 55, Math.round(doc.y));
      doc.fillColor(TEXT_SECONDARY).fontSize(9).font('Helvetica');
      doc.text(def.desc, 55, Math.round(doc.y), { width: 485 });
      doc.moveDown(0.055);
    });

    // FOOTER with page numbers and company details
    doc.end();

    // Calculate total pages after content is finalized
    const finalPageRange = doc.bufferedPageRange();
    const totalPages = finalPageRange.count;

    // Add footers to all pages using page switching
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);

      // Separator line above footer
      doc.strokeColor(BORDER_COLOR).lineWidth(1);
      doc.moveTo(40, Math.round(doc.page.height - 45)).lineTo(560, Math.round(doc.page.height - 45)).stroke();

      // Company footer information
      doc.fontSize(8).fillColor(TEXT_PRIMARY).font('Helvetica');
      doc.text(
        'Foreland Marine Consultancy Ltd, 7 Bell Yard, London WC2A 2JR United Kingdom',
        50,
        Math.round(doc.page.height - 40),
        { align: 'left' }
      );

      // Page number and generation info centered
      doc.fontSize(7).fillColor(TEXT_SECONDARY).font('Helvetica');
      doc.text(
        `Page ${i + 1} of ${totalPages} | Generated by SeaTime Tracker`,
        50,
        Math.round(doc.page.height - 22),
        { align: 'center' }
      );
    }

    app.logger.info(
      { entryCount: confirmedEntries.length, vesselCount: Object.keys(entriesByVessel).length, pageCount: totalPages },
      'PDF report generated successfully'
    );

    // Convert to buffer and send
    const stream = doc as unknown as Readable;
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="seatime_report_${new Date().toISOString().split('T')[0]}.pdf"`);
    return reply.send(stream);
  });
}
