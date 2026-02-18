import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import PDFDocument from "pdfkit";
import { Readable } from "stream";
import { extractUserIdFromRequest } from "../middleware/auth.js";

// Helper function to fetch and convert image URL to Buffer
async function fetchImageAsBuffer(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error(`Error fetching image from ${url}:`, error);
    return null;
  }
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

    app.logger.info({ count: entries.length }, 'Filtered entries for CSV report');

    // Build CSV with vessel particulars
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
      'Duration Hours',
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
      entry.duration_hours || '',
      entry.service_type || 'actual_sea_service',
      entry.status,
      entry.notes || '',
    ]);

    const csv = [
      headers.map((h) => `"${h}"`).join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    app.logger.info({ headerCount: headers.length, rowCount: rows.length }, 'CSV report generated');

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
            total_hours: { type: 'number' },
            total_days: { type: 'number' },
            entries_by_vessel: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  vessel_name: { type: 'string' },
                  total_hours: { type: 'number' },
                },
              },
            },
            entries_by_month: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  month: { type: 'string' },
                  total_hours: { type: 'number' },
                },
              },
            },
            entries_by_service_type: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  service_type: { type: 'string' },
                  total_hours: { type: 'number' },
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

    // Calculate total hours
    let total_hours = 0;
    entries.forEach((entry) => {
      if (entry.duration_hours) {
        total_hours += parseFloat(String(entry.duration_hours));
      }
    });

    // Calculate total days (24-hour periods)
    const total_days = Math.round((total_hours / 24) * 100) / 100;

    // Group by vessel - return as array
    const vesselMap: { [key: string]: number } = {};
    entries.forEach((entry) => {
      const vessel_name = entry.vessel?.vessel_name || 'Unknown';
      if (!vesselMap[vessel_name]) {
        vesselMap[vessel_name] = 0;
      }
      if (entry.duration_hours) {
        vesselMap[vessel_name] += parseFloat(String(entry.duration_hours));
      }
    });

    const entries_by_vessel = Object.entries(vesselMap)
      .map(([vessel_name, total_hours]) => ({
        vessel_name,
        total_hours: Math.round(total_hours * 100) / 100,
      }))
      .sort((a, b) => b.total_hours - a.total_hours); // Sort by hours descending

    // Group by month - return as array
    const monthMap: { [key: string]: number } = {};
    entries.forEach((entry) => {
      const month = new Date(entry.start_time).toISOString().slice(0, 7); // YYYY-MM format
      if (!monthMap[month]) {
        monthMap[month] = 0;
      }
      if (entry.duration_hours) {
        monthMap[month] += parseFloat(String(entry.duration_hours));
      }
    });

    const entries_by_month = Object.entries(monthMap)
      .map(([month, total_hours]) => ({
        month,
        total_hours: Math.round(total_hours * 100) / 100,
      }))
      .sort((a, b) => a.month.localeCompare(b.month)); // Sort by month ascending

    // Group by service type
    const serviceTypeMap: { [key: string]: number } = {};
    entries.forEach((entry) => {
      const service_type = entry.service_type || 'actual_sea_service';
      if (!serviceTypeMap[service_type]) {
        serviceTypeMap[service_type] = 0;
      }
      if (entry.duration_hours) {
        serviceTypeMap[service_type] += parseFloat(String(entry.duration_hours));
      }
    });

    const entries_by_service_type = Object.entries(serviceTypeMap)
      .map(([service_type, total_hours]) => ({
        service_type,
        total_hours: Math.round(total_hours * 100) / 100,
      }))
      .sort((a, b) => b.total_hours - a.total_hours); // Sort by hours descending

    app.logger.info(
      {
        total_hours: Math.round(total_hours * 100) / 100,
        total_days,
        vesselCount: entries_by_vessel.length,
        monthCount: entries_by_month.length,
        serviceTypeCount: entries_by_service_type.length
      },
      'Summary report generated'
    );

    return reply.code(200).send({
      total_hours: Math.round(total_hours * 100) / 100,
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
    let totalHours = 0;
    confirmedEntries.forEach((entry) => {
      if (entry.duration_hours) {
        totalHours += parseFloat(String(entry.duration_hours));
      }
    });
    const totalDays = Math.round((totalHours / 24) * 100) / 100;

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
      if (entry.duration_hours) {
        serviceTypeTotals[serviceType] += parseFloat(String(entry.duration_hours));
      }
    });

    // Create PDF document with increased top margin for header
    const doc = new PDFDocument({
      bufferPages: true,
      margin: 40,
      bufferSize: 4096,
    });

    const PRIMARY_COLOR = '#0077BE';
    const LIGHT_COLOR = '#E8F4F8';
    const LIGHT_GRAY = '#F5F7FA';
    const SECONDARY_COLOR = '#5A6C7D';
    const DARK_TEXT = '#1A1A1A';
    const BORDER_COLOR = '#D0D8E0';

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

    // BRANDING HEADER WITH LOGO
    const logoUrl = 'https://prod-finalquest-user-projects-storage-bucket-aws.s3.amazonaws.com/user-projects/5e2bc1ec-bfa9-4840-8ffd-37bba15e1b0e/assets/images/521887ba-ed41-4c8a-96e7-ddeb3bb9e156.png';
    const logoBuffer = await fetchImageAsBuffer(logoUrl);

    // Position logo on the top left
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 40, 30, { width: 150 });
        app.logger.info({}, 'Logo embedded successfully in PDF');
      } catch (error) {
        app.logger.warn({ err: error }, 'Failed to embed logo in PDF, continuing without logo');
      }
    } else {
      app.logger.warn({}, 'Logo buffer is null, continuing without logo');
    }

    // BRANDING HEADER TEXT (positioned to the right and below logo)
    const logoHeight = 80; // Approximate logo height with 150px width maintaining aspect ratio
    doc.fillColor(PRIMARY_COLOR).fontSize(24).font('Helvetica-Bold').text('SeaTime Tracker', {
      x: 200,
      y: 38,
      width: 360,
      align: 'left'
    });
    doc.fillColor(SECONDARY_COLOR).fontSize(10).font('Helvetica').text('Sea Time Report', {
      x: 200,
      y: doc.y,
      width: 360,
      align: 'left'
    });

    // Move down after logo area with minimal spacing
    doc.y = Math.max(doc.y + 12, 30 + logoHeight + 8);
    doc.moveDown(0.3);

    // USER INFORMATION HEADER BOX
    const headerBoxY = doc.y;
    const headerBoxHeight = 115;
    doc.fillColor(LIGHT_GRAY).rect(40, headerBoxY, 520, headerBoxHeight).fill();
    doc.strokeColor(BORDER_COLOR).lineWidth(1).rect(40, headerBoxY, 520, headerBoxHeight).stroke();

    doc.fillColor(DARK_TEXT).fontSize(16).font('Helvetica-Bold');
    doc.text(userProfile.name, 50, headerBoxY + 8, { width: 500 });

    doc.fontSize(10).font('Helvetica').fillColor(SECONDARY_COLOR);
    let headerY = headerBoxY + 28;
    const lineHeight = 14;

    // Email
    doc.text(`Email: ${userProfile.email}`, 50, headerY);
    headerY += lineHeight;

    // Department if set
    if (userProfile.department) {
      doc.text(`Department: ${formatDepartment(userProfile.department)}`, 50, headerY);
      headerY += lineHeight;
    }

    // Multi-column layout for additional info
    const leftX = 50;
    const rightX = 300;
    let currentY = headerY;

    if (userProfile.address) {
      doc.text(`Address: ${userProfile.address}`, leftX, currentY, { width: 230 });
    }
    if (userProfile.tel_no) {
      doc.text(`Tel: ${userProfile.tel_no}`, rightX, Math.max(currentY, doc.y - 12), { width: 230 });
    }
    currentY = Math.max(doc.y, currentY + 24);

    if (userProfile.date_of_birth) {
      doc.text(`DOB: ${formatDateOfBirth(userProfile.date_of_birth)}`, leftX, currentY, { width: 230 });
    }
    if (userProfile.nationality) {
      doc.text(`Nationality: ${userProfile.nationality}`, rightX, Math.max(currentY, doc.y - 12), { width: 230 });
    }
    currentY = Math.max(doc.y, currentY + 24);

    if (userProfile.srb_no) {
      doc.text(`SRB No: ${userProfile.srb_no}`, leftX, currentY, { width: 230 });
    }
    if (userProfile.pya_membership_no) {
      doc.text(`PYA Membership: ${userProfile.pya_membership_no}`, rightX, Math.max(currentY, doc.y - 12), { width: 230 });
    }

    doc.y = headerBoxY + headerBoxHeight;
    doc.moveDown(0.3);

    // REPORT METADATA
    doc.fillColor(DARK_TEXT).fontSize(10).font('Helvetica');
    doc.text(`Generated: ${formatDate(new Date())}`, { align: 'left' });

    if (startDate || endDate) {
      const dateRange = [startDate && formatDate(startDate), endDate && formatDate(endDate)]
        .filter(Boolean)
        .join(' to ');
      doc.text(`Report Period: ${dateRange}`, { align: 'left' });
    }

    // Horizontal separator line
    doc.moveDown(0.5);
    doc.strokeColor(BORDER_COLOR).lineWidth(1).moveTo(40, doc.y).lineTo(560, doc.y).stroke();
    doc.moveDown(0.6);

    // VESSEL-BY-VESSEL BREAKDOWN SECTION
    if (Object.keys(entriesByVessel).length > 0) {
      doc.fontSize(16).font('Helvetica-Bold').fillColor(PRIMARY_COLOR).text('Vessel-by-Vessel Breakdown');
      doc.moveDown(0.5);

      Object.entries(entriesByVessel).forEach(([vesselId, vesselEntries], vesselIndex) => {
        const vessel = allVessels.find((v) => v.id === vesselId);
        if (!vessel) return;

        // Check if we need a new page (estimate space needed for vessel section)
        const spaceNeeded = 150; // Approximate space for vessel section
        if (doc.y > doc.page.height - spaceNeeded) {
          doc.addPage();
          // Reprint section header on new page
          doc.fontSize(16).font('Helvetica-Bold').fillColor(PRIMARY_COLOR).text('Vessel-by-Vessel Breakdown (continued)');
          doc.moveDown(0.5);
        }

        // Vessel header with background
        const vesselHeaderY = doc.y;
        doc.fillColor(LIGHT_COLOR).rect(40, vesselHeaderY, 520, 26).fill();
        doc.strokeColor(PRIMARY_COLOR).lineWidth(2).rect(40, vesselHeaderY, 520, 26).stroke();
        doc.fillColor(PRIMARY_COLOR).fontSize(13).font('Helvetica-Bold');
        doc.text(vessel.vessel_name, 50, vesselHeaderY + 4, { width: 500 });
        doc.moveDown(1.4);

        // Vessel particulars - two column layout - more compact
        doc.fillColor(DARK_TEXT).fontSize(10).font('Helvetica');
        const particulars: Array<[string, string]> = [];

        if (vessel.mmsi) particulars.push(['MMSI', vessel.mmsi]);
        if (vessel.callsign) particulars.push(['Callsign', vessel.callsign]);
        if (vessel.flag) particulars.push(['Flag', vessel.flag]);
        if (vessel.official_number) particulars.push(['Official Number', vessel.official_number]);
        if (vessel.type) particulars.push(['Type', vessel.type]);
        if (vessel.length_metres) particulars.push(['Length', `${vessel.length_metres}m`]);
        if (vessel.gross_tonnes) particulars.push(['Gross Tonnes', String(vessel.gross_tonnes)]);

        // Output in two-column format
        const leftX = 50;
        const rightX = 300;
        let currentY = doc.y;

        for (let i = 0; i < particulars.length; i += 2) {
          const [label1, value1] = particulars[i];
          const [label2, value2] = particulars[i + 1] || [null, null];

          doc.fillColor(SECONDARY_COLOR).fontSize(9).font('Helvetica-Bold');
          doc.text(`${label1}:`, leftX, currentY);
          doc.fillColor(DARK_TEXT).fontSize(9).font('Helvetica');
          doc.text(value1, leftX + 75, currentY, { width: 150 });

          if (label2) {
            doc.fillColor(SECONDARY_COLOR).fontSize(9).font('Helvetica-Bold');
            doc.text(`${label2}:`, rightX, currentY);
            doc.fillColor(DARK_TEXT).fontSize(9).font('Helvetica');
            doc.text(value2, rightX + 75, currentY, { width: 150 });
          }

          currentY += 15;
        }

        doc.y = currentY;
        doc.moveDown(0.3);

        // Service type breakdown for this vessel
        doc.fontSize(11).font('Helvetica-Bold').fillColor(PRIMARY_COLOR).text('Sea Service Definition Breakdown:');
        doc.moveDown(0.2);

        // Group entries by service type for this vessel
        const vesselServiceTypes: { [key: string]: number } = {};
        vesselEntries.forEach((entry) => {
          const serviceType = entry.service_type || 'actual_sea_service';
          if (!vesselServiceTypes[serviceType]) {
            vesselServiceTypes[serviceType] = 0;
          }
          if (entry.duration_hours) {
            vesselServiceTypes[serviceType] += parseFloat(String(entry.duration_hours));
          }
        });

        doc.fillColor(DARK_TEXT).fontSize(10).font('Helvetica');
        Object.entries(vesselServiceTypes).forEach(([serviceType, hours]) => {
          const days = Math.round((hours / 24) * 100) / 100;
          const label = formatServiceType(serviceType);
          const hoursFormatted = Math.round(hours * 100) / 100;
          doc.text(`  • ${label}`, 50, doc.y);
          doc.text(`${hoursFormatted}h (${days}d)`, 450, doc.y - 13, { align: 'right', width: 80 });
        });

        // Vessel totals in highlighted box
        let vesselHours = 0;
        vesselEntries.forEach((entry) => {
          if (entry.duration_hours) {
            vesselHours += parseFloat(String(entry.duration_hours));
          }
        });
        const vesselDays = Math.round((vesselHours / 24) * 100) / 100;

        doc.moveDown(0.4);
        const vesselSubtotalY = doc.y;
        doc.fillColor(LIGHT_COLOR).rect(40, vesselSubtotalY, 520, 22).fill();
        doc.strokeColor(PRIMARY_COLOR).lineWidth(1).rect(40, vesselSubtotalY, 520, 22).stroke();
        doc.fillColor(PRIMARY_COLOR).fontSize(10).font('Helvetica-Bold');
        doc.text(`Vessel Subtotal: ${Math.round(vesselHours * 100) / 100} hours (${vesselDays} days)`, 50, vesselSubtotalY + 3);
        doc.moveDown(1.2);

        // Add minimal spacing between vessels
        if (vesselIndex < Object.keys(entriesByVessel).length - 1) {
          doc.moveDown(0.2);
        }
      });

      doc.moveDown(0.5);
    }

    // GRAND TOTAL SUMMARY SECTION
    // Separator line
    doc.strokeColor(BORDER_COLOR).lineWidth(1).moveTo(40, doc.y).lineTo(560, doc.y).stroke();
    doc.moveDown(0.5);

    doc.fontSize(16).font('Helvetica-Bold').fillColor(PRIMARY_COLOR).text('Summary Totals');
    doc.moveDown(0.4);

    // Main summary box with large text
    const summaryBoxY = doc.y;
    doc.fillColor(LIGHT_COLOR).rect(40, summaryBoxY, 520, 68).fill();
    doc.strokeColor(PRIMARY_COLOR).lineWidth(2).rect(40, summaryBoxY, 520, 68).stroke();

    doc.fillColor(DARK_TEXT).fontSize(13).font('Helvetica-Bold');
    doc.text(`Total Hours: ${Math.round(totalHours * 100) / 100}`, 50, summaryBoxY + 10, { width: 240 });
    doc.text(`Total Days: ${totalDays}`, 320, summaryBoxY + 10, { width: 220 });

    doc.fontSize(10).font('Helvetica');
    doc.fillColor(SECONDARY_COLOR).text('Across all vessels', 50, summaryBoxY + 30);
    doc.text('24-hour periods', 320, summaryBoxY + 30);

    doc.y = summaryBoxY + 72;
    doc.moveDown(0.4);

    // Service type breakdown
    doc.fontSize(11).font('Helvetica-Bold').fillColor(PRIMARY_COLOR).text('Breakdown by Service Type:');
    doc.moveDown(0.3);

    doc.fillColor(DARK_TEXT).fontSize(10).font('Helvetica');
    const sortedServiceTypes = Object.entries(serviceTypeTotals)
      .sort((a, b) => b[1] - a[1]);

    sortedServiceTypes.forEach(([serviceType, hours], index) => {
      const days = Math.round((hours / 24) * 100) / 100;
      const label = formatServiceType(serviceType);
      const hoursFormatted = Math.round(hours * 100) / 100;

      // Alternate row background
      if (index % 2 === 0) {
        doc.fillColor(LIGHT_GRAY).rect(40, doc.y - 2, 520, 16).fill();
      }

      doc.fillColor(DARK_TEXT).text(`  • ${label}`, 50, doc.y);
      doc.text(`${hoursFormatted}h (${days}d)`, 450, doc.y - 13, { align: 'right', width: 80 });
    });

    doc.moveDown(0.8);

    // SERVICE TYPE LEGEND - check if we need a new page
    if (doc.y > doc.page.height - 180) {
      doc.addPage();
    }

    doc.strokeColor(BORDER_COLOR).lineWidth(1).moveTo(40, doc.y).lineTo(560, doc.y).stroke();
    doc.moveDown(0.4);

    doc.fontSize(13).font('Helvetica-Bold').fillColor(PRIMARY_COLOR).text('Service Type Definitions');
    doc.moveDown(0.3);

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

    doc.fillColor(DARK_TEXT).fontSize(9).font('Helvetica');
    serviceTypeDefinitions.forEach((def, index) => {
      const rowHeight = 20;
      if (index % 2 === 0) {
        doc.fillColor(LIGHT_GRAY).rect(40, doc.y - 1, 520, rowHeight).fill();
      }

      doc.fillColor(PRIMARY_COLOR).fontSize(9).font('Helvetica-Bold');
      doc.text(def.type, 50, doc.y);
      doc.fillColor(DARK_TEXT).fontSize(8).font('Helvetica');
      doc.text(def.desc, 50, doc.y, { width: 480 });
    });

    // FOOTER with page numbers and company details
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);

      // Separator line above footer
      doc.strokeColor(BORDER_COLOR).lineWidth(1);
      doc.moveTo(40, doc.page.height - 48).lineTo(560, doc.page.height - 48).stroke();

      // Company footer
      doc.fontSize(8).fillColor(DARK_TEXT).font('Helvetica');
      doc.text(
        'Foreland Marine Consultancy Ltd, 7 Bell Yard, London WC2A 2JR United Kingdom',
        50,
        doc.page.height - 42,
        { align: 'left' }
      );

      // Page number and generation info
      doc.fontSize(7).fillColor(SECONDARY_COLOR).font('Helvetica');
      doc.text(
        `Page ${i + 1} of ${pageCount} | Generated by SeaTime Tracker`,
        50,
        doc.page.height - 22,
        { align: 'center' }
      );
    }

    doc.end();

    app.logger.info(
      { entryCount: confirmedEntries.length, vesselCount: Object.keys(entriesByVessel).length, pageCount },
      'PDF report generated successfully'
    );

    // Convert to buffer and send
    const stream = doc as unknown as Readable;
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="seatime_report_${new Date().toISOString().split('T')[0]}.pdf"`);
    return reply.send(stream);
  });
}
