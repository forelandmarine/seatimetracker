import type { FastifyInstance, FastifyRequest } from "fastify";
import { eq, desc, and, gte, isNotNull, isNull, lt, inArray } from "drizzle-orm";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import crypto from "crypto";
import { isSubscriptionActive as checkSubscriptionActive } from "../utils/subscription.js";
import { lookupPort } from "../utils/portDatabase.js";
import { calculateDistanceNauticalMiles, calculateSeaDays } from "../utils/seaTime.js";
import { classifyFixForStorage } from "../utils/seaAreas/classifyFix.js";
import { sendPushToUser } from "../utils/push.js";
import { noteAisIdentity, recordMmsiChange } from "../services/vesselIdentity.js";
import { isInShiftMode } from "../services/shifts.js";

const MOVING_SPEED_THRESHOLD = 2; // knots
const MYSHIPTRACKING_API_URL = 'https://api.myshiptracking.com/api/v2/vessel';
const MYSHIPTRACKING_API_KEY = process.env.MYSHIPTRACKING_API_KEY || '';
const DATALASTIC_API_URL = 'https://api.datalastic.com/api/v0/vessel';
const DATALASTIC_INFO_URL = 'https://api.datalastic.com/api/v0/vessel_info';
const DATALASTIC_API_KEY = process.env.DATALASTIC_API_KEY || '';
const BASE44_API_URL = 'https://app.base44.com/api/apps/695fbc07612e977d62f60329/entities/Vessel';
const BASE44_API_KEY = process.env.BASE44_API_KEY || '';
const DATA_STALENESS_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours
const AIS_FETCH_TIMEOUT_MS = 10_000; // 10 seconds — prevents a hung provider from blocking the scheduler

/** Create an AbortSignal that fires after `ms` milliseconds. */
function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

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

// Callers turn this error into a 404 for the user, so it must only be used when
// the provider positively said it doesn't know the vessel (not for outages).
export const AIS_NOT_FOUND = 'Vessel not found in AIS system';

function emptyAISData(error: string): AISVesselData {
  return {
    name: null, mmsi: null, imo: null, speed_knots: null, latitude: null, longitude: null,
    course: null, heading: null, timestamp: null, status: null, destination: null, eta: null,
    callsign: null, ship_type: null, flag: null, is_moving: false, error,
  };
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

// Looks the vessel up by MMSI, or by IMO when `lookupImo` is given. The IMO never changes,
// so it still finds a vessel whose MMSI changed after a rename or reflag.
async function fetchVesselAISDataFromDatalastic(
  mmsi: string,
  apiKey: string,
  logger: any,
  lookupImo?: string
): Promise<AISVesselData | null> {
  try {
    if (!apiKey) {
      logger.debug(`Datalastic API key not configured, skipping Datalastic`);
      return null;
    }

    // Build request URL with MMSI parameter
    const urlObj = new URL(DATALASTIC_API_URL);
    urlObj.searchParams.append('api-key', apiKey);
    if (lookupImo) urlObj.searchParams.append('imo', lookupImo);
    else urlObj.searchParams.append('mmsi', mmsi);
    const url = urlObj.toString();

    // Log request details (mask API key for security)
    const maskedKey = maskAPIKey(apiKey);
    logger.info(`Using Datalastic API as primary source - ${lookupImo ? `IMO: ${lookupImo}` : `MMSI: ${mmsi}`}, API Key: ${maskedKey}`);

    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: timeoutSignal(AIS_FETCH_TIMEOUT_MS),
      });
    } catch (fetchError) {
      logger.warn(`Datalastic API connection/timeout error for MMSI ${mmsi}: ${fetchError}`);
      return null;
    }

    logger.info(`Datalastic API response status: ${response.status}`);

    // Handle error status codes
    if (!response.ok) {
      if (response.status === 404) {
        logger.warn(`Datalastic API returned 404 - vessel with ${lookupImo ? `IMO ${lookupImo}` : `MMSI ${mmsi}`} not found`);
        return emptyAISData(AIS_NOT_FOUND);
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
        return (data as any).latitude ?? (data as any).lat;
      }
      if (field === 'longitude') {
        return (data as any).longitude ?? (data as any).lon ?? (data as any).lng;
      }
      if (field === 'speed') {
        return (data as any).speed ?? (data as any).speed_knots;
      }
      if (field === 'ship_type') {
        return (data as any).ship_type || (data as any).vessel_type || (data as any).type_specific || (data as any).type;
      }
      if (field === 'flag') {
        return (data as any).flag || (data as any).country_iso;
      }
      if (field === 'status') {
        // Datalastic names it navigation_status; without this it was always dropped.
        return (data as any).status || (data as any).nav_status || (data as any).navigation_status;
      }
      if (field === 'timestamp') {
        return (data as any).timestamp || (data as any).last_position_time || (data as any).last_position_UTC || (data as any).last_position_epoch || (data as any).received || (data as any).position_updated;
      }
      if (field === 'eta') {
        return (data as any).eta || (data as any).eta_UTC;
      }

      return undefined;
    };

    // Extract vessel data
    const vesselMmsi = getValue('mmsi') ? String(getValue('mmsi')) : null;
    const imo = getValue('imo') ? String(getValue('imo')) : null;
    const latitude = getValue('latitude') != null ? parseFloat(String(getValue('latitude'))) : null;
    const longitude = getValue('longitude') != null ? parseFloat(String(getValue('longitude'))) : null;
    const name = getValue('name') ? String(getValue('name')) : null;
    const speed = getValue('speed') != null ? parseFloat(String(getValue('speed'))) : null;
    const course = getValue('course') != null ? parseFloat(String(getValue('course'))) : null;
    const heading = getValue('heading') != null ? parseFloat(String(getValue('heading'))) : null;
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

/**
 * Fetch vessel specifications from Datalastic's /vessel_info endpoint.
 * Returns detailed specs: callsign, country_name, gross_tonnage, length, breadth, type, year_built, etc.
 */
export interface VesselSpecs {
  callsign: string | null;
  flag: string | null;
  type: string | null;
  length_metres: string | null;
  gross_tonnes: string | null;
  imo_number: string | null;
  breadth: string | null;
  // Datalastic answered 404: no vessel has ever transmitted on this MMSI
  not_found?: boolean;
}

export async function fetchVesselSpecs(
  mmsi: string,
  logger: any
): Promise<VesselSpecs | null> {
  try {
    if (!DATALASTIC_API_KEY) {
      logger.debug('Datalastic API key not configured, skipping vessel specs fetch');
      return null;
    }

    const url = `${DATALASTIC_INFO_URL}?api-key=${DATALASTIC_API_KEY}&mmsi=${mmsi}`;
    logger.info(`Fetching vessel specs from Datalastic for MMSI ${mmsi}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: timeoutSignal(AIS_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn(`Datalastic vessel_info returned ${response.status} for MMSI ${mmsi}`);
      if (response.status === 404) {
        return { callsign: null, flag: null, type: null, length_metres: null, gross_tonnes: null, imo_number: null, breadth: null, not_found: true };
      }
      return null;
    }

    const raw = await response.json() as any;
    const data = raw.data && typeof raw.data === 'object' ? raw.data : raw;

    const specs: VesselSpecs = {
      callsign: data.callsign || null,
      flag: data.country_name || data.country_iso || null,
      type: data.type_specific || data.type || null,
      length_metres: data.length != null ? String(data.length) : null,
      gross_tonnes: data.gross_tonnage != null ? String(data.gross_tonnage) : null,
      imo_number: data.imo || null,
      breadth: data.breadth != null ? String(data.breadth) : null,
    };

    logger.info({ mmsi, specs }, `Vessel specs retrieved from Datalastic for MMSI ${mmsi}`);
    return specs;
  } catch (error) {
    logger.error(`Error fetching vessel specs from Datalastic for MMSI ${mmsi}: ${error}`);
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
        headers: { 'api_key': apiKey, 'Content-Type': 'application/json' },
        signal: timeoutSignal(AIS_FETCH_TIMEOUT_MS),
      });
    } catch (fetchError) {
      logger.warn(`Base44 API connection/timeout error for MMSI ${mmsi}: ${fetchError}`);
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
    const latitude = getValue('latitude') != null ? parseFloat(String(getValue('latitude'))) : null;
    const longitude = getValue('longitude') != null ? parseFloat(String(getValue('longitude'))) : null;
    const name = getValue('name') ? String(getValue('name')) : null;
    const speed = getValue('speed') != null ? parseFloat(String(getValue('speed'))) : null;
    const course = getValue('course') != null ? parseFloat(String(getValue('course'))) : null;
    const heading = getValue('heading') != null ? parseFloat(String(getValue('heading'))) : null;
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

/** Current AIS data for a vessel found by IMO (used when its MMSI isn't found). */
export async function fetchVesselAISDataByImo(imo: string, logger: any): Promise<AISVesselData | null> {
  if (!DATALASTIC_API_KEY || !imo) return null;
  const result = await fetchVesselAISDataFromDatalastic('', DATALASTIC_API_KEY, logger, imo);
  return result && !result.error && result.latitude != null && result.longitude != null ? result : null;
}

/**
 * A vessel keeps its IMO for life but gets a new MMSI when it is reflagged (often
 * together with a rename). If AIS shows the user's IMO under another MMSI, move the
 * vessel record to the new MMSI so tracking resumes. Past sea time is linked to the
 * vessel id, not the MMSI, so it is unaffected. Returns true if the MMSI was changed.
 */
export async function applyMmsiChange(
  app: App,
  vesselId: string,
  userId: string,
  oldMmsi: string,
  found: AISVesselData
): Promise<boolean> {
  const newMmsi = found.mmsi ? String(found.mmsi).replace(/\D/g, '') : '';
  if (!/^\d{9}$/.test(newMmsi) || newMmsi === oldMmsi) return false;

  // The user may already have a separate vessel record on the new MMSI
  const clash = await app.db
    .select({ id: schema.vessels.id })
    .from(schema.vessels)
    .where(and(eq(schema.vessels.user_id, userId), eq(schema.vessels.mmsi, newMmsi)));
  if (clash.length > 0) {
    app.logger.warn({ vesselId, oldMmsi, newMmsi }, 'MMSI change found by IMO, but the user already has a vessel on the new MMSI');
    return false;
  }

  const [vessel] = await app.db.select().from(schema.vessels).where(eq(schema.vessels.id, vesselId));
  if (!vessel) return false;
  // Keeps the old MMSI, flag and call sign on record for earlier service.
  const identity = await recordMmsiChange(app, vessel, { mmsi: newMmsi, flag: found.flag, callsign: found.callsign });
  const updates: Record<string, any> = { ...identity, mmsi: newMmsi, updated_at: new Date() };
  await app.db.update(schema.vessels).set(updates).where(eq(schema.vessels.id, vesselId));
  app.logger.info({ vesselId, userId, oldMmsi, newMmsi, imo: found.imo }, 'Vessel MMSI updated: AIS shows its IMO under a new MMSI');
  return true;
}

/** Picks up flag, call sign and name changes from a successful AIS lookup (never fails the lookup). */
async function noteIdentity(app: App | undefined, vesselId: string | undefined, userId: string | undefined, data: AISVesselData, logger: any) {
  if (!app || !vesselId || !userId) return;
  try {
    await noteAisIdentity(app, vesselId, userId, { name: data.name, flag: data.flag, callsign: data.callsign });
  } catch (error) {
    logger.error({ err: error, vesselId }, 'Could not check vessel identity changes');
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
  if (datalasticResult && !datalasticResult.error && datalasticResult.latitude != null && datalasticResult.longitude != null) {
    logger.info(`[FALLBACK CHAIN] ✓ Successfully retrieved data from Datalastic API for MMSI ${mmsi}`);
    if (vesselId && app && userId) {
      await logAPICall(app, vesselId, userId, mmsi, DATALASTIC_API_URL, new Date(), '200', JSON.stringify(datalasticResult), 'success', null, 'datalastic');
    }
    await noteIdentity(app, vesselId, userId, datalasticResult, logger);
    return { data: datalasticResult, apiSource: 'datalastic' };
  }

  const mmsiNotFound = datalasticResult?.error === AIS_NOT_FOUND;

  // Unknown MMSI: the vessel may have been reflagged. Try its IMO and follow it to the new MMSI.
  if (mmsiNotFound && vesselId && app && userId) {
    const [vessel] = await app.db
      .select({ imo_number: schema.vessels.imo_number, vessel_name: schema.vessels.vessel_name })
      .from(schema.vessels)
      .where(eq(schema.vessels.id, vesselId));
    if (vessel?.imo_number) {
      const byImo = await fetchVesselAISDataByImo(vessel.imo_number, logger);
      if (byImo) {
        logger.info(`[FALLBACK CHAIN] ✓ MMSI ${mmsi} not found, but IMO ${vessel.imo_number} is on AIS as MMSI ${byImo.mmsi}`);
        await logAPICall(app, vesselId, userId, mmsi, `${DATALASTIC_API_URL}?imo=${vessel.imo_number}`, new Date(), '200', JSON.stringify(byImo), 'success', null, 'datalastic');
        if (await applyMmsiChange(app, vesselId, userId, mmsi, byImo)) {
          await sendPushToUser(app, userId, {
            title: `${vessel.vessel_name}: MMSI updated`,
            body: `AIS now shows ${vessel.vessel_name} on MMSI ${byImo.mmsi} (it was ${mmsi}), usually after a change of flag. We've updated it and tracking has resumed.`,
            data: { type: 'mmsi_changed', vesselId },
          });
        }
        await noteIdentity(app, vesselId, userId, byImo, logger);
        return { data: byImo, apiSource: 'datalastic' };
      }
    }
  }

  // MyShipTracking is only worth calling when its key is set (every call failed with 401 without one)
  if (MYSHIPTRACKING_API_KEY) {
    logger.warn(`[FALLBACK CHAIN] Datalastic failed or returned incomplete data, falling back to MyShipTracking`);
    const myshipResult = await fetchVesselAISData(mmsi, MYSHIPTRACKING_API_KEY, logger, vesselId, app, extended, userId);
    if (myshipResult && !myshipResult.error && myshipResult.latitude != null && myshipResult.longitude != null) {
      logger.info(`[FALLBACK CHAIN] ✓ Successfully retrieved data from MyShipTracking API for MMSI ${mmsi}`);
      await noteIdentity(app, vesselId, userId, myshipResult, logger);
      return { data: myshipResult, apiSource: 'myshiptracking' };
    }
  }

  logger.warn(`[FALLBACK CHAIN] Falling back to Base44`);

  // Try Base44 last
  const base44Result = await fetchVesselAISDataFromBase44(mmsi, BASE44_API_KEY, logger);
  if (base44Result && !base44Result.error && base44Result.latitude != null && base44Result.longitude != null) {
    logger.info(`[FALLBACK CHAIN] ✓ Successfully retrieved data from Base44 API for MMSI ${mmsi}`);
    if (vesselId && app && userId) {
      await logAPICall(app, vesselId, userId, mmsi, BASE44_API_URL, new Date(), '200', JSON.stringify(base44Result), 'success', null, 'base44');
    }
    await noteIdentity(app, vesselId, userId, base44Result, logger);
    return { data: base44Result, apiSource: 'base44' };
  }

  logger.error(`[FALLBACK CHAIN] ✗ All APIs failed for MMSI ${mmsi}${mmsiNotFound ? ' (Datalastic: MMSI not found)' : ''}`);

  if (mmsiNotFound && vesselId && app && userId) {
    await notifyVesselNotFound(app, vesselId, userId, mmsi);
    return { data: emptyAISData(AIS_NOT_FOUND), apiSource: 'failed' };
  }

  return { data: emptyAISData('All AIS data sources unavailable'), apiSource: 'failed' };
}

// Records the miss in ais_debug_logs and, the first time only, tells the user,
// so a wrong MMSI no longer fails silently on every scheduled check.
async function notifyVesselNotFound(app: App, vesselId: string, userId: string, mmsi: string): Promise<void> {
  const earlier = await app.db
    .select({ id: schema.ais_debug_logs.id })
    .from(schema.ais_debug_logs)
    .where(and(
      eq(schema.ais_debug_logs.vessel_id, vesselId),
      eq(schema.ais_debug_logs.mmsi, mmsi),
      eq(schema.ais_debug_logs.authentication_status, 'not_found'),
    ))
    .limit(1);
  await logAPICall(app, vesselId, userId, mmsi, DATALASTIC_API_URL, new Date(), '404', null, 'not_found', AIS_NOT_FOUND, 'datalastic');
  if (earlier.length > 0) return;

  const [vessel] = await app.db
    .select({ vessel_name: schema.vessels.vessel_name })
    .from(schema.vessels)
    .where(eq(schema.vessels.id, vesselId));
  const name = vessel?.vessel_name || 'Your vessel';
  await sendPushToUser(app, userId, {
    title: `${name} isn't showing on AIS`,
    body: `No AIS position for MMSI ${mmsi}. If the vessel was renamed or reflagged it will have a new MMSI: update it, or add the IMO number, in the vessel's details.`,
    data: { type: 'mmsi_not_found', vesselId },
  });
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
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: timeoutSignal(AIS_FETCH_TIMEOUT_MS),
      });
    } catch (fetchError) {
      authStatus = 'connection_error';
      errorMessage = String(fetchError);
      logger.error(`Connection/timeout error calling MyShipTracking API for MMSI ${mmsi}: ${fetchError}`);
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
    const latitude = getValue('latitude') != null ? parseFloat(String(getValue('latitude'))) : null;
    const longitude = getValue('longitude') != null ? parseFloat(String(getValue('longitude'))) : null;
    const name = getValue('name') ? String(getValue('name')) : null;
    const speed = getValue('speed') != null ? parseFloat(String(getValue('speed'))) : null;
    const course = getValue('course') != null ? parseFloat(String(getValue('course'))) : null;
    const heading = getValue('heading') != null ? parseFloat(String(getValue('heading'))) : null;
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

    // Authenticate the request sender
    const requestUserId = await extractUserIdFromRequest(request, app);
    if (!requestUserId) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    // Check if at least one API key is configured
    if (!DATALASTIC_API_KEY && !MYSHIPTRACKING_API_KEY && !BASE44_API_KEY) {
      app.logger.error('No AIS API keys are configured in environment');
      return reply.code(500).send({ error: 'AIS service not configured' });
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

    // Verify the request sender owns this vessel
    const userId = vessel[0].user_id;
    if (userId !== requestUserId) {
      return reply.code(403).send({ error: 'Access denied' });
    }
    const users = await app.db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId));

    if (users.length > 0) {
      const user = users[0] as any;
      if (!checkSubscriptionActive(user.subscription_status, user.subscription_expires_at)) {
        app.logger.warn(
          { userId, vesselId, subscriptionStatus: user.subscription_status },
          'AIS check denied: subscription not active'
        );
        return reply.code(403).send({
          error: 'Active subscription required to check vessel AIS data',
        });
      }
    }

    // Passages detected while the user is off board are stored hidden until claimed.
    const entryStatus = (users[0] as any)?.on_board === false ? 'off_board' : 'pending';

    // Check if vessel is active
    if (!vessel[0].is_active) {
      app.logger.warn(`Cannot track inactive vessel: ${vesselId}`);
      return reply.code(400).send({ error: 'Vessel is not active. Please activate the vessel first.' });
    }

    // Rate limiting check (2-hour interval per user per vessel)
    const RATE_LIMIT_SECONDS = 7200; // 2 hours
    if (!forceRefresh) {
      const lastQuery = await app.db
        .select()
        .from(schema.ais_query_timestamps)
        .where(and(
          eq(schema.ais_query_timestamps.vessel_id, vesselId),
          eq(schema.ais_query_timestamps.user_id, userId)
        ));

      if (lastQuery.length > 0) {
        const lastQueryTime = new Date(lastQuery[0].last_query_time).getTime();
        const currentTime = new Date().getTime();
        const secondsSinceLastQuery = (currentTime - lastQueryTime) / 1000;

        if (secondsSinceLastQuery < RATE_LIMIT_SECONDS) {
          const secondsRemaining = Math.ceil(RATE_LIMIT_SECONDS - secondsSinceLastQuery);
          const minutesRemaining = Math.ceil(secondsRemaining / 60);

          app.logger.warn(
            { vesselId, userId, secondsSinceLastQuery, secondsRemaining },
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
    // CTV/workboat prep — flag-gated, null-safe, never throws (returns {} when off).
    const seaArea = classifyFixForStorage(ais_data.latitude, ais_data.longitude, check_time);
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
        course: ais_data.course !== null && ais_data.course !== undefined ? String(ais_data.course) : null,
        heading: ais_data.heading !== null && ais_data.heading !== undefined ? String(ais_data.heading) : null,
        nav_status: ais_data.status ?? null,
        destination: lookupPort(ais_data.destination) ?? ais_data.destination ?? null,
        eta: ais_data.eta ?? null,
        api_source: apiSource,
        ...seaArea,
      })
      .returning();

    app.logger.info(
      `Stored AIS check: ${ais_check.id} for vessel ${vesselId} - is_moving: ${ais_data.is_moving}, speed: ${ais_data.speed_knots}, api_source: ${apiSource}`
    );

    // Auto-fill blank vessel particulars from AIS data (non-blocking)
    try {
      const vesselRecord = await app.db.select().from(schema.vessels).where(eq(schema.vessels.id, vesselId));
      if (vesselRecord.length > 0) {
        const v = vesselRecord[0] as any;
        const updates: Record<string, any> = {};
        if (!v.callsign && ais_data.callsign) updates.callsign = ais_data.callsign;
        if (!v.flag && ais_data.flag) updates.flag = ais_data.flag;
        if (!v.type && ais_data.ship_type) updates.type = ais_data.ship_type;
        if (!v.imo_number && ais_data.imo) updates.imo_number = String(ais_data.imo);
        if (Object.keys(updates).length > 0) {
          await app.db.update(schema.vessels).set(updates).where(eq(schema.vessels.id, vesselId));
          app.logger.info({ vesselId, fields: Object.keys(updates) }, 'Auto-filled vessel particulars from AIS');
        }
      }
    } catch (fillErr) {
      app.logger.warn({ vesselId, err: fillErr }, 'Failed to auto-fill vessel particulars (non-critical)');
    }

    // Update or insert the last query timestamp for rate limiting (per user per vessel)
    try {
      const existingTimestamp = await app.db
        .select()
        .from(schema.ais_query_timestamps)
        .where(and(
          eq(schema.ais_query_timestamps.vessel_id, vesselId),
          eq(schema.ais_query_timestamps.user_id, userId)
        ));

      if (existingTimestamp.length > 0) {
        // Update existing timestamp
        await app.db
          .update(schema.ais_query_timestamps)
          .set({
            last_query_time: check_time,
            updated_at: check_time,
          })
          .where(and(
            eq(schema.ais_query_timestamps.vessel_id, vesselId),
            eq(schema.ais_query_timestamps.user_id, userId)
          ))
          .execute();

        app.logger.debug({ vesselId, userId }, 'Updated AIS query timestamp for rate limiting');
      } else {
        // Insert new timestamp
        await app.db
          .insert(schema.ais_query_timestamps)
          .values({
            vessel_id: vesselId,
            user_id: userId,
            last_query_time: check_time,
          })
          .execute();

        app.logger.debug({ vesselId, userId }, 'Created AIS query timestamp for rate limiting');
      }
    } catch (timestampError) {
      app.logger.warn({ err: timestampError, vesselId, userId }, 'Failed to update AIS query timestamp, continuing');
    }

    let sea_time_entry_created = false;
    let sea_time_entry_ended = false;

    // A commercial user who logs shifts has those as their record: no AIS passage
    // is opened or closed for them (see services/shifts.ts).
    if (await isInShiftMode(app, userId, (users[0] as any)?.vessel_sector)) {
      app.logger.info({ vesselId, userId }, 'Shift mode: AIS passage tracking skipped');
      return reply.code(200).send({
        check_id: ais_check.id,
        is_moving: ais_data.is_moving,
        speed_knots: ais_data.speed_knots,
        latitude: ais_data.latitude,
        longitude: ais_data.longitude,
        sea_time_entry_created,
      });
    }

    // Handle sea time entry lifecycle
    // Only an entry with no end_time is an open voyage. An entry that already has
    // an end_time (closed here earlier, or written by the scheduler) must never be
    // re-closed from this endpoint: doing so moved its end to "now" on every app
    // refresh and stretched a 9-hour passage into an 11-day entry while the yacht
    // lay in port.
    const open_entry = await app.db
      .select()
      .from(schema.sea_time_entries)
      .where(
        and(
          eq(schema.sea_time_entries.vessel_id, vesselId),
          eq(schema.sea_time_entries.user_id, userId),
          isNotNull(schema.sea_time_entries.start_time),
          isNull(schema.sea_time_entries.end_time),
          // An open passage is closed when the vessel stops, whichever side of the
          // on/off board switch it was opened on.
          inArray(schema.sea_time_entries.status, ['pending', 'off_board'])
        )
      )
      .orderBy(desc(schema.sea_time_entries.created_at))
      .limit(1);

    // A pending entry the scheduler is still growing (end_time within the last
    // few hours) already covers this passage; opening another would overlap it.
    const ACTIVE_PASSAGE_WINDOW_MS = 3 * 60 * 60 * 1000;
    const activePassage = open_entry.length === 0 && ais_data.is_moving
      ? await app.db
          .select({ id: schema.sea_time_entries.id })
          .from(schema.sea_time_entries)
          .where(
            and(
              eq(schema.sea_time_entries.vessel_id, vesselId),
              eq(schema.sea_time_entries.user_id, userId),
              eq(schema.sea_time_entries.status, entryStatus),
              gte(schema.sea_time_entries.end_time, new Date(check_time.getTime() - ACTIVE_PASSAGE_WINDOW_MS))
            )
          )
          .limit(1)
      : [];

    if (ais_data.is_moving) {
      // Vessel is moving
      if (activePassage.length > 0) {
        app.logger.info(`Vessel is moving and passage entry ${activePassage[0].id} is already being tracked`);
      } else if (open_entry.length === 0) {
        // Create a new pending sea time entry with voyage port data if available
        const friendlyDest = lookupPort(ais_data.destination) ?? ais_data.destination ?? null;
        const [new_entry] = await app.db
          .insert(schema.sea_time_entries)
          .values({
            user_id: userId,
            vessel_id: vesselId,
            start_time: check_time,
            start_latitude: ais_data.latitude !== null ? String(ais_data.latitude) : null,
            start_longitude: ais_data.longitude !== null ? String(ais_data.longitude) : null,
            to_port: friendlyDest,
            status: entryStatus,
          })
          .returning();

        sea_time_entry_created = true;
        app.logger.info(`Created new sea time entry: ${new_entry.id} for vessel ${vesselId}`);

        // Guard against race condition: if a concurrent request also inserted,
        // keep only the earliest entry and delete the rest. Only open entries
        // are candidates: closed pending entries are earlier passages still
        // awaiting the user's review and must never be deleted here.
        const allPending = await app.db
          .select()
          .from(schema.sea_time_entries)
          .where(
            and(
              eq(schema.sea_time_entries.vessel_id, vesselId),
              eq(schema.sea_time_entries.user_id, userId),
              eq(schema.sea_time_entries.status, entryStatus),
              isNotNull(schema.sea_time_entries.start_time),
              isNull(schema.sea_time_entries.end_time)
            )
          )
          .orderBy(schema.sea_time_entries.created_at);

        if (allPending.length > 1) {
          const keepId = allPending[0].id; // earliest
          const dupeIds = allPending.slice(1).map(e => e.id);
          await app.db
            .delete(schema.sea_time_entries)
            .where(inArray(schema.sea_time_entries.id, dupeIds));
          app.logger.warn(
            { vesselId, kept: keepId, deleted: dupeIds },
            `Deduplicated ${dupeIds.length} concurrent pending sea time entries`
          );
        }
      } else {
        // Entry already exists, keep it open
        app.logger.info(`Vessel is still moving, keeping open entry: ${open_entry[0].id}`);
      }
    } else {
      // Vessel is not moving
      if (open_entry.length > 0) {
        // End the passage when the vessel actually stopped: the first stationary
        // fix after the last underway fix since the entry opened. The user may
        // only open the app days after arriving, so "now" is not the end time.
        const start_time = open_entry[0].start_time;
        const checksSinceStart = await app.db
          .select()
          .from(schema.ais_checks)
          .where(
            and(
              eq(schema.ais_checks.vessel_id, vesselId),
              gte(schema.ais_checks.check_time, start_time)
            )
          )
          .orderBy(schema.ais_checks.check_time);
        let lastMovingIdx = -1;
        checksSinceStart.forEach((c, i) => { if (c.is_moving) lastMovingIdx = i; });
        const stopCheck = checksSinceStart[lastMovingIdx + 1] ?? null;
        const end_time = stopCheck ? stopCheck.check_time : check_time;

        const duration_ms = end_time.getTime() - start_time.getTime();
        const duration_hours = Math.round((duration_ms / (1000 * 60 * 60)) * 100) / 100;

        // Calculate distance from start to end position
        const startLat = open_entry[0].start_latitude != null ? parseFloat(String(open_entry[0].start_latitude)) : null;
        const startLon = open_entry[0].start_longitude != null ? parseFloat(String(open_entry[0].start_longitude)) : null;
        const endLat = stopCheck?.latitude != null ? parseFloat(String(stopCheck.latitude)) : ais_data.latitude;
        const endLon = stopCheck?.longitude != null ? parseFloat(String(stopCheck.longitude)) : ais_data.longitude;
        let distance_nm: string | null = null;
        if (startLat !== null && startLon !== null && endLat !== null && endLon !== null) {
          const d = calculateDistanceNauticalMiles(startLat, startLon, endLat, endLon);
          distance_nm = String(Math.round(d * 100) / 100);
        }

        const sea_days = calculateSeaDays(start_time, end_time);
        const mca_compliant = duration_hours >= 4;

        // Resolve port names for the voyage
        const endDest = lookupPort(ais_data.destination) ?? ais_data.destination ?? null;

        const [ended_entry] = await app.db
          .update(schema.sea_time_entries)
          .set({
            end_time,
            duration_hours: String(duration_hours),
            end_latitude: endLat !== null ? String(endLat) : null,
            end_longitude: endLon !== null ? String(endLon) : null,
            distance_nm,
            sea_days,
            mca_compliant,
            // Update to_port with latest destination (may have changed during voyage)
            ...(endDest ? { to_port: endDest } : {}),
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
            current_check: {
              type: ['object', 'null'],
              additionalProperties: true,
            },
            recent_checks: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
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
            check_id: { type: 'string' },
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
            is_moving: { type: 'boolean' },
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

    const checkId = crypto.randomUUID();
    const is_moving = ais_data.speed_knots != null && ais_data.speed_knots > MOVING_SPEED_THRESHOLD;
    const friendlyDestination = lookupPort(ais_data.destination || null);
    const response = {
      check_id: checkId,
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
      destination_friendly: friendlyDestination, // resolved via UN/LOCODE lookup
      eta: ais_data.eta,
      callsign: extended ? ais_data.callsign : undefined,
      vessel_type: extended ? ais_data.ship_type : undefined,
      flag: extended ? ais_data.flag : undefined,
      is_moving,
    };

    app.logger.info({ checkId, vesselId, mmsi }, `Returned manual AIS check for MMSI ${mmsi} with extended=${extended} - fields: name=${response.name}, speed=${response.speed}, lat=${response.latitude}, lon=${response.longitude}, destination=${response.destination}, eta=${response.eta}`);
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
    const requestUserId = await extractUserIdFromRequest(request, app);
    if (!requestUserId) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

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

    // Verify ownership
    if (userId !== requestUserId) {
      return reply.code(403).send({ error: 'Not authorized to schedule checks for this vessel' });
    }

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
    const requestUserId = await extractUserIdFromRequest(request, app);
    if (!requestUserId) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

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

    // Verify ownership
    if (existingTask[0].user_id !== requestUserId) {
      return reply.code(403).send({ error: 'Not authorized to modify this task' });
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

  // GET /api/ais/checks/:id - Get cached AIS data for a vessel
  fastify.get<{ Params: { id: string } }>('/api/ais/checks/:id', {
    schema: {
      description: 'Get the most recent cached AIS data for a vessel (requires authentication)',
      tags: ['ais'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid', description: 'Vessel ID' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            vessel_id: { type: 'string' },
            check_time: { type: 'string' },
            is_moving: { type: 'boolean' },
            speed_knots: { type: ['number', 'null'] },
            latitude: { type: ['number', 'null'] },
            longitude: { type: ['number', 'null'] },
            api_source: { type: 'string' },
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
      app.logger.warn({}, 'AIS check cached data requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { id: vesselId } = request.params;

    app.logger.info({ userId, vesselId }, 'Fetching cached AIS data for vessel');

    // Verify vessel exists and belongs to user
    const vessel = await app.db
      .select()
      .from(schema.vessels)
      .where(eq(schema.vessels.id, vesselId));

    if (vessel.length === 0) {
      app.logger.warn({ userId, vesselId }, 'Vessel not found');
      return reply.code(404).send({ error: 'Vessel not found' });
    }

    if (vessel[0].user_id !== userId) {
      app.logger.warn({ userId, vesselId }, 'Unauthorized: vessel does not belong to user');
      return reply.code(403).send({ error: 'Not authorized to access this vessel' });
    }

    // Query most recent AIS check
    const latest_check = await app.db
      .select()
      .from(schema.ais_checks)
      .where(eq(schema.ais_checks.vessel_id, vesselId))
      .orderBy(desc(schema.ais_checks.check_time))
      .limit(1);

    if (latest_check.length === 0) {
      app.logger.warn({ userId, vesselId }, 'No AIS data found for vessel');
      return reply.code(404).send({ error: 'No AIS data found' });
    }

    const check = latest_check[0];
    app.logger.info({ userId, vesselId, checkId: check.id }, 'Cached AIS data retrieved');

    return reply.code(200).send({
      success: true,
      vessel_id: check.vessel_id,
      check_time: check.check_time.toISOString(),
      is_moving: check.is_moving,
      speed_knots: check.speed_knots != null ? parseFloat(String(check.speed_knots)) : null,
      latitude: check.latitude != null ? parseFloat(String(check.latitude)) : null,
      longitude: check.longitude != null ? parseFloat(String(check.longitude)) : null,
      api_source: check.api_source || 'unknown',
    });
  });
}
