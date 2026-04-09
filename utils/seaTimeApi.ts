
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getToken, notifyUnauthorized } from '@/utils/tokenStorage';
import { log, error } from '@/utils/log';

export const API_BASE_URL =
  Constants.expoConfig?.extra?.backendUrl ||
  'https://uukpkcag4nsq8q632k643ztvus28frfe.app.specular.dev';
export const TOKEN_KEY = 'seatime_auth_token';
export const BIOMETRIC_CREDENTIALS_KEY = 'seatime_biometric_credentials';

// Rate limiting constants
const VESSEL_QUERY_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
const LAST_QUERY_TIME_PREFIX = 'vessel_last_query_time_';

/**
 * Dynamic SecureStore loader — still used by non-token operations
 * (e.g. biometric credential storage outside of tokenStorage).
 */
const getSecureStore = async () => {
  return await import('expo-secure-store');
};

// Helper to normalize vessel data from API
const normalizeVessel = (vessel: any) => {
  // CRITICAL: Safe vessel normalization to prevent crashes
  try {
    if (!vessel || typeof vessel !== 'object') return null;
    return {
      ...vessel,
      vessel_type: vessel.vessel_type || vessel.type || null,
    };
  } catch (e: any) {
    error('[seaTimeApi] Error normalizing vessel:', e?.message || e);
    return null;
  }
};

// Rate limiting helpers
const getLastQueryTime = async (vesselId: string): Promise<Date | null> => {
  try {
    const timeString = await AsyncStorage.getItem(`${LAST_QUERY_TIME_PREFIX}${vesselId}`);
    return timeString ? new Date(timeString) : null;
  } catch (e) {
    error('[seaTimeApi] Error getting last query time:', e);
    return null;
  }
};

const setLastQueryTime = async (vesselId: string, time: Date): Promise<void> => {
  try {
    await AsyncStorage.setItem(`${LAST_QUERY_TIME_PREFIX}${vesselId}`, time.toISOString());
  } catch (e) {
    error('[seaTimeApi] Error setting last query time:', e);
  }
};

const shouldQueryVessel = async (vesselId: string, forceRefresh: boolean = false): Promise<boolean> => {
  if (forceRefresh) {
    return true;
  }

  const lastQueryTime = await getLastQueryTime(vesselId);
  if (!lastQueryTime) {
    return true;
  }

  const now = new Date();
  const timeSinceLastQuery = now.getTime() - lastQueryTime.getTime();
  return timeSinceLastQuery > VESSEL_QUERY_INTERVAL;
};

// Check if backend is configured
export const checkBackendConfigured = () => {
  const isConfigured = API_BASE_URL !== 'http://localhost:3000';
  log('[seaTimeApi] Backend configured:', isConfigured, 'URL:', API_BASE_URL);
  return isConfigured;
};

// ---------------------------------------------------------------------------
// Centralised authenticated fetch
// ---------------------------------------------------------------------------
// Every API call in this file goes through authFetch. It:
//  1. Reads the token from the unified tokenStorage (in-memory + persistent)
//  2. Sets the Authorization header
//  3. Applies a default 15 s timeout via AbortController
//  4. On 401 → fires notifyUnauthorized() so the user is redirected to /auth
//  5. On any !ok response → throws with the server error text
// Functions that need custom error mapping (e.g. 409 on createVessel) catch
// the thrown ApiError and re-throw with a user-friendly message.
// ---------------------------------------------------------------------------

class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    const parsed = (() => { try { return JSON.parse(body); } catch { return null; } })();
    const isHtml = body.trimStart().startsWith('<') || body.includes('<!DOCTYPE');

    let message: string;
    if (status >= 500 || isHtml) {
      message = 'Server error. Please try again later.';
    } else {
      message = parsed?.error || parsed?.message || `Request failed (${status})`;
    }

    super(message);
    this.status = status;
    this.body = body;
  }
}

interface AuthFetchOptions {
  method?: string;
  body?: any;
  /** Set to true for FormData uploads (skips JSON content-type) */
  formData?: boolean;
  /** Override the default 15 s timeout */
  timeout?: number;
  /** Pass an external AbortSignal (e.g. from component unmount) */
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT = 15_000;

const authFetch = async (endpoint: string, opts: AuthFetchOptions = {}): Promise<Response> => {
  const { method = 'GET', body, formData = false, timeout = DEFAULT_TIMEOUT, signal } = opts;

  const token = await getToken();

  const headers: HeadersInit = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!formData) headers['Content-Type'] = 'application/json';

  // Timeout via AbortController — respects an external signal too
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers,
      body: formData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      notifyUnauthorized();
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new ApiError(response.status, errorText);
    }

    return response;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err instanceof ApiError) throw err;
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection.');
    }
    throw err;
  }
};

// Keep legacy helpers available for the few callers that still need them
const getAuthToken = (): Promise<string | null> => getToken();
const getApiHeaders = async () => {
  const token = await getAuthToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};
const getFetchOptions = async (method: string = 'GET') => ({ method, headers: await getApiHeaders() });
const check401 = (response: Response) => { if (response.status === 401) notifyUnauthorized(); };

// ---------------------------------------------------------------------------
// API functions — all use authFetch for consistent auth + error handling
// ---------------------------------------------------------------------------

export const getUserProfile = async () => {
  const res = await authFetch('/api/profile');
  return res.json();
};

export const updateUserProfile = async (updates: {
  name?: string;
  email?: string;
  address?: string | null;
  tel_no?: string | null;
  date_of_birth?: string | null;
  srb_no?: string | null;
  nationality?: string | null;
  pya_membership_no?: string | null;
  department?: string | null;
}) => {
  const res = await authFetch('/api/profile', { method: 'PUT', body: updates });
  return res.json();
};

export const uploadProfileImage = async (imageUri: string) => {
  const formData = new FormData();
  formData.append('image', { uri: imageUri, type: 'image/jpeg', name: 'profile.jpg' } as any);
  const res = await authFetch('/api/profile/upload-image', { method: 'POST', body: formData, formData: true });
  return res.json();
};

export const getVessels = async () => {
  const res = await authFetch('/api/vessels');
  const data = await res.json();
  return data.map(normalizeVessel);
};

export const createVessel = async (
  mmsi: string,
  vessel_name: string,
  is_active: boolean = false,
  flag?: string,
  official_number?: string,
  type?: string,
  length_metres?: number,
  gross_tonnes?: number,
  callsign?: string,
  engine_kilowatts?: number,
  engine_type?: string
) => {
  const body: any = { mmsi, vessel_name, is_active };
  if (flag) body.flag = flag;
  if (official_number) body.official_number = official_number;
  if (type) body.type = type;
  if (length_metres !== undefined) body.length_metres = length_metres;
  if (gross_tonnes !== undefined) body.gross_tonnes = gross_tonnes;
  if (callsign) body.callsign = callsign;
  if (engine_kilowatts !== undefined) body.engine_kilowatts = engine_kilowatts;
  if (engine_type) body.engine_type = engine_type;

  try {
    const res = await authFetch('/api/vessels', { method: 'POST', body });
    return normalizeVessel(await res.json());
  } catch (err: any) {
    if (err instanceof ApiError) {
      if (err.status === 409) throw new Error('You already have a vessel with this MMSI. Please use a different MMSI or edit your existing vessel.');
      if (err.status === 500) throw new Error('Server error while creating vessel. Please try again or contact support if the issue persists.');
    }
    throw err;
  }
};

export const updateVesselParticulars = async (
  vesselId: string,
  updates: { vessel_name?: string; flag?: string; official_number?: string; type?: string; length_metres?: number; gross_tonnes?: number; callsign?: string; }
) => {
  const res = await authFetch(`/api/vessels/${vesselId}/particulars`, { method: 'PUT', body: updates });
  return normalizeVessel(await res.json());
};

export const activateVessel = async (vesselId: string) => {
  const res = await authFetch(`/api/vessels/${vesselId}/activate`, { method: 'PUT', body: {} });
  return normalizeVessel(await res.json());
};

export const deleteVessel = async (vesselId: string) => {
  const res = await authFetch(`/api/vessels/${vesselId}`, { method: 'DELETE' });
  return res.json();
};

export const getVesselSeaTime = async (vesselId: string) => {
  const res = await authFetch(`/api/vessels/${vesselId}/sea-time`);
  const data = await res.json();
  return data.map((entry: any) => ({ ...entry, vessel: normalizeVessel(entry.vessel) }));
};

// AIS check — backend handles rate limiting (2-hour interval per vessel)
export const checkVesselAIS = async (vesselId: string, forceRefresh: boolean = false) => {
  const qs = forceRefresh ? '?forceRefresh=true' : '';
  try {
    const res = await authFetch(`/api/ais/check/${vesselId}${qs}`, { method: 'POST', body: {} });
    const data = await res.json();
    await setLastQueryTime(vesselId, new Date());
    return data;
  } catch (err: any) {
    if (err instanceof ApiError && err.status === 429) {
      const parsed = (() => { try { return JSON.parse(err.body); } catch { return null; } })();
      throw new Error(parsed?.error || 'Rate limit: Please wait before checking AIS again.');
    }
    throw err;
  }
};

export const getVesselAISStatus = async (vesselId: string) => {
  const res = await authFetch(`/api/ais/status/${vesselId}`);
  return res.json();
};

// Read-only — returns cached AIS data from the database, never triggers an external API query.
// Normalizes the /api/ais/status response into the flat { latitude, longitude, timestamp }
// shape that callers (home screen, vessel detail) expect.
export const getVesselAISLocation = async (vesselId: string) => {
  const res = await authFetch(`/api/ais/status/${vesselId}`);
  const data = await res.json();

  // /api/ais/status returns { is_moving, current_check, recent_checks }
  // Extract location from the latest check so callers get a flat object.
  const check = data.current_check || (data.recent_checks && data.recent_checks[0]);

  // Coerce lat/lng to numbers — the backend returns them as strings from
  // PostgreSQL numeric columns, but the frontend expects numbers for math ops.
  const toNum = (v: any): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    ...data,
    latitude: toNum(check?.latitude ?? data.latitude),
    longitude: toNum(check?.longitude ?? data.longitude),
    speed: toNum(check?.speed_knots ?? data.speed_knots),
    speed_knots: toNum(check?.speed_knots ?? data.speed_knots),
    course: toNum(check?.course ?? data.course),
    heading: toNum(check?.heading ?? data.heading),
    status: check?.nav_status ?? data.status ?? null,
    destination: check?.destination ?? data.destination ?? null,
    eta: check?.eta ?? data.eta ?? null,
    timestamp: check?.check_time ?? check?.timestamp ?? data.timestamp ?? null,
  };
};

// Get the time remaining until next AIS check is allowed
export const getTimeUntilNextAISCheck = async (vesselId: string): Promise<{ canCheck: boolean; minutesRemaining: number }> => {
  const lastQueryTime = await getLastQueryTime(vesselId);
  
  if (!lastQueryTime) {
    return { canCheck: true, minutesRemaining: 0 };
  }

  const now = new Date();
  const timeSinceLastQuery = now.getTime() - lastQueryTime.getTime();
  const canCheck = timeSinceLastQuery > VESSEL_QUERY_INTERVAL;
  const minutesRemaining = canCheck ? 0 : Math.ceil((VESSEL_QUERY_INTERVAL - timeSinceLastQuery) / 1000 / 60);

  return { canCheck, minutesRemaining };
};

export const scheduleAISChecks = async (vesselId: string, intervalHours: number) => {
  const res = await authFetch(`/api/ais/schedule/${vesselId}`, { method: 'POST', body: { interval_hours: intervalHours } });
  return res.json();
};

export const getScheduledTasks = async () => {
  const res = await authFetch('/api/ais/scheduled-tasks');
  return res.json();
};

export const toggleScheduledTask = async (taskId: string, isActive: boolean) => {
  const res = await authFetch(`/api/ais/scheduled-tasks/${taskId}`, { method: 'PUT', body: { is_active: isActive } });
  return res.json();
};

export const getAISDebugLogs = async (vesselId: string) => {
  const res = await authFetch(`/api/ais/debug/${vesselId}`);
  return res.json();
};

export const getSeaTimeEntries = async () => {
  const res = await authFetch('/api/sea-time');
  const data = await res.json();
  return data.map((entry: any) => ({ ...entry, vessel: normalizeVessel(entry.vessel) }));
};

export const getPendingEntries = async () => {
  const res = await authFetch('/api/sea-time/pending');
  const data = await res.json();
  return data.map((entry: any) => ({ ...entry, vessel: normalizeVessel(entry.vessel) }));
};

export const confirmSeaTimeEntry = async (entryId: string, serviceType?: string) => {
  const body: any = {};
  if (serviceType) body.service_type = serviceType;
  const res = await authFetch(`/api/sea-time/${entryId}/confirm`, { method: 'PUT', body });
  return res.json();
};

export const rejectSeaTimeEntry = async (entryId: string) => {
  const res = await authFetch(`/api/sea-time/${entryId}/reject`, { method: 'PUT', body: {} });
  return res.json();
};

export const updateSeaTimeEntry = async (
  entryId: string,
  updates: {
    service_capacity?: string | null; vessel_category?: string | null;
    actual_days_at_sea?: number | null; standby_service_days?: number | null;
    shipyard_service_days?: number | null; watchkeeping_days?: number | null;
    leave_days?: number | null; duties_and_tasks?: string | null;
    area_cruised?: string | null; notes?: string | null;
    status?: string; service_type?: string | null;
    sea_days?: number | null;
    start_latitude?: number | null;
    start_longitude?: number | null;
    end_latitude?: number | null;
    end_longitude?: number | null;
  }
) => {
  const res = await authFetch(`/api/sea-time/${entryId}`, { method: 'PUT', body: updates });
  return res.json();
};

export const deleteSeaTimeEntry = async (entryId: string) => {
  const res = await authFetch(`/api/sea-time/${entryId}`, { method: 'DELETE' });
  return res.json();
};

export const getReportSummary = async () => {
  const res = await authFetch('/api/reports/summary');
  return res.json();
};

export const downloadCSVReport = async () => {
  const res = await authFetch('/api/reports/csv');
  return res.text();
};

export type ReportTemplate = 'mca' | 'uscg' | 'mnz' | 'amsa' | 'generic';

export const downloadPDFReport = async (template: ReportTemplate = 'mca') => {
  const res = await authFetch(`/api/reports/pdf?template=${template}`);
  return res.blob();
};

export const updateUserSignature = async (signatureDataUrl: string | null) => {
  const res = await authFetch('/api/profile/signature', {
    method: 'PUT',
    body: { signature_image: signatureDataUrl },
  });
  return res.json();
};

export const trackLightshipClick = async () => {
  try {
    await authFetch('/api/lightship/click', { method: 'POST', body: {} });
  } catch {
    // Non-critical, fail silently
  }
};

export const getReferralInfo = async () => {
  const res = await authFetch('/api/referral');
  return res.json();
};

export const togglePublicProfile = async (enabled: boolean) => {
  const res = await authFetch('/api/profile/public-slug', {
    method: 'POST',
    body: { enabled },
  });
  return res.json();
};

export const createTestSeaDayEntry = async () => {
  const res = await authFetch('/api/sea-time/test-entry', { method: 'POST', body: {} });
  return res.json();
};

export const generateSampleSeaTimeEntries = async () => {
  const res = await authFetch('/api/sea-time/generate-samples', { method: 'POST', body: {} });
  return res.json();
};

export const createManualSeaTimeEntry = async (entry: {
  vessel_id: string; start_time: string; end_time?: string | null;
  notes?: string | null; start_latitude?: number | null; start_longitude?: number | null;
  end_latitude?: number | null; end_longitude?: number | null; service_type?: string | null;
}) => {
  const res = await authFetch('/api/logbook/manual-entry', { method: 'POST', body: entry });
  const data = await res.json();
  return { ...data, vessel: normalizeVessel(data.vessel) };
};

export const getNewSeaTimeEntries = async () => {
  const res = await authFetch('/api/sea-time/new-entries');
  const data = await res.json();
  return {
    newEntries: data.entries?.map((entry: any) => ({
      ...entry, vessel_name: entry.vessel?.vessel_name, duration_hours: entry.duration_hours,
    })) || [],
    count: data.count || 0,
  };
};

export const getNotificationSchedule = async () => {
  const res = await authFetch('/api/notifications/schedule');
  return res.json();
};

export const updateNotificationSchedule = async (updates: { scheduled_time?: string; timezone?: string; is_active?: boolean; }) => {
  const res = await authFetch('/api/notifications/schedule', { method: 'PUT', body: updates });
  return res.json();
};

export const checkNotificationDue = async () => {
  const res = await authFetch('/api/notifications/check-due');
  return res.json();
};

export const getVesselDiagnosticStatus = async (vesselId: string) => {
  const res = await authFetch(`/api/ais/status/${vesselId}`);
  return res.json();
};

// ─── Vessel Tracking Persistence ────────────────────────────────────────────
// Persists the active vessel tracking session to AsyncStorage so it survives
// app close/restart. The backend is the source of truth; this is a local cache
// that lets the UI restore state instantly on launch.

const ACTIVE_VESSEL_CACHE_KEY = 'seatime_active_vessel_cache';

export interface ActiveVesselCache {
  vesselId: string;
  vesselName: string;
  mmsi: string;
  isActive: boolean;
  lastUpdated: string; // ISO timestamp
}

/**
 * Persist the currently active vessel to AsyncStorage.
 * Call this whenever the active vessel changes (activate, deactivate, delete).
 */
export const saveActiveVesselCache = async (vessel: ActiveVesselCache | null): Promise<void> => {
  try {
    if (vessel === null) {
      await AsyncStorage.removeItem(ACTIVE_VESSEL_CACHE_KEY);
      log('[seaTimeApi] Active vessel cache cleared');
    } else {
      await AsyncStorage.setItem(ACTIVE_VESSEL_CACHE_KEY, JSON.stringify(vessel));
      log('[seaTimeApi] Active vessel cache saved:', vessel.vesselName, vessel.vesselId);
    }
  } catch (e) {
    error('[seaTimeApi] Failed to save active vessel cache:', e);
  }
};

/**
 * Restore the active vessel cache from AsyncStorage.
 * Returns null if no cache exists or if it is stale/invalid.
 */
export const loadActiveVesselCache = async (): Promise<ActiveVesselCache | null> => {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_VESSEL_CACHE_KEY);
    if (!raw) return null;
    const parsed: ActiveVesselCache = JSON.parse(raw);
    if (!parsed.vesselId || !parsed.vesselName) return null;
    log('[seaTimeApi] Active vessel cache restored:', parsed.vesselName, parsed.vesselId);
    return parsed;
  } catch (e) {
    error('[seaTimeApi] Failed to load active vessel cache:', e);
    return null;
  }
};

// Export getAuthToken and getApiHeaders for use in other components
export { getAuthToken, getApiHeaders };
