import type { FastifyInstance, FastifyRequest } from "fastify";
import { eq, desc, and, gte, isNotNull, lt } from "drizzle-orm";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";

const MOVING_SPEED_THRESHOLD = 2; // knots
const MYSHIPTRACKING_API_URL = 'https://api.myshiptracking.com/api/v2/vessel';
const MYSHIPTRACKING_API_KEY = process.env.MYSHIPTRACKING_API_KEY || '';
const DATALASTIC_API_URL = 'https://api.datalastic.com/api/v0/vessel';
const DATALASTIC_API_KEY = process.env.DATALASTIC_API_KEY || '';
const BASE44_API_URL = 'https://app.base44.com/api/apps/695fbc07612e977d62f60329/entities/Vessel';
const BASE44_API_KEY = process.env.BASE44_API_KEY || '';
const DATA_STALENESS_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

// Helper to mask API key for logging
function maskAPIKey(key: string): string {
  if (!key || key.length < 10) return '***';
  return key.substring(0, 10) + '***';
}

// Helper function to log API calls to debug log table
async function logAPICall(
  app: App,
  vesselId: string,
  userId: string,
  mmsi: string,
  url: string,
  requestTime: Date,
  responseStatus: string,
  responseBody: string | null,
  authStatus: string,
  errorMessage: string | null,
  apiSource?: string
) {
  try {
    await app.db
      .insert(schema.ais_debug_logs)
      .values({
        user_id: userId,
        vessel_id: vesselId,
        mmsi,
        api_url: url,
        request_time: requestTime,
        response_status: responseStatus,
        response_body: responseBody,
        authentication_status: authStatus,
        error_message: errorMessage,
        api_source: apiSource,
      })
      .execute();
  } catch (logError) {
    app.logger.error(`Failed to log API call for MMSI ${mmsi}: ${logError}`);
  }
}

interface MyShipTrackingVesselResponse {
  // Top-level fields (flat structure)
  mmsi?: number | string;
  imo?: number | string;
  vessel_name?: string;
  name?: string;
  callsign?: string;
  ship_type?: string;
  vessel_type?: string;
  status?: string;
  nav_status?: string;
  flag?: string;
  built?: number | string;
  length?: number;
  width?: number;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  speed?: number;
  course?: number;
  heading?: number;
  destination?: string;
  eta?: string;
  timestamp?: number;
  last_position_update?: number;
  received?: string; // ISO 8601 timestamp string

  // Nested structure fields (if API returns nested object)
  vessel?: {
    mmsi?: number | string;
    imo?: number | string;
    vessel_name?: string;
    name?: string;
    callsign?: string;
    ship_type?: string;
    vessel_type?: string;
    flag?: string;
    built?: number | string;
    length?: number;
    width?: number;
  };
  position?: {
    latitude?: number;
    longitude?: number;
    lat?: number;
    lng?: number;
  };
  voyage?: {
    destination?: string;
    eta?: string;
    status?: string;
    nav_status?: string;
  };
  navigation?: {
    speed?: number;
    course?: number;
    heading?: number;
    status?: string;
    nav_status?: string;
  };
  [key: string]: any;
}

interface AISVesselData {
  name: string | null;
  mmsi: string | null;
  imo: string | null;
  speed_knots: number | null;
  latitude: number | null;
  longitude: number | null;
  course: number | null;
  heading: number | null;
  timestamp: Date | null;
  status: string | null;
  destination: string | null;
  eta: string | null;
  callsign: string | null;
  ship_type: string | null;
  flag: string | null;
  is_moving: boolean;
  error: string | null;
}

// Datalastic API response interface (may use different field names)
interface DatalasticVesselResponse {
  // Common field variations
  mmsi?: number | string;
  imo?: number | string;
  vessel_name?: string;
  name?: string;
  callsign?: string;
  ship_type?: string;
  vessel_type?: string;
  status?: string;
  nav_status?: string;
  flag?: string;
  built?: number | string;
  length?: number;
  width?: number;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lon?: number;
  lng?: number;
  speed?: number;
  speed_knots?: number;
  course?: number;
  heading?: number;
  destination?: string;
  eta?: string;
  timestamp?: number | string;
  last_position_time?: number | string;
  received?: string; // ISO 8601 timestamp string
  position_updated?: string;
  [key: string]: any;
}

// Base44 API response interface
interface Base44VesselResponse {
  id?: string;
  mmsi?: number | string;
  imo?: number | string;
  vessel_name?: string;
  name?: string;
  callsign?: string;
  ship_type?: string;
  vessel_type?: string;
  status?: string;
  nav_status?: string;
  flag?: string;
  last_latitude?: number | string;
  last_longitude?: number | string;
  last_speed?: number | string;
  speed_knots?: number | string;
  last_heading?: number | string;
  heading?: number | string;
  last_position_time?: number | string;
  last_position_update?: number | string;
  timestamp?: number | string;
  received?: string;
  destination?: string;
  eta?: string;
  course?: number;
  [key: string]: any;
}

async function fetchVesselAISDataFromDatalastic(
  mmsi: string,
  apiKey: string,
  logger: any
): Promise<AISVesselData | null> {
  try {
    if (!apiKey) {
      logger.debug(`Datalastic API key not configured, skipping Datalastic`);
      return null;
    }

    // Build request URL with MMSI parameter
    const urlObj = new URL(DATALASTIC_API_URL);
    urlObj.searchParams.append('api-key', apiKey);
    urlObj.searchParams.append('mmsi', mmsi);
    const url = urlObj.toString();

    // Log request details (mask API key for security)
    const maskedKey = maskAPIKey(apiKey);
    logger.info(`Using Datalastic API as primary source - MMSI: ${mmsi}, API Key: ${maskedKey}`);

    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (fetchError) {
      logger.warn(`Datalastic API connection error for MMSI ${mmsi}: ${fetchError}`);
      return null;
    }

    logger.info(`Datalastic API response status: ${response.status}`);

    // Handle error status codes
    if (!response.ok) {
      if (response.status === 404) {
        logger.warn(`Datalastic API returned 404 - vessel with MMSI ${mmsi} not found`);
      } else if (response.status === 401) {
        logger.warn(`Datalastic API authentication failed (401) - invalid API key`);
      } else {
        logger.warn(`Datalastic API returned ${response.status} - will try fallback`);
      }
      return null;
    }

    const rawResponse = await response.json() as any;
    logger.debug(`Raw Datalastic Response for MMSI ${mmsi}: ${JSON.stringify(rawResponse).substring(0, 500)}`);

    // Extract the vessel data - may be wrapped in a 'data' property or be a direct response
    const data: DatalasticVesselResponse = (rawResponse.data && typeof rawResponse.data === 'object')
      ? rawResponse.data
      : rawResponse;

    // Helper to safely extract values with fallback field names
    const getValue = (field: string): any => {
      // Try direct field
      if (field in data) return (data as any)[field];

      // Try alternative field names
      if (field === 'name') {
        return (data as any).vessel_name || (data as any).name;
      }
      if (field === 'latitude') {
        return (data as any).latitude || (data as any).lat;
      }
      if (field === 'longitude') {
        return (data as any).longitude || (data as any).lon || (data as any).lng;
      }
      if (field === 'speed') {
        return (data as any).speed || (data as any).speed_knots;
      }
      if (field === 'ship_type') {
        return (data as any).ship_type || (data as any).vessel_type;
      }
      if (field === 'status') {
        return (data as any).status || (data as any).nav_status;
      }
      if (field === 'timestamp') {
        return (data as any).timestamp || (data as any).last_position_time || (data as any).received || (data as any).position_updated;
      }

      return undefined;
    };

    // Extract vessel data
    const vesselMmsi = getValue('mmsi') ? String(getValue('mmsi')) : null;
    const imo = getValue('imo') ? String(getValue('imo')) : null;
    const latitude = getValue('latitude') ? parseFloat(String(getValue('latitude'))) : null;
    const longitude = getValue('longitude') ? parseFloat(String(getValue('longitude'))) : null;
    const name = getValue('name') ? String(getValue('name')) : null;
    const speed = getValue('speed') ? parseFloat(String(getValue('speed'))) : null;
    const course = getValue('course') ? parseFloat(String(getValue('course'))) : null;
    const heading = getValue('heading') ? parseFloat(String(getValue('heading'))) : null;
    const status = getValue('status') ? String(getValue('status')) : null;
    const destination = getValue('destination') ? String(getValue('destination')) : null;
    const eta = getValue('eta') ? String(getValue('eta')) : null;
    const callsign = getValue('callsign') ? String(getValue('callsign')) : null;
    const ship_type = getValue('ship_type') ? String(getValue('ship_type')) : null;
    const flag = getValue('flag') ? String(getValue('flag')) : null;

    // Parse timestamp - handle ISO strings and numeric timestamps
    let timestamp: Date;
    const receivedValue = getValue('timestamp');

    if (receivedValue) {
      if (typeof receivedValue === 'string') {
        // Try parsing as ISO 8601
        try {
          timestamp = new Date(receivedValue);
          if (isNaN(timestamp.getTime())) {
            logger.warn(`Invalid timestamp from Datalastic for MMSI ${mmsi}: ${receivedValue}`);
            timestamp = new Date();
          }
        } catch (e) {
          logger.warn(`Failed to parse Datalastic timestamp: ${receivedValue}`);
          timestamp = new Date();
        }
      } else {
        // Parse numeric timestamp
        const parsedTimestamp = parseFloat(String(receivedValue));
        if (parsedTimestamp > 0) {
          // Check if in seconds (before year 3000)
          if (parsedTimestamp < 100000000000) {
            timestamp = new Date(parsedTimestamp * 1000);
          } else {
            timestamp = new Date(parsedTimestamp);
          }
        } else {
          logger.warn(`Invalid numeric timestamp from Datalastic for MMSI ${mmsi}: ${receivedValue}`);
          timestamp = new Date();
        }
      }
    } else {
      logger.debug(`No timestamp in Datalastic response for MMSI ${mmsi}, using current time`);
      timestamp = new Date();
    }

    const is_moving = speed !== null && speed > MOVING_SPEED_THRESHOLD;

    logger.info(
      `Successfully retrieved data from Datalastic for MMSI ${mmsi}: name=${name}, speed=${speed} knots, is_moving=${is_moving}, lat=${latitude}, lon=${longitude}`
    );

    return {
      name,
      mmsi: vesselMmsi,
      imo,
      speed_knots: speed,
      latitude,
      longitude,
      course,
      heading,
      timestamp,
      status,
      destination,
      eta,
      callsign,
      ship_type,
      flag,
      is_moving,
      error: null,
    };
  } catch (error) {
    logger.error(`Error fetching vessel data from Datalastic for MMSI ${mmsi}: ${error}`);
    return null;
  }
}

async function fetchVesselAISDataFromBase44(
  mmsi: string,
  apiKey: string,
  logger: any
): Promise<AISVesselData | null> {
  try {
    if (!apiKey) {
      logger.debug(`Base44 API key not configured, skipping Base44`);
      return null;
    }

    // Build request URL with API key header
    const url = BASE44_API_URL;
    const maskedKey = maskAPIKey(apiKey);
    logger.info(`Using Base44 API as fallback - MMSI: ${mmsi}, API Key: ${maskedKey}`);

    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'api_key': apiKey,
          'Content-Type': 'application/json',
        },
      });
    } catch (fetchError) {
      logger.warn(`Base44 API connection error for MMSI ${mmsi}: ${fetchError}`);
      return null;
    }

    logger.info(`Base44 API response status: ${response.status}`);

    // Handle error status codes
    if (!response.ok) {
      logger.warn(`Base44 API returned ${response.status} - will try next source`);
      return null;
    }

    const rawResponse = await response.json() as any;
    logger.debug(`Raw Base44 Response for MMSI ${mmsi}: ${JSON.stringify(rawResponse).substring(0, 500)}`);

    // Base44 returns an array of vessels, find the one matching our MMSI
    let vesselData: Base44VesselResponse | null = null;

    if (Array.isArray(rawResponse)) {
      // Response is an array, find vessel by MMSI
      const searchMmsi = String(mmsi);
      vesselData = rawResponse.find((v: any) => String(v.mmsi || v.MMSI || '') === searchMmsi) as Base44VesselResponse | undefined || null;
    } else if (rawResponse.data && Array.isArray(rawResponse.data)) {
      // Response has data property containing array
      const searchMmsi = String(mmsi);
      vesselData = rawResponse.data.find((v: any) => String(v.mmsi || v.MMSI || '') === searchMmsi) as Base44VesselResponse | undefined || null;
    } else if (rawResponse && rawResponse.mmsi) {
      // Response is a single vessel object
      vesselData = rawResponse as Base44VesselResponse;
    }

    if (!vesselData) {
      logger.warn(`Vessel with MMSI ${mmsi} not found in Base44 response`);
      return null;
    }

    // Helper to safely extract values with fallback field names
    const getValue = (field: string): any => {
      // Try direct field
      if (field in vesselData!) return (vesselData as any)[field];

      // Try alternative field names for Base44
      if (field === 'latitude') {
        return (vesselData as any).last_latitude || (vesselData as any).latitude;
      }
      if (field === 'longitude') {
        return (vesselData as any).last_longitude || (vesselData as any).longitude;
      }
      if (field === 'speed') {
        return (vesselData as any).last_speed || (vesselData as any).speed || (vesselData as any).speed_knots;
      }
      if (field === 'heading') {
        return (vesselData as any).last_heading || (vesselData as any).heading;
      }
      if (field === 'name') {
        return (vesselData as any).vessel_name || (vesselData as any).name;
      }
      if (field === 'ship_type') {
        return (vesselData as any).ship_type || (vesselData as any).vessel_type;
      }
      if (field === 'status') {
        return (vesselData as any).status || (vesselData as any).nav_status;
      }
      if (field === 'timestamp') {
        return (vesselData as any).last_position_time || (vesselData as any).last_position_update || (vesselData as any).timestamp || (vesselData as any).received;
      }

      return undefined;
    };

    // Extract vessel data
    const vesselMmsi = getValue('mmsi') ? String(getValue('mmsi')) : null;
    const imo = getValue('imo') ? String(getValue('imo')) : null;
    const latitude = getValue('latitude') ? parseFloat(String(getValue('latitude'))) : null;
    const longitude = getValue('longitude') ? parseFloat(String(getValue('longitude'))) : null;
    const name = getValue('name') ? String(getValue('name')) : null;
    const speed = getValue('speed') ? parseFloat(String(getValue('speed'))) : null;
    const course = getValue('course') ? parseFloat(String(getValue('course'))) : null;
    const heading = getValue('heading') ? parseFloat(String(getValue('heading'))) : null;
    const status = getValue('status') ? String(getValue('status')) : null;
    const destination = getValue('destination') ? String(getValue('destination')) : null;
    const eta = getValue('eta') ? String(getValue('eta')) : null;
    const callsign = getValue('callsign') ? String(getValue('callsign')) : null;
    const ship_type = getValue('ship_type') ? String(getValue('ship_type')) : null;
    const flag = getValue('flag') ? String(getValue('flag')) : null;

    // Parse timestamp - handle ISO strings and numeric timestamps
    let timestamp: Date;
    const timestampValue = getValue('timestamp');

    if (timestampValue) {
      if (typeof timestampValue === 'string') {
        // Try parsing as ISO 8601
        try {
          timestamp = new Date(timestampValue);
          if (isNaN(timestamp.getTime())) {
            logger.warn(`Invalid timestamp from Base44 for MMSI ${mmsi}: ${timestampValue}`);
            timestamp = new Date();
          }
        } catch (e) {
          logger.warn(`Failed to parse Base44 timestamp: ${timestampValue}`);
          timestamp = new Date();
        }
      } else {
        // Parse numeric timestamp
        const parsedTimestamp = parseFloat(String(timestampValue));
        if (parsedTimestamp > 0) {
          // Check if in seconds (before year 3000)
          if (parsedTimestamp < 100000000000) {
            timestamp = new Date(parsedTimestamp * 1000);
          } else {
            timestamp = new Date(parsedTimestamp);
          }
        } else {
          logger.warn(`Invalid numeric timestamp from Base44 for MMSI ${mmsi}: ${timestampValue}`);
          timestamp = new Date();
        }
      }
    } else {
      logger.debug(`No timestamp in Base44 response for MMSI ${mmsi}, using current time`);
      timestamp = new Date();
    }

    // Check data freshness for Base44 (max 48 hours old)
    const now = new Date();
    const timeDiff = now.getTime() - timestamp.getTime();
    if (timeDiff > DATA_STALENESS_THRESHOLD_MS) {
      logger.warn(`Base44 data for MMSI ${mmsi} is stale (${Math.round(timeDiff / (1000 * 60 * 60))} hours old), skipping`);
      return null;
    }

    const is_moving = speed !== null && speed > MOVING_SPEED_THRESHOLD;

    logger.info(
      `Successfully retrieved data from Base44 for MMSI ${mmsi}: name=${name}, speed=${speed} knots, is_moving=${is_moving}, lat=${latitude}, lon=${longitude}`
    );

    return {
      name,
      mmsi: vesselMmsi,
      imo,
      speed_knots: speed,
      latitude,
      longitude,
      course,
      heading,
      timestamp,
      status,
      destination,
      eta,
      callsign,
      ship_type,
      flag,
      is_moving,
      error: null,
    };
  } catch (error) {
    logger.error(`Error fetching vessel data from Base44 for MMSI ${mmsi}: ${error}`);
    return null;
  }
}

export async function fetchVesselAISDataWithFallback(
  mmsi: string,
  logger: any,
  vesselId?: string,
  app?: App,
  userId?: string,
  extended: boolean = false
): Promise<{ data: AISVesselData; apiSource: string }> {
  // Try Datalastic first
  logger.info(`[FALLBACK CHAIN] Starting AIS data fetch for MMSI ${mmsi}, trying: Datalastic → MyShipTracking → Base44`);

  const datalasticResult = await fetchVesselAISDataFromDatalastic(mmsi, DATALASTIC_API_KEY, logger);
  if (datalasticResult && !datalasticResult.error && datalasticResult.latitude && datalasticResult.longitude) {
    logger.info(`[FALLBACK CHAIN] ✓ Successfully retrieved data from Datalastic API for MMSI ${mmsi}`);
    if (vesselId && app && userId) {
      await logAPICall(app, vesselId, userId, mmsi, DATALASTIC_API_URL, new Date(), '200', JSON.stringify(datalasticResult), 'success', null, 'datalastic');
    }
    return { data: datalasticResult, apiSource: 'datalastic' };
  }

  logger.warn(`[FALLBACK CHAIN] Datalastic failed or returned incomplete data, falling back to MyShipTracking`);

  // Try MyShipTracking second
  const myshipResult = await fetchVesselAISData(mmsi, MYSHIPTRACKING_API_KEY, logger, vesselId, app, extended, userId);
  if (myshipResult && !myshipResult.error && myshipResult.latitude && myshipResult.longitude) {
    logger.info(`[FALLBACK CHAIN] ✓ Successfully retrieved data from MyShipTracking API for MMSI ${mmsi}`);
    return { data: myshipResult, apiSource: 'myshiptracking' };
  }

  logger.warn(`[FALLBACK CHAIN] MyShipTracking failed or returned incomplete data, falling back to Base44`);

  // Try Base44 last
  const base44Result = await fetchVesselAISDataFromBase44(mmsi, BASE44_API_KEY, logger);
  if (base44Result && !base44Result.error && base44Result.latitude && base44Result.longitude) {
    logger.info(`[FALLBACK CHAIN] ✓ Successfully retrieved data from Base44 API for MMSI ${mmsi}`);
    if (vesselId && app && userId) {
      await logAPICall(app, vesselId, userId, mmsi, BASE44_API_URL, new Date(), '200', JSON.stringify(base44Result), 'success', null, 'base44');
    }
    return { data: base44Result, apiSource: 'base44' };
  }

  logger.error(`[FALLBACK CHAIN] ✗ All APIs failed for MMSI ${mmsi}: Datalastic, MyShipTracking, and Base44`);

  // All APIs failed
  return {
    data: {
      name: null,
      mmsi: null,
      imo: null,
      speed_knots: null,
      latitude: null,
      longitude: null,
      course: null,
      heading: null,
      timestamp: null,
      status: null,
      destination: null,
      eta: null,
      callsign: null,
      ship_type: null,
      flag: null,
      is_moving: false,
      error: 'All AIS data sources unavailable',
    },
    apiSource: 'failed',
  };
}

export async function fetchVesselAISData(
  mmsi: string,
  apiKey: string,
  logger: any,
  vesselId?: string,
  app?: App,
  extended: boolean = false,
  userId?: string
): Promise<AISVesselData> {
  try {
    // Build request URL with MMSI parameter and optional extended response
    const urlObj = new URL(MYSHIPTRACKING_API_URL);
    urlObj.searchParams.append('mmsi', mmsi);
    if (extended) {
      urlObj.searchParams.append('response', 'extended');
    }
    const url = urlObj.toString();
    const requestTime = new Date();

    // Log request details (mask API key for security)
    const maskedKey = maskAPIKey(apiKey);
    logger.info(`Calling MyShipTracking API - URL: ${url}, API Key: ${maskedKey}`);
    logger.debug(`Request headers - Authorization: Bearer ${maskedKey}, Content-Type: application/json`);

    let response;
    let authStatus = 'success';
    let errorMessage: string | null = null;

    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (fetchError) {
      authStatus = 'connection_error';
      errorMessage = String(fetchError);
      logger.error(`Connection error calling MyShipTracking API for MMSI ${mmsi}: ${fetchError}`);
      if (vesselId && app && userId) {
        await logAPICall(app, vesselId, userId, mmsi, url, requestTime, 'connection_error', null, authStatus, errorMessage, 'myshiptracking');
      }
      return {
        name: null,
        mmsi: null,
        imo: null,
        speed_knots: null,
        latitude: null,
        longitude: null,
        course: null,
        heading: null,
        timestamp: null,
        status: null,
        destination: null,
        eta: null,
        callsign: null,
        ship_type: null,
        flag: null,
        is_moving: false,
        error: 'AIS service temporarily unavailable',
      };
    }

    logger.info(`MyShipTracking API response status: ${response.status} ${response.statusText}`);

    // Extract API credits info from headers
    const creditsRemaining = response.headers.get('X-Credits-Remaining');
    if (creditsRemaining) {
      logger.info(`API credits remaining: ${creditsRemaining}`);
    }

    if (response.status === 401) {
      authStatus = 'authentication_failed';
      errorMessage = 'Invalid API key';
      logger.error(`MyShipTracking API authentication failed (401) for MMSI ${mmsi} - invalid API key`);
      if (vesselId && app && userId) {
        const responseBody = await response.text();
        await logAPICall(app, vesselId, userId, mmsi, url, requestTime, '401', responseBody, authStatus, errorMessage, 'myshiptracking');
      }
      return {
        name: null,
        mmsi: null,
        imo: null,
        speed_knots: null,
        latitude: null,
        longitude: null,
        course: null,
        heading: null,
        timestamp: null,
        status: null,
        destination: null,
        eta: null,
        callsign: null,
        ship_type: null,
        flag: null,
        is_moving: false,
        error: 'Invalid API key',
      };
    }

    if (response.status === 429) {
      authStatus = 'rate_limited';
      errorMessage = 'Rate limit exceeded';
      logger.warn(`MyShipTracking API rate limit exceeded (429) for MMSI ${mmsi}`);
      if (vesselId && app && userId) {
        const responseBody = await response.text();
        await logAPICall(app, vesselId, userId, mmsi, url, requestTime, '429', responseBody, authStatus, errorMessage, 'myshiptracking');
      }
      return {
        name: null,
        mmsi: null,
        imo: null,
        speed_knots: null,
        latitude: null,
        longitude: null,
        course: null,
        heading: null,
        timestamp: null,
        status: null,
        destination: null,
        eta: null,
        callsign: null,
        ship_type: null,
        flag: null,
        is_moving: false,
        error: 'Rate limit exceeded',
      };
    }

    if (response.status === 404) {
      authStatus = 'success';
      errorMessage = 'Vessel not found in MyShipTracking AIS system';
      logger.warn(`MyShipTracking API returned 404 - vessel with MMSI ${mmsi} not found`);
      if (vesselId && app && userId) {
        const responseBody = await response.text();
        await logAPICall(app, vesselId, userId, mmsi, url, requestTime, '404', responseBody, authStatus, errorMessage, 'myshiptracking');
      }
      return {
        name: null,
        mmsi: null,
        imo: null,
        speed_knots: null,
        latitude: null,
        longitude: null,
        course: null,
        heading: null,
        timestamp: null,
        status: null,
        destination: null,
        eta: null,
        callsign: null,
        ship_type: null,
        flag: null,
        is_moving: false,
        error: 'Vessel not found in AIS system',
      };
    }

    if (!response.ok) {
      authStatus = 'success';
      errorMessage = `HTTP ${response.status} ${response.statusText}`;
      logger.error(`MyShipTracking API error for MMSI ${mmsi}: ${response.status} ${response.statusText}`);
      if (vesselId && app && userId) {
        const responseBody = await response.text();
        await logAPICall(app, vesselId, userId, mmsi, url, requestTime, String(response.status), responseBody, authStatus, errorMessage, 'myshiptracking');
      }
      return {
        name: null,
        mmsi: null,
        imo: null,
        speed_knots: null,
        latitude: null,
        longitude: null,
        course: null,
        heading: null,
        timestamp: null,
        status: null,
        destination: null,
        eta: null,
        callsign: null,
        ship_type: null,
        flag: null,
        is_moving: false,
        error: 'AIS service temporarily unavailable',
      };
    }

    const rawResponse = await response.json() as any;
    logger.info(`Received AIS response for MMSI ${mmsi}`);

    // Log complete raw response for diagnostics
    const fullResponseJSON = JSON.stringify(rawResponse, null, 2);
    logger.info(`Raw API Response (Full Object):\n${fullResponseJSON}`);

    // Extract the actual vessel data - it may be wrapped in a 'data' property
    const data: MyShipTrackingVesselResponse = (rawResponse.data && typeof rawResponse.data === 'object') ? rawResponse.data : rawResponse;

    // Log individual response fields for clarity
    logger.info(`AIS Response Fields - MMSI: ${(data as any).mmsi}, IMO: ${(data as any).imo}, Name: ${(data as any).vessel_name || (data as any).name}`);
    logger.info(`AIS Response Fields - Position: [${(data as any).lat || (data as any).latitude}, ${(data as any).lng || (data as any).longitude}], Speed: ${(data as any).speed} knots, Course: ${(data as any).course}°`);
    logger.info(`AIS Response Fields - Status: ${(data as any).nav_status || (data as any).status}, Heading: ${(data as any).heading}°, Destination: ${(data as any).destination}`);
    logger.info(`AIS Response Fields - ETA: ${(data as any).eta}, Ship Type: ${(data as any).vessel_type || (data as any).ship_type}, Flag: ${(data as any).flag}`);
    logger.info(`AIS Response Fields - Callsign: ${(data as any).callsign}, Built: ${(data as any).built}, Received: ${(data as any).received}`);

    if (vesselId && app && userId) {
      // Store full response without truncation
      const responseBody = JSON.stringify(rawResponse);
      await logAPICall(app, vesselId, userId, mmsi, url, requestTime, '200', responseBody, authStatus, null, 'myshiptracking');
    }

    // Helper function to extract value from either top-level or nested object
    const getValue = (field: string): any => {
      // First try top-level
      if (field in data) {
        return (data as any)[field];
      }
      // Then try nested vessel object
      if ((data as any).vessel && field in (data as any).vessel) {
        return ((data as any).vessel as any)[field];
      }
      // Then try nested position object
      if ((data as any).position && (field === 'latitude' || field === 'longitude' || field === 'lat' || field === 'lng')) {
        if (field === 'latitude' || field === 'lat') return ((data as any).position as any).latitude || ((data as any).position as any).lat;
        if (field === 'longitude' || field === 'lng') return ((data as any).position as any).longitude || ((data as any).position as any).lng;
      }
      // Then try nested navigation object
      if ((data as any).navigation && (field === 'speed' || field === 'course' || field === 'heading' || field === 'nav_status' || field === 'status')) {
        return ((data as any).navigation as any)[field];
      }
      // Then try nested voyage object
      if ((data as any).voyage && (field === 'destination' || field === 'eta' || field === 'status' || field === 'nav_status')) {
        return ((data as any).voyage as any)[field];
      }
      // Check for alternative field names at top level
      if (field === 'name' && ((data as any).vessel_name)) return (data as any).vessel_name;
      if (field === 'latitude' && ((data as any).lat !== undefined)) return (data as any).lat;
      if (field === 'longitude' && ((data as any).lng !== undefined)) return (data as any).lng;
      if (field === 'ship_type' && ((data as any).vessel_type)) return (data as any).vessel_type;
      if (field === 'status' && ((data as any).nav_status)) return (data as any).nav_status;
      return undefined;
    };

    // Extract vessel data from response (handling both flat and nested structures)
    const vesselMmsi = getValue('mmsi') ? String(getValue('mmsi')) : null;
    const imo = getValue('imo') ? String(getValue('imo')) : null;
    const latitude = getValue('latitude') ? parseFloat(String(getValue('latitude'))) : null;
    const longitude = getValue('longitude') ? parseFloat(String(getValue('longitude'))) : null;
    const name = getValue('name') ? String(getValue('name')) : null;
    const speed = getValue('speed') ? parseFloat(String(getValue('speed'))) : null;
    const course = getValue('course') ? parseFloat(String(getValue('course'))) : null;
    const heading = getValue('heading') ? parseFloat(String(getValue('heading'))) : null;
    const status = getValue('status') ? String(getValue('status')) : null;
    const destination = getValue('destination') ? String(getValue('destination')) : null;
    const eta = getValue('eta') ? String(getValue('eta')) : null;
    const callsign = getValue('callsign') ? String(getValue('callsign')) : null;
    const ship_type = getValue('ship_type') ? String(getValue('ship_type')) : null;
    const flag = getValue('flag') ? String(getValue('flag')) : null;

    // Handle timestamp - try ISO 'received' field first, then numeric timestamps
    let timestamp: Date;
    const receivedISO = getValue('received');

    if (receivedISO && typeof receivedISO === 'string') {
      // Parse ISO 8601 timestamp string (e.g., "2024-01-15T14:30:45Z")
      try {
        timestamp = new Date(receivedISO);
        if (isNaN(timestamp.getTime())) {
          logger.warn(`Invalid ISO timestamp for MMSI ${mmsi}: ${receivedISO}`);
          timestamp = new Date();
        } else {
          logger.debug(`Parsed ISO timestamp for MMSI ${mmsi}: ${timestamp.toISOString()}`);
        }
      } catch (e) {
        logger.warn(`Failed to parse ISO timestamp for MMSI ${mmsi}: ${receivedISO}`);
        timestamp = new Date();
      }
    } else {
      // Fall back to numeric timestamps
      const timestampValue = getValue('timestamp') || getValue('last_position_update');
      if (timestampValue) {
        const parsedTimestamp = parseFloat(String(timestampValue));
        // Check if timestamp is valid (not 0 and not negative)
        if (parsedTimestamp > 0) {
          // If timestamp is in seconds (reasonable UNIX timestamp range), convert to milliseconds
          if (parsedTimestamp < 100000000000) {
            timestamp = new Date(parsedTimestamp * 1000);
          } else {
            // Timestamp might already be in milliseconds
            timestamp = new Date(parsedTimestamp);
          }
        } else {
          logger.warn(`Invalid numeric timestamp value for MMSI ${mmsi}: ${timestampValue}`);
          timestamp = new Date();
        }
      } else {
        logger.debug(`No timestamp in AIS response for MMSI ${mmsi}, using current time`);
        timestamp = new Date();
      }
    }

    const is_moving = speed !== null && speed > MOVING_SPEED_THRESHOLD;

    // Log extracted and processed values with timestamp
    logger.info(
      `Processed AIS data for MMSI ${mmsi}: name=${name}, speed=${speed} knots, is_moving=${is_moving}, lat=${latitude}, lon=${longitude}, course=${course}°, heading=${heading}°, status=${status}, destination=${destination}, eta=${eta}, timestamp=${timestamp.toISOString()}`
    );

    // Log summary of extracted vessel information
    logger.info(
      `Vessel Information: callsign=${callsign}, type=${ship_type}, flag=${flag}, built=${getValue('built') || 'unknown'}, imo=${imo}`
    );

    // Log null/missing field warnings for diagnostics
    if (latitude === null || longitude === null) {
      logger.warn(`Missing position data for MMSI ${mmsi}: latitude=${latitude}, longitude=${longitude}`);
    }
    if (speed === null) {
      logger.warn(`Missing speed data for MMSI ${mmsi}: speed=null`);
    }
    if (name === null) {
      logger.warn(`Missing vessel name for MMSI ${mmsi}: name=null`);
    }
    if (status === null) {
      logger.warn(`Missing status data for MMSI ${mmsi}: status=null`);
    }
    if (course === null) {
      logger.debug(`Missing course data for MMSI ${mmsi}: course=null`);
    }
    if (heading === null) {
      logger.debug(`Missing heading data for MMSI ${mmsi}: heading=null`);
    }
    if (destination === null) {
      logger.debug(`Missing destination data for MMSI ${mmsi}: destination=null`);
    }
    if (eta === null) {
      logger.debug(`Missing ETA data for MMSI ${mmsi}: eta=null`);
    }
    if (!receivedISO && !getValue('timestamp') && !getValue('last_position_update')) {
      logger.debug(`No AIS timestamp in response for MMSI ${mmsi}, using current time`);
    }

    return {
      name,
      mmsi: vesselMmsi,
      imo,
      speed_knots: speed,
      latitude,
      longitude,
      course,
      heading,
      timestamp,
      status,
      destination,
      eta,
      callsign,
      ship_type,
      flag,
      is_moving,
      error: null,
    };
  } catch (error) {
    logger.error(`Error fetching vessel AIS data for MMSI ${mmsi}: ${error}`);
    return {
      name: null,
      mmsi: null,
      imo: null,
      speed_knots: null,
      latitude: null,
      longitude: null,
      course: null,
      heading: null,
      timestamp: null,
      status: null,
      destination: null,
      eta: null,
      callsign: null,
      ship_type: null,
      flag: null,
      is_moving: false,
      error: 'AIS service temporarily unavailable',
    };
  }
}

export function register(app: App, fastify: FastifyInstance) {
  // POST /api/ais/check/:vesselId - Check vessel AIS data and manage sea time entries
  fastify.post<{ Params: { vesselId: string }; Querystring: { forceRefresh?: string } }>('/api/ais/check/:vesselId', {
    schema: {
      description: 'Fetch real-time AIS data and manage sea time entries with rate limiting (2-hour interval)',
      tags: ['ais'],
      params: {
        type: 'object',
        required: ['vesselId'],
        properties: { vesselId: { type: 'string' } },
      },
      querystring: {
        type: 'object',
        properties: { forceRefresh: { type: 'string', description: 'Set to "true" to bypass rate limiting for manual checks' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            check_id: { type: 'string' },
            is_moving: { type: 'boolean' },
            speed_knots: { type: ['number', 'null'] },
            latitude: { type: ['number', 'null'] },
            longitude: { type: ['number', 'null'] },
            sea_time_entry_created: { type: 'boolean' },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        429: { type: 'object', properties: { error: { type: 'string' }, nextQueryTime: { type: 'number' } } },
        502: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { vesselId } = request.params;
    const forceRefresh = request.query.forceRefresh === 'true';

    // Check if at least one API key is configured
    if (!DATALASTIC_API_KEY && !MYSHIPTRACKING_API_KEY && !BASE44_API_KEY) {
      app.logger.error('No AIS API keys are configured in environment');
      return reply.code(500).send({ error: 'AIS service not configured - no API keys available' });
    }

    // Fetch vessel from database
    const vessel = await app.db
      .select()
      .from(schema.vessels)
      .where(eq(schema.vessels.id, vesselId));

    if (vessel.length === 0) {
      app.logger.warn(`Vessel not found: ${vesselId}`);
      return reply.code(404).send({ error: 'Vessel not found' });
    }

    // Check subscription status for vessel owner
    const userId = vessel[0].user_id;
    const users = await app.db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId));

    if (users.length > 0) {
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
          { userId, vesselId, subscriptionStatus },
          'AIS check denied: subscription not active'
        );
        return reply.code(403).send({
          error: 'Active subscription required to check vessel AIS data',
        });
      }
    }

    // Check if vessel is active
    if (!vessel[0].is_active) {
      app.logger.warn(`Cannot track inactive vessel: ${vesselId}`);
      return reply.code(400).send({ error: 'Vessel is not active. Please activate the vessel first.' });
    }

    // Rate limiting check (2-hour interval per vessel)
    const RATE_LIMIT_SECONDS = 7200; // 2 hours
    if (!forceRefresh) {
      const lastQuery = await app.db
        .select()
        .from(schema.ais_query_timestamps)
        .where(eq(schema.ais_query_timestamps.vessel_id, vesselId));

      if (lastQuery.length > 0) {
        const lastQueryTime = new Date(lastQuery[0].last_query_time).getTime();
        const currentTime = new Date().getTime();
        const secondsSinceLastQuery = (currentTime - lastQueryTime) / 1000;

        if (secondsSinceLastQuery < RATE_LIMIT_SECONDS) {
          const secondsRemaining = Math.ceil(RATE_LIMIT_SECONDS - secondsSinceLastQuery);
          const minutesRemaining = Math.ceil(secondsRemaining / 60);

          app.logger.warn(
            { vesselId, secondsSinceLastQuery, secondsRemaining },
            `Rate limit exceeded for vessel. Next query allowed in ${minutesRemaining} minutes`
          );

          return reply.code(429).send({
            error: `Rate limit: Please wait ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''} before checking AIS again. This helps conserve API credits.`,
            nextQueryTime: lastQueryTime + RATE_LIMIT_SECONDS * 1000,
          });
        }
      }
    }

    const mmsi = vessel[0].mmsi;
    app.logger.info(`Processing AIS check for active vessel: ${vessel[0].vessel_name} (MMSI: ${mmsi})`);

    // Fetch real-time AIS data using fallback chain: Datalastic → MyShipTracking → Base44
    const { data: ais_data, apiSource } = await fetchVesselAISDataWithFallback(mmsi, app.logger, vesselId, app, userId, true);

    // Check for API errors and return appropriate status codes
    if (ais_data.error) {
      if (ais_data.error === 'Invalid API key') {
        app.logger.error(`Invalid MyShipTracking API key - authentication failed for MMSI ${mmsi}`);
        return reply.code(500).send({ error: 'Invalid API key - AIS service authentication failed' });
      } else if (ais_data.error === 'Vessel not found in AIS system') {
        app.logger.warn(`Vessel with MMSI ${mmsi} not found in AIS system`);
        return reply.code(404).send({ error: `Vessel with MMSI ${mmsi} not found in AIS system` });
      } else {
        // AIS service temporarily unavailable
        app.logger.error(`AIS service error for MMSI ${mmsi}: ${ais_data.error}`);
        return reply.code(502).send({ error: 'AIS service temporarily unavailable' });
      }
    }

    // Update vessel with AIS data (callsign and flag if available)
    if (ais_data.callsign || ais_data.flag) {
      const updateData: Record<string, any> = { updated_at: new Date() };
      if (ais_data.callsign) updateData.callsign = ais_data.callsign;
      if (ais_data.flag && !vessel[0].flag) updateData.flag = ais_data.flag; // Only update flag if not already set

      if (Object.keys(updateData).length > 1) {
        const [updated_vessel] = await app.db
          .update(schema.vessels)
          .set(updateData)
          .where(eq(schema.vessels.id, vesselId))
          .returning();

        app.logger.info(
          { vesselId, callsign: ais_data.callsign, flag: ais_data.flag },
          `Updated vessel with AIS data: callsign=${ais_data.callsign}, flag=${ais_data.flag}`
        );
      }
    }

    // Store the AIS check result
    const check_time = new Date();
    const [ais_check] = await app.db
      .insert(schema.ais_checks)
      .values({
        user_id: userId,
        vessel_id: vesselId,
        check_time,
        is_moving: ais_data.is_moving,
        speed_knots: ais_data.speed_knots !== null ? String(ais_data.speed_knots) : null,
        latitude: ais_data.latitude !== null ? String(ais_data.latitude) : null,
        longitude: ais_data.longitude !== null ? String(ais_data.longitude) : null,
        api_source: apiSource,
      })
      .returning();

    app.logger.info(
      `Stored AIS check: ${ais_check.id} for vessel ${vesselId} - is_moving: ${ais_data.is_moving}, speed: ${ais_data.speed_knots}, api_source: ${apiSource}`
    );

    // Update or insert the last query timestamp for rate limiting
    try {
      const existingTimestamp = await app.db
        .select()
        .from(schema.ais_query_timestamps)
        .where(eq(schema.ais_query_timestamps.vessel_id, vesselId));

      if (existingTimestamp.length > 0) {
        // Update existing timestamp
        await app.db
          .update(schema.ais_query_timestamps)
          .set({
            last_query_time: check_time,
            updated_at: check_time,
          })
          .where(eq(schema.ais_query_timestamps.vessel_id, vesselId))
          .execute();

        app.logger.debug({ vesselId }, 'Updated AIS query timestamp for rate limiting');
      } else {
        // Insert new timestamp
        await app.db
          .insert(schema.ais_query_timestamps)
          .values({
            vessel_id: vesselId,
            last_query_time: check_time,
          })
          .execute();

        app.logger.debug({ vesselId }, 'Created AIS query timestamp for rate limiting');
      }
    } catch (timestampError) {
      app.logger.warn({ err: timestampError, vesselId }, 'Failed to update AIS query timestamp, continuing');
    }

    let sea_time_entry_created = false;
    let sea_time_entry_ended = false;

    // Handle sea time entry lifecycle
    // Get any existing open sea time entries for this vessel
    const open_entry = await app.db
      .select()
      .from(schema.sea_time_entries)
      .where(
        and(
          eq(schema.sea_time_entries.vessel_id, vesselId),
          isNotNull(schema.sea_time_entries.start_time),
          eq(schema.sea_time_entries.status, 'pending')
        )
      )
      .orderBy(desc(schema.sea_time_entries.created_at))
      .limit(1);

    if (ais_data.is_moving) {
      // Vessel is moving
      if (open_entry.length === 0) {
        // Create a new pending sea time entry
        const [new_entry] = await app.db
          .insert(schema.sea_time_entries)
          .values({
            user_id: userId,
            vessel_id: vesselId,
            start_time: check_time,
            status: 'pending',
          })
          .returning();

        sea_time_entry_created = true;
        app.logger.info(`Created new sea time entry: ${new_entry.id} for vessel ${vesselId}`);
      } else {
        // Entry already exists, keep it open
        app.logger.info(`Vessel is still moving, keeping open entry: ${open_entry[0].id}`);
      }
    } else {
      // Vessel is not moving
      if (open_entry.length > 0) {
        // End the sea time entry and calculate duration
        const start_time = open_entry[0].start_time;
        const duration_ms = check_time.getTime() - start_time.getTime();
        const duration_hours = Math.round((duration_ms / (1000 * 60 * 60)) * 100) / 100;

        const [ended_entry] = await app.db
          .update(schema.sea_time_entries)
          .set({
            end_time: check_time,
            duration_hours: String(duration_hours),
          })
          .where(eq(schema.sea_time_entries.id, open_entry[0].id))
          .returning();

        sea_time_entry_ended = true;
        app.logger.info(
          `Ended sea time entry: ${ended_entry.id} with duration: ${duration_hours} hours`
        );
      }
    }

    return reply.code(200).send({
      check_id: ais_check.id,
      is_moving: ais_data.is_moving,
      speed_knots: ais_data.speed_knots,
      latitude: ais_data.latitude,
      longitude: ais_data.longitude,
      sea_time_entry_created,
    });
  });

  // GET /api/ais/status/:vesselId - Return current movement status and recent checks
  fastify.get<{ Params: { vesselId: string } }>('/api/ais/status/:vesselId', {
    schema: {
      description: 'Get current movement status and recent AIS checks (requires authentication)',
      tags: ['ais'],
      params: {
        type: 'object',
        required: ['vesselId'],
        properties: { vesselId: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            is_moving: { type: 'boolean' },
            current_check: { type: 'object' },
            recent_checks: {
              type: 'array',
              items: { type: 'object' },
            },
          },
        },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'AIS status requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { vesselId } = request.params;

    app.logger.info({ userId, vesselId }, 'Fetching AIS status for vessel');

    // Verify vessel exists and belongs to user
    const vessel = await app.db
      .select()
      .from(schema.vessels)
      .where(eq(schema.vessels.id, vesselId));

    if (vessel.length === 0) {
      app.logger.warn({ userId, vesselId }, 'Vessel not found for AIS status');
      return reply.code(404).send({ error: 'Vessel not found' });
    }

    // Verify ownership
    if (vessel[0].user_id !== userId) {
      app.logger.warn({ userId, vesselId }, 'Unauthorized AIS status access attempt');
      return reply.code(403).send({ error: 'Not authorized to access this vessel' });
    }

    // Get latest check
    const latest_check = await app.db
      .select()
      .from(schema.ais_checks)
      .where(eq(schema.ais_checks.vessel_id, vesselId))
      .orderBy(desc(schema.ais_checks.check_time))
      .limit(1);

    // Get recent checks (last 24 hours, max 50)
    const twenty_four_hours_ago = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent_checks = await app.db
      .select()
      .from(schema.ais_checks)
      .where(
        and(
          eq(schema.ais_checks.vessel_id, vesselId),
          gte(schema.ais_checks.check_time, twenty_four_hours_ago)
        )
      )
      .orderBy(desc(schema.ais_checks.check_time))
      .limit(50);

    app.logger.info({ userId, vesselId, checksCount: recent_checks.length }, 'AIS status retrieved');

    return reply.code(200).send({
      is_moving: latest_check.length > 0 ? latest_check[0].is_moving : false,
      current_check: latest_check.length > 0 ? latest_check[0] : null,
      recent_checks,
    });
  });

  // GET /api/ais/check/:vesselId - Manual AIS check (retrieve current location data)
  fastify.get<{ Params: { vesselId: string }; Querystring: { extended?: string } }>('/api/ais/check/:vesselId', {
    schema: {
      description: 'Get current vessel location data from AIS (requires authentication)',
      tags: ['ais'],
      params: {
        type: 'object',
        required: ['vesselId'],
        properties: { vesselId: { type: 'string' } },
      },
      querystring: {
        type: 'object',
        properties: { extended: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            mmsi: { type: 'string' },
            imo: { type: ['string', 'null'] },
            name: { type: ['string', 'null'] },
            latitude: { type: ['number', 'null'] },
            longitude: { type: ['number', 'null'] },
            speed: { type: ['number', 'null'] },
            course: { type: ['number', 'null'] },
            heading: { type: ['number', 'null'] },
            timestamp: { type: ['string', 'null'] },
            status: { type: ['string', 'null'] },
            destination: { type: ['string', 'null'] },
            eta: { type: ['string', 'null'] },
            callsign: { type: ['string', 'null'] },
            vessel_type: { type: ['string', 'null'] },
            flag: { type: ['string', 'null'] },
          },
        },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        502: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'AIS check requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { vesselId } = request.params;
    const extended = request.query.extended === 'true';

    app.logger.info({ userId, vesselId }, `Manual AIS check requested for vessel: ${vesselId}`);

    // Validate API keys
    if (!DATALASTIC_API_KEY && !MYSHIPTRACKING_API_KEY && !BASE44_API_KEY) {
      app.logger.error('No AIS API keys are configured in environment');
      return reply.code(500).send({ error: 'AIS service not configured - no API keys available' });
    }

    // Fetch vessel from database
    const vessel = await app.db
      .select()
      .from(schema.vessels)
      .where(eq(schema.vessels.id, vesselId));

    if (vessel.length === 0) {
      app.logger.warn({ userId, vesselId }, `Vessel not found: ${vesselId}`);
      return reply.code(404).send({ error: 'Vessel not found' });
    }

    // Verify ownership
    if (vessel[0].user_id !== userId) {
      app.logger.warn({ userId, vesselId }, 'Unauthorized AIS check attempt');
      return reply.code(403).send({ error: 'Not authorized to access this vessel' });
    }

    const mmsi = vessel[0].mmsi;
    const { data: ais_data } = await fetchVesselAISDataWithFallback(mmsi, app.logger, vesselId, app, userId, extended);

    if (ais_data.error) {
      if (ais_data.error === 'Invalid API key') {
        app.logger.error(`Authentication failed for MMSI ${mmsi}`);
        return reply.code(401).send({ error: 'Invalid API key' });
      } else if (ais_data.error === 'Vessel not found in AIS system') {
        app.logger.warn(`Vessel ${mmsi} not found in AIS system`);
        return reply.code(404).send({ error: 'Vessel not found in AIS system' });
      } else {
        app.logger.error(`AIS service error: ${ais_data.error}`);
        return reply.code(502).send({ error: 'AIS service temporarily unavailable' });
      }
    }

    const response = {
      mmsi: ais_data.mmsi || mmsi,
      imo: ais_data.imo,
      name: ais_data.name,
      latitude: ais_data.latitude,
      longitude: ais_data.longitude,
      speed: ais_data.speed_knots,
      course: ais_data.course,
      heading: ais_data.heading,
      timestamp: ais_data.timestamp?.toISOString() || null,
      status: ais_data.status,
      destination: ais_data.destination,
      eta: ais_data.eta,
      callsign: extended ? ais_data.callsign : undefined,
      vessel_type: extended ? ais_data.ship_type : undefined,
      flag: extended ? ais_data.flag : undefined,
    };

    app.logger.info(`Returned manual AIS check for MMSI ${mmsi} with extended=${extended} - fields: name=${response.name}, speed=${response.speed}, lat=${response.latitude}, lon=${response.longitude}, destination=${response.destination}, eta=${response.eta}`);
    return reply.code(200).send(response);
  });

  // POST /api/ais/schedule-check - Schedule automatic AIS checks
  fastify.post<{ Body: { vessel_id: string; interval_hours: number } }>('/api/ais/schedule-check', {
    schema: {
      description: 'Schedule automatic AIS checks for a vessel',
      tags: ['ais'],
      body: {
        type: 'object',
        required: ['vessel_id', 'interval_hours'],
        properties: {
          vessel_id: { type: 'string' },
          interval_hours: { type: 'number' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            task_id: { type: 'string' },
            vessel_id: { type: 'string' },
            interval_hours: { type: 'number' },
            next_run: { type: 'string' },
            is_active: { type: 'boolean' },
          },
        },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { vessel_id, interval_hours } = request.body;

    app.logger.info(`Scheduling AIS check for vessel ${vessel_id} with interval ${interval_hours} hours`);

    // Verify vessel exists
    const vessel = await app.db
      .select()
      .from(schema.vessels)
      .where(eq(schema.vessels.id, vessel_id));

    if (vessel.length === 0) {
      app.logger.warn(`Vessel not found: ${vessel_id}`);
      return reply.code(404).send({ error: 'Vessel not found' });
    }

    const userId = vessel[0].user_id;

    // Delete any existing scheduled tasks for this vessel
    await app.db
      .delete(schema.scheduled_tasks)
      .where(
        and(
          eq(schema.scheduled_tasks.vessel_id, vessel_id),
          eq(schema.scheduled_tasks.task_type, 'ais_check')
        )
      )
      .execute();

    // Create new scheduled task
    const now = new Date();
    const nextRun = new Date(now.getTime() + interval_hours * 60 * 60 * 1000);

    const [task] = await app.db
      .insert(schema.scheduled_tasks)
      .values({
        user_id: userId,
        task_type: 'ais_check',
        vessel_id,
        interval_hours: String(interval_hours),
        next_run: nextRun,
        is_active: true,
      })
      .returning();

    app.logger.info(`Created scheduled task ${task.id} for vessel ${vessel_id}, next run: ${nextRun}`);

    return reply.code(200).send({
      task_id: task.id,
      vessel_id: task.vessel_id,
      interval_hours: parseInt(task.interval_hours),
      next_run: nextRun.toISOString(),
      is_active: task.is_active,
    });
  });

  // GET /api/ais/debug/:vesselId - Get debug logs for vessel API calls
  fastify.get<{ Params: { vesselId: string }; Querystring: { limit?: string } }>('/api/ais/debug/:vesselId', {
    schema: {
      description: 'Get debug logs for vessel AIS API calls (requires authentication)',
      tags: ['ais'],
      params: {
        type: 'object',
        required: ['vesselId'],
        properties: { vesselId: { type: 'string' } },
      },
      querystring: {
        type: 'object',
        properties: { limit: { type: 'string' } },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              mmsi: { type: 'string' },
              api_url: { type: 'string' },
              request_time: { type: 'string' },
              response_status: { type: 'string' },
              response_body: { type: ['string', 'null'] },
              authentication_status: { type: 'string' },
              error_message: { type: ['string', 'null'] },
              created_at: { type: 'string' },
            },
          },
        },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'AIS debug logs requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { vesselId } = request.params;
    const limit = request.query.limit ? parseInt(request.query.limit) : 10;

    app.logger.info({ userId, vesselId }, `Retrieving debug logs for vessel ${vesselId}, limit: ${limit}`);

    // Verify vessel exists and belongs to user
    const vessel = await app.db
      .select()
      .from(schema.vessels)
      .where(eq(schema.vessels.id, vesselId));

    if (vessel.length === 0) {
      app.logger.warn({ userId, vesselId }, `Vessel not found: ${vesselId}`);
      return reply.code(404).send({ error: 'Vessel not found' });
    }

    // Verify ownership
    if (vessel[0].user_id !== userId) {
      app.logger.warn({ userId, vesselId }, 'Unauthorized AIS debug logs access attempt');
      return reply.code(403).send({ error: 'Not authorized to access this vessel' });
    }

    // Fetch debug logs
    const logs = await app.db
      .select()
      .from(schema.ais_debug_logs)
      .where(eq(schema.ais_debug_logs.vessel_id, vesselId))
      .orderBy(desc(schema.ais_debug_logs.request_time))
      .limit(Math.min(limit, 100));

    app.logger.info({ userId, vesselId, logsCount: logs.length }, `Retrieved ${logs.length} debug logs for vessel ${vesselId}`);

    return reply.code(200).send(logs);
  });

  // GET /api/ais/scheduled-tasks - Get all scheduled tasks with vessel information
  fastify.get('/api/ais/scheduled-tasks', {
    schema: {
      description: 'Get all scheduled AIS check tasks for authenticated user',
      tags: ['ais'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              vessel_id: { type: 'string' },
              vessel_name: { type: 'string' },
              mmsi: { type: 'string' },
              task_type: { type: 'string' },
              interval_hours: { type: 'number' },
              last_run: { type: ['string', 'null'] },
              next_run: { type: 'string' },
              is_active: { type: 'boolean' },
              created_at: { type: 'string' },
            },
          },
        },
        401: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'Scheduled tasks requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    app.logger.info({ userId }, 'Retrieving scheduled AIS check tasks for user');

    const tasks = await app.db
      .select({
        id: schema.scheduled_tasks.id,
        vessel_id: schema.scheduled_tasks.vessel_id,
        vessel_name: schema.vessels.vessel_name,
        mmsi: schema.vessels.mmsi,
        task_type: schema.scheduled_tasks.task_type,
        interval_hours: schema.scheduled_tasks.interval_hours,
        last_run: schema.scheduled_tasks.last_run,
        next_run: schema.scheduled_tasks.next_run,
        is_active: schema.scheduled_tasks.is_active,
        created_at: schema.scheduled_tasks.created_at,
      })
      .from(schema.scheduled_tasks)
      .innerJoin(schema.vessels, eq(schema.vessels.id, schema.scheduled_tasks.vessel_id))
      .where(eq(schema.scheduled_tasks.user_id, userId))
      .orderBy(desc(schema.scheduled_tasks.next_run));

    const formattedTasks = tasks.map((task) => ({
      id: task.id,
      vessel_id: task.vessel_id,
      vessel_name: task.vessel_name,
      mmsi: task.mmsi,
      task_type: task.task_type,
      interval_hours: parseInt(task.interval_hours),
      last_run: task.last_run ? task.last_run.toISOString() : null,
      next_run: task.next_run.toISOString(),
      is_active: task.is_active,
      created_at: task.created_at.toISOString(),
    }));

    app.logger.info(`Retrieved ${formattedTasks.length} scheduled tasks`);
    return reply.code(200).send(formattedTasks);
  });

  // PUT /api/ais/scheduled-tasks/:taskId - Toggle scheduled task active status
  fastify.put<{ Params: { taskId: string }; Body: { is_active: boolean } }>('/api/ais/scheduled-tasks/:taskId', {
    schema: {
      description: 'Toggle scheduled AIS check task active status',
      tags: ['ais'],
      params: {
        type: 'object',
        required: ['taskId'],
        properties: { taskId: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['is_active'],
        properties: { is_active: { type: 'boolean' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            vessel_id: { type: 'string' },
            vessel_name: { type: 'string' },
            mmsi: { type: 'string' },
            task_type: { type: 'string' },
            interval_hours: { type: 'number' },
            is_active: { type: 'boolean' },
            next_run: { type: 'string' },
          },
        },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { taskId } = request.params;
    const { is_active } = request.body;

    app.logger.info(`Updating scheduled task ${taskId}: is_active=${is_active}`);

    // Find the task
    const existingTask = await app.db
      .select()
      .from(schema.scheduled_tasks)
      .where(eq(schema.scheduled_tasks.id, taskId));

    if (existingTask.length === 0) {
      app.logger.warn(`Scheduled task not found: ${taskId}`);
      return reply.code(404).send({ error: 'Scheduled task not found' });
    }

    // Update task status
    const [updatedTask] = await app.db
      .update(schema.scheduled_tasks)
      .set({ is_active })
      .where(eq(schema.scheduled_tasks.id, taskId))
      .returning();

    // Get vessel information
    const vessel = await app.db
      .select()
      .from(schema.vessels)
      .where(eq(schema.vessels.id, updatedTask.vessel_id));

    if (vessel.length === 0) {
      app.logger.error(`Vessel not found for task ${taskId}`);
      return reply.code(500).send({ error: 'Associated vessel not found' });
    }

    const response = {
      id: updatedTask.id,
      vessel_id: updatedTask.vessel_id,
      vessel_name: vessel[0].vessel_name,
      mmsi: vessel[0].mmsi,
      task_type: updatedTask.task_type,
      interval_hours: parseInt(updatedTask.interval_hours),
      is_active: updatedTask.is_active,
      next_run: updatedTask.next_run.toISOString(),
    };

    app.logger.info(
      { taskId, vesselId: updatedTask.vessel_id, mmsi: vessel[0].mmsi, isActive: is_active },
      `Updated scheduled task status: vessel=${vessel[0].vessel_name}, is_active=${is_active}`
    );

    return reply.code(200).send(response);
  });
}
