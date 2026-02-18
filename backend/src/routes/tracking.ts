import type { FastifyInstance } from "fastify";
import { eq, inArray } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";

// MyShipTracking API configuration
const MYSHIPTRACKING_API_BASE = 'https://api.myshiptracking.com/api/v2';
const MYSHIPTRACKING_API_KEY = process.env.MYSHIPTRACKING_API_KEY || '';

// Helper to mask API key for logging
function maskAPIKey(key: string): string {
  if (!key || key.length < 10) return '***';
  return key.substring(0, 10) + '***';
}

// Helper to make authenticated requests to MyShipTracking API
async function callMyShipTrackingAPI(
  endpoint: string,
  params: Record<string, any>,
  logger: any
): Promise<{ status: number; data: any; credits_remaining?: number; error?: string }> {
  try {
    const url = new URL(`${MYSHIPTRACKING_API_BASE}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });

    const maskedKey = maskAPIKey(MYSHIPTRACKING_API_KEY);
    logger.info(`Calling MyShipTracking API - Endpoint: ${endpoint}, URL: ${url.toString().replace(MYSHIPTRACKING_API_KEY, maskedKey)}`);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${MYSHIPTRACKING_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    logger.info(`MyShipTracking API response status: ${response.status}`);

    const data = await response.json() as Record<string, any>;
    const creditsRemaining = response.headers.get('X-Credits-Remaining');

    if (!response.ok) {
      logger.error(`MyShipTracking API error: ${response.status} - ${data?.error || 'Unknown error'}`);
      logger.error(`Full error response: ${JSON.stringify(data, null, 2)}`);
      return {
        status: response.status,
        data: null,
        credits_remaining: creditsRemaining ? parseInt(creditsRemaining) : undefined,
        error: (data?.error as string) || `HTTP ${response.status}`,
      };
    }

    logger.info(`MyShipTracking API success, credits remaining: ${creditsRemaining}`);
    logger.info(`Raw API Response for endpoint ${endpoint}:\n${JSON.stringify(data, null, 2)}`);
    logger.debug(`Response object keys: ${Object.keys(data).join(', ')}`);

    return {
      status: response.status,
      data,
      credits_remaining: creditsRemaining ? parseInt(creditsRemaining) : undefined,
    };
  } catch (error) {
    logger.error(`Error calling MyShipTracking API: ${error}`);
    return {
      status: 500,
      data: null,
      error: String(error),
    };
  }
}

export function register(app: App, fastify: FastifyInstance) {
  // GET /api/tracking/vessel/:mmsi - Get vessel information by MMSI
  fastify.get<{ Params: { mmsi: string }; Querystring: { response?: string } }>('/api/tracking/vessel/:mmsi', {
    schema: {
      description: 'Get vessel information by MMSI from MyShipTracking API',
      tags: ['tracking'],
      params: {
        type: 'object',
        required: ['mmsi'],
        properties: { mmsi: { type: 'string' } },
      },
      querystring: {
        type: 'object',
        properties: {
          response: { type: 'string', enum: ['simple', 'extended'], description: 'Response format' },
        },
      },
      response: {
        200: { type: 'object' },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        429: { type: 'object', properties: { error: { type: 'string' } } },
        500: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { mmsi } = request.params;
    const responseFormat = request.query.response || 'extended';

    app.logger.info(`Fetching vessel information for MMSI: ${mmsi}, format: ${responseFormat}`);

    if (!MYSHIPTRACKING_API_KEY) {
      app.logger.error('MyShipTracking API key not configured');
      return reply.code(500).send({ error: 'API key not configured' });
    }

    const result = await callMyShipTrackingAPI('/vessel', {
      mmsi,
      response: responseFormat,
    }, app.logger);

    if (result.error) {
      const statusCode = result.status === 404 ? 404 : (result.status === 401 ? 401 : 500);
      return reply.code(statusCode).send({ error: result.error, credits_remaining: result.credits_remaining });
    }

    app.logger.info(`Successfully retrieved vessel data for MMSI ${mmsi}`);
    return reply.code(200).send({
      ...result.data,
      credits_remaining: result.credits_remaining,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/tracking/vessel/imo/:imo - Get vessel information by IMO
  fastify.get<{ Params: { imo: string }; Querystring: { response?: string } }>('/api/tracking/vessel/imo/:imo', {
    schema: {
      description: 'Get vessel information by IMO from MyShipTracking API',
      tags: ['tracking'],
      params: {
        type: 'object',
        required: ['imo'],
        properties: { imo: { type: 'string' } },
      },
      querystring: {
        type: 'object',
        properties: {
          response: { type: 'string', enum: ['simple', 'extended'] },
        },
      },
      response: {
        200: { type: 'object' },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        500: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { imo } = request.params;
    const responseFormat = request.query.response || 'extended';

    app.logger.info(`Fetching vessel information for IMO: ${imo}`);

    if (!MYSHIPTRACKING_API_KEY) {
      return reply.code(500).send({ error: 'API key not configured' });
    }

    const result = await callMyShipTrackingAPI('/vessel', {
      imo,
      response: responseFormat,
    }, app.logger);

    if (result.error) {
      return reply.code(result.status === 404 ? 404 : 500).send({ error: result.error });
    }

    return reply.code(200).send({
      ...result.data,
      credits_remaining: result.credits_remaining,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/tracking/port/:port_id - Get port information
  fastify.get<{ Params: { port_id: string } }>('/api/tracking/port/:port_id', {
    schema: {
      description: 'Get port information by port ID',
      tags: ['tracking'],
      params: {
        type: 'object',
        required: ['port_id'],
        properties: { port_id: { type: 'string' } },
      },
      response: {
        200: { type: 'object' },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        500: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { port_id } = request.params;

    app.logger.info(`Fetching port information for port ID: ${port_id}`);

    if (!MYSHIPTRACKING_API_KEY) {
      return reply.code(500).send({ error: 'API key not configured' });
    }

    const result = await callMyShipTrackingAPI('/port', {
      port_id,
    }, app.logger);

    if (result.error) {
      return reply.code(result.status === 404 ? 404 : 500).send({ error: result.error });
    }

    return reply.code(200).send({
      ...result.data,
      credits_remaining: result.credits_remaining,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/tracking/port/vessels/:port_id - List vessels at port
  fastify.get<{ Params: { port_id: string }; Querystring: { limit?: string } }>('/api/tracking/port/vessels/:port_id', {
    schema: {
      description: 'List vessels at a specific port',
      tags: ['tracking'],
      params: {
        type: 'object',
        required: ['port_id'],
        properties: { port_id: { type: 'string' } },
      },
      querystring: {
        type: 'object',
        properties: { limit: { type: 'string' } },
      },
      response: {
        200: { type: 'object' },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        500: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { port_id } = request.params;
    const limit = request.query.limit ? parseInt(request.query.limit) : 100;

    app.logger.info(`Fetching vessels at port: ${port_id}`);

    if (!MYSHIPTRACKING_API_KEY) {
      return reply.code(500).send({ error: 'API key not configured' });
    }

    const result = await callMyShipTrackingAPI('/port/vessels', {
      port_id,
      limit,
    }, app.logger);

    if (result.error) {
      return reply.code(result.status === 404 ? 404 : 500).send({ error: result.error });
    }

    return reply.code(200).send({
      ...result.data,
      credits_remaining: result.credits_remaining,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/tracking/vessel/history/:mmsi - Get vessel tracking history
  fastify.get<{ Params: { mmsi: string }; Querystring: { days?: string } }>('/api/tracking/vessel/history/:mmsi', {
    schema: {
      description: 'Get vessel tracking history',
      tags: ['tracking'],
      params: {
        type: 'object',
        required: ['mmsi'],
        properties: { mmsi: { type: 'string' } },
      },
      querystring: {
        type: 'object',
        properties: { days: { type: 'string', description: 'Number of days of history' } },
      },
      response: {
        200: { type: 'object' },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        500: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { mmsi } = request.params;
    const days = request.query.days ? parseInt(request.query.days) : 7;

    app.logger.info(`Fetching tracking history for MMSI: ${mmsi}, days: ${days}`);

    if (!MYSHIPTRACKING_API_KEY) {
      return reply.code(500).send({ error: 'API key not configured' });
    }

    const result = await callMyShipTrackingAPI('/vessel/history', {
      mmsi,
      days,
    }, app.logger);

    if (result.error) {
      return reply.code(500).send({ error: result.error });
    }

    return reply.code(200).send({
      ...result.data,
      credits_remaining: result.credits_remaining,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/tracking/account - Get account information and API credits
  fastify.get('/api/tracking/account', {
    schema: {
      description: 'Get account information and remaining API credits',
      tags: ['tracking'],
      response: {
        200: { type: 'object' },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        500: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    app.logger.info('Fetching account information');

    if (!MYSHIPTRACKING_API_KEY) {
      return reply.code(500).send({ error: 'API key not configured' });
    }

    const result = await callMyShipTrackingAPI('/account', {}, app.logger);

    if (result.error) {
      return reply.code(result.status === 401 ? 401 : 500).send({ error: result.error });
    }

    return reply.code(200).send({
      ...result.data,
      credits_remaining: result.credits_remaining,
      timestamp: new Date().toISOString(),
    });
  });

  // POST /api/tracking/fleet - Create a fleet
  fastify.post<{ Body: { name: string; description?: string; vessel_ids?: string[] } }>('/api/tracking/fleet', {
    schema: {
      description: 'Create a new fleet',
      tags: ['tracking'],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          vessel_ids: { type: 'array', items: { type: 'string' } },
        },
      },
      response: {
        201: { type: 'object' },
        400: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { name, description, vessel_ids = [] } = request.body;

    app.logger.info(`Creating fleet: ${name}`);

    // In a real implementation, this would call the MyShipTracking API fleet endpoint
    // For now, we'll store it locally
    const fleetId = `fleet_${Date.now()}`;

    app.logger.info(`Fleet created with ID: ${fleetId}`);

    return reply.code(201).send({
      fleet_id: fleetId,
      name,
      description,
      vessel_count: vessel_ids.length,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/tracking/fleet/:fleet_id - Get fleet information and live status
  fastify.get<{ Params: { fleet_id: string } }>('/api/tracking/fleet/:fleet_id', {
    schema: {
      description: 'Get fleet information and live vessel status',
      tags: ['tracking'],
      params: {
        type: 'object',
        required: ['fleet_id'],
        properties: { fleet_id: { type: 'string' } },
      },
      response: {
        200: { type: 'object' },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { fleet_id } = request.params;

    app.logger.info(`Fetching fleet information for: ${fleet_id}`);

    const vessels = await app.db
      .select()
      .from(schema.vessels)
      .where(eq(schema.vessels.is_active, true));

    if (vessels.length === 0) {
      return reply.code(404).send({ error: 'Fleet not found or no active vessels' });
    }

    app.logger.info(`Retrieved fleet with ${vessels.length} active vessels`);

    return reply.code(200).send({
      fleet_id,
      vessel_count: vessels.length,
      vessels: vessels.map(v => ({
        id: v.id,
        mmsi: v.mmsi,
        name: v.vessel_name,
        is_active: v.is_active,
      })),
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/tracking/search - Search vessels by zone, coordinates, or name
  fastify.get<{ Querystring: { zone?: string; latitude?: string; longitude?: string; radius?: string; name?: string } }>('/api/tracking/search', {
    schema: {
      description: 'Search vessels by zone, coordinates, or name',
      tags: ['tracking'],
      querystring: {
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Zone code (e.g., IMO zone)' },
          latitude: { type: 'string', description: 'Latitude for coordinate search' },
          longitude: { type: 'string', description: 'Longitude for coordinate search' },
          radius: { type: 'string', description: 'Search radius in nautical miles' },
          name: { type: 'string', description: 'Vessel name pattern' },
        },
      },
      response: {
        200: { type: 'object' },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        500: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { zone, latitude, longitude, radius, name } = request.query;

    if (!zone && !latitude && !longitude && !name) {
      return reply.code(400).send({ error: 'At least one search parameter required: zone, coordinates, or name' });
    }

    app.logger.info(`Searching vessels - zone: ${zone}, coords: [${latitude}, ${longitude}], name: ${name}`);

    if (!MYSHIPTRACKING_API_KEY) {
      return reply.code(500).send({ error: 'API key not configured' });
    }

    const params: Record<string, any> = {};
    if (zone) params.zone = zone;
    if (latitude && longitude) {
      params.latitude = parseFloat(latitude);
      params.longitude = parseFloat(longitude);
      params.radius = radius ? parseInt(radius) : 50;
    }
    if (name) params.name = name;

    const result = await callMyShipTrackingAPI('/search', params, app.logger);

    if (result.error) {
      return reply.code(500).send({ error: result.error });
    }

    return reply.code(200).send({
      results: result.data,
      credits_remaining: result.credits_remaining,
      timestamp: new Date().toISOString(),
    });
  });
}
