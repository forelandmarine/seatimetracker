
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

export const API_BASE_URL =
  Constants.expoConfig?.extra?.backendUrl || 'http://localhost:3000';
export const TOKEN_KEY = 'seatime_auth_token';
export const BIOMETRIC_CREDENTIALS_KEY = 'seatime_biometric_credentials';

// Rate limiting constants
const VESSEL_QUERY_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
const LAST_QUERY_TIME_PREFIX = 'vessel_last_query_time_';

/**
 * Dynamic SecureStore loader to prevent module-scope TurboModule initialization
 * This prevents early initialization that can cause SIGABRT crashes post-auth
 */
const getSecureStore = async () => {
  console.log('[seaTimeApi] Dynamically loading expo-secure-store...');
  // Add a small delay to ensure the app is fully initialized
  await new Promise(resolve => setTimeout(resolve, 100));
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
  } catch (error: any) {
    console.error('[seaTimeApi] Error normalizing vessel:', error?.message || error);
    return null;
  }
};

// Rate limiting helpers
const getLastQueryTime = async (vesselId: string): Promise<Date | null> => {
  try {
    const timeString = await AsyncStorage.getItem(`${LAST_QUERY_TIME_PREFIX}${vesselId}`);
    return timeString ? new Date(timeString) : null;
  } catch (error) {
    console.error('[seaTimeApi] Error getting last query time:', error);
    return null;
  }
};

const setLastQueryTime = async (vesselId: string, time: Date): Promise<void> => {
  try {
    await AsyncStorage.setItem(`${LAST_QUERY_TIME_PREFIX}${vesselId}`, time.toISOString());
    console.log('[seaTimeApi] Set last query time for vessel:', vesselId, 'at', time.toISOString());
  } catch (error) {
    console.error('[seaTimeApi] Error setting last query time:', error);
  }
};

const shouldQueryVessel = async (vesselId: string, forceRefresh: boolean = false): Promise<boolean> => {
  if (forceRefresh) {
    console.log('[seaTimeApi] Force refresh requested for vessel:', vesselId);
    return true;
  }

  const lastQueryTime = await getLastQueryTime(vesselId);
  if (!lastQueryTime) {
    console.log('[seaTimeApi] No previous query time found for vessel:', vesselId, '- allowing query');
    return true;
  }

  const now = new Date();
  const timeSinceLastQuery = now.getTime() - lastQueryTime.getTime();
  const shouldQuery = timeSinceLastQuery > VESSEL_QUERY_INTERVAL;

  if (shouldQuery) {
    console.log('[seaTimeApi] Last query was', Math.floor(timeSinceLastQuery / 1000 / 60), 'minutes ago - allowing query');
  } else {
    const minutesRemaining = Math.ceil((VESSEL_QUERY_INTERVAL - timeSinceLastQuery) / 1000 / 60);
    console.log('[seaTimeApi] Rate limit active - last query was', Math.floor(timeSinceLastQuery / 1000 / 60), 'minutes ago. Next query allowed in', minutesRemaining, 'minutes');
  }

  return shouldQuery;
};

// Check if backend is configured
export const checkBackendConfigured = () => {
  const isConfigured = API_BASE_URL !== 'http://localhost:3000';
  console.log('[seaTimeApi] Backend configured:', isConfigured, 'URL:', API_BASE_URL);
  return isConfigured;
};

// Get auth token from secure storage
const getAuthToken = async (): Promise<string | null> => {
  // CRITICAL: Comprehensive error handling to prevent crashes
  try {
    if (Platform.OS === 'web') {
      // Safe localStorage access
      if (typeof window !== 'undefined' && window.localStorage) {
        return localStorage.getItem(TOKEN_KEY);
      }
      return null;
    }
    // Dynamically load SecureStore to prevent early TurboModule initialization
    const SecureStore = await getSecureStore();
    if (!SecureStore || !SecureStore.getItemAsync) {
      console.error('[seaTimeApi] SecureStore not available');
      return null;
    }
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (error: any) {
    console.error('[seaTimeApi] Error getting auth token:', error?.message || error);
    // Don't crash - return null and let the app handle unauthenticated state
    return null;
  }
};

// Get headers with auth token
const getApiHeaders = async () => {
  // CRITICAL: Safe header construction to prevent crashes
  try {
    const token = await getAuthToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token && typeof token === 'string' && token.length > 0) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  } catch (error: any) {
    console.error('[seaTimeApi] Error getting API headers:', error?.message || error);
    // Return basic headers without auth
    return {
      'Content-Type': 'application/json',
    };
  }
};

// Helper to get fetch options with auth
const getFetchOptions = async (method: string = 'GET') => {
  const headers = await getApiHeaders();
  return {
    method,
    headers,
  };
};

// Get user profile
export const getUserProfile = async () => {
  console.log('[seaTimeApi] Fetching user profile from /api/profile');
  console.log('[seaTimeApi] API_BASE_URL:', API_BASE_URL);
  console.log('[seaTimeApi] Platform:', Platform.OS);
  
  try {
    const options = await getFetchOptions('GET');
    console.log('[seaTimeApi] Fetch options prepared, making request...');
    
    const response = await fetch(`${API_BASE_URL}/api/profile`, options);
    console.log('[seaTimeApi] Response received:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[seaTimeApi] Failed to fetch user profile:', response.status, errorText);
      throw new Error(`Failed to fetch user profile: ${response.status}`);
    }

    const data = await response.json();
    console.log('[seaTimeApi] User profile fetched successfully');
    console.log('[seaTimeApi] Profile data:', JSON.stringify(data, null, 2));
    
    // Backend returns the profile object directly
    return data;
  } catch (error: any) {
    console.error('[seaTimeApi] getUserProfile error:', error);
    console.error('[seaTimeApi] Error details:', error.message, error.name);
    throw error;
  }
};

// Update user profile
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
  console.log('[seaTimeApi] Updating user profile');
  const headers = await getApiHeaders();
  const response = await fetch(`${API_BASE_URL}/api/profile`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to update user profile:', response.status, errorText);
    throw new Error(`Failed to update user profile: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] User profile updated successfully');
  return data;
};

// Upload profile image
export const uploadProfileImage = async (imageUri: string) => {
  console.log('[seaTimeApi] Uploading profile image to /api/profile/upload-image');
  const token = await getAuthToken();
  
  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    type: 'image/jpeg',
    name: 'profile.jpg',
  } as any);

  const response = await fetch(`${API_BASE_URL}/api/profile/upload-image`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to upload profile image:', response.status, errorText);
    throw new Error(`Failed to upload profile image: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Profile image uploaded successfully');
  return data;
};

// Get all vessels
export const getVessels = async () => {
  console.log('[seaTimeApi] Fetching vessels');
  const options = await getFetchOptions('GET');
  const response = await fetch(`${API_BASE_URL}/api/vessels`, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to fetch vessels:', response.status, errorText);
    throw new Error(`Failed to fetch vessels: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Vessels fetched successfully:', data.length);
  return data.map(normalizeVessel);
};

// Create a new vessel
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
  console.log('[seaTimeApi] Creating vessel:', { 
    mmsi, 
    vessel_name, 
    is_active,
    flag,
    official_number,
    type,
    length_metres,
    gross_tonnes,
    callsign,
    engine_kilowatts,
    engine_type
  });
  
  const body: any = { mmsi, vessel_name, is_active };
  if (flag) body.flag = flag;
  if (official_number) body.official_number = official_number;
  if (type) body.type = type;
  if (length_metres !== undefined) body.length_metres = length_metres;
  if (gross_tonnes !== undefined) body.gross_tonnes = gross_tonnes;
  if (callsign) body.callsign = callsign;
  if (engine_kilowatts !== undefined) body.engine_kilowatts = engine_kilowatts;
  if (engine_type) body.engine_type = engine_type;
  
  const headers = await getApiHeaders();
  const response = await fetch(`${API_BASE_URL}/api/vessels`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to create vessel:', response.status, errorText);
    
    // Try to parse error response for better error messages
    let errorMessage = `Failed to create vessel (${response.status})`;
    try {
      const errorData = JSON.parse(errorText);
      if (errorData.error) {
        errorMessage = errorData.error;
      }
    } catch (parseError) {
      console.error('[seaTimeApi] Could not parse error response:', parseError);
    }
    
    // Provide user-friendly error messages based on status code
    if (response.status === 409) {
      errorMessage = 'You already have a vessel with this MMSI. Please use a different MMSI or edit your existing vessel.';
    } else if (response.status === 500) {
      errorMessage = 'Server error while creating vessel. Please try again or contact support if the issue persists.';
    } else if (response.status === 401) {
      errorMessage = 'Authentication required. Please sign in again.';
    }
    
    throw new Error(errorMessage);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Vessel created successfully:', data.id);
  return normalizeVessel(data);
};

// Update vessel particulars
export const updateVesselParticulars = async (
  vesselId: string,
  updates: {
    vessel_name?: string;
    flag?: string;
    official_number?: string;
    type?: string;
    length_metres?: number;
    gross_tonnes?: number;
    callsign?: string;
  }
) => {
  console.log('[seaTimeApi] Updating vessel particulars:', vesselId);
  const headers = await getApiHeaders();
  const response = await fetch(`${API_BASE_URL}/api/vessels/${vesselId}/particulars`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to update vessel particulars:', response.status, errorText);
    throw new Error(`Failed to update vessel particulars: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Vessel particulars updated successfully');
  return normalizeVessel(data);
};

// Activate a vessel
export const activateVessel = async (vesselId: string) => {
  console.log('[seaTimeApi] Activating vessel:', vesselId);
  const headers = await getApiHeaders();
  const response = await fetch(`${API_BASE_URL}/api/vessels/${vesselId}/activate`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to activate vessel:', response.status, errorText);
    throw new Error(`Failed to activate vessel: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Vessel activated successfully');
  return normalizeVessel(data);
};

// Delete a vessel
export const deleteVessel = async (vesselId: string) => {
  console.log('[seaTimeApi] Deleting vessel:', vesselId);
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/api/vessels/${vesselId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': token ? `Bearer ${token}` : '',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to delete vessel:', response.status, errorText);
    throw new Error(`Failed to delete vessel: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Vessel deleted successfully');
  return data;
};

// Get sea time entries for a vessel
export const getVesselSeaTime = async (vesselId: string) => {
  console.log('[seaTimeApi] Fetching sea time for vessel:', vesselId);
  const options = await getFetchOptions('GET');
  const response = await fetch(`${API_BASE_URL}/api/vessels/${vesselId}/sea-time`, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to fetch vessel sea time:', response.status, errorText);
    throw new Error(`Failed to fetch vessel sea time: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Vessel sea time fetched successfully:', data.length);
  return data.map((entry: any) => ({
    ...entry,
    vessel: normalizeVessel(entry.vessel),
  }));
};

// Check AIS for a vessel with rate limiting
// The backend now handles rate limiting (2-hour interval per vessel)
// Pass forceRefresh=true to bypass rate limiting for manual user checks
export const checkVesselAIS = async (vesselId: string, forceRefresh: boolean = false) => {
  console.log('[seaTimeApi] Checking AIS for vessel:', vesselId, 'forceRefresh:', forceRefresh);
  
  const headers = await getApiHeaders();
  
  // Add forceRefresh as query parameter if true
  const url = forceRefresh 
    ? `${API_BASE_URL}/api/ais/check/${vesselId}?forceRefresh=true`
    : `${API_BASE_URL}/api/ais/check/${vesselId}`;
  
  console.log('[seaTimeApi] POST request to:', url);
  
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to check vessel AIS:', response.status, errorText);
    
    // Handle 429 rate limit error from backend
    if (response.status === 429) {
      try {
        const errorData = JSON.parse(errorText);
        // Backend returns error message with time remaining
        throw new Error(errorData.error || 'Rate limit exceeded. Please try again later.');
      } catch (parseError) {
        throw new Error('Rate limit: Please wait before checking AIS again. This helps conserve API credits.');
      }
    }
    
    throw new Error(`Failed to check vessel AIS: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // Update last query time on successful check for client-side tracking
  await setLastQueryTime(vesselId, new Date());
  
  console.log('[seaTimeApi] Vessel AIS checked successfully');
  return data;
};

// Get AIS status for a vessel
export const getVesselAISStatus = async (vesselId: string) => {
  console.log('[seaTimeApi] Fetching AIS status for vessel:', vesselId);
  const options = await getFetchOptions('GET');
  const response = await fetch(`${API_BASE_URL}/api/ais/status/${vesselId}`, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to fetch vessel AIS status:', response.status, errorText);
    throw new Error(`Failed to fetch vessel AIS status: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Vessel AIS status fetched successfully');
  return data;
};

// Get AIS location for a vessel - FIXED: Use correct endpoint
// This is a read-only operation that doesn't trigger a new API query, so no rate limiting
export const getVesselAISLocation = async (vesselId: string, extended: boolean = false) => {
  console.log('[seaTimeApi] Fetching AIS location for vessel:', vesselId, 'extended:', extended);
  const options = await getFetchOptions('GET');
  const url = `${API_BASE_URL}/api/ais/check/${vesselId}${extended ? '?extended=true' : ''}`;
  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to fetch vessel AIS location:', response.status, errorText);
    throw new Error(`Failed to fetch vessel AIS location: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Vessel AIS location fetched successfully');
  return data;
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

// Schedule AIS checks for a vessel
export const scheduleAISChecks = async (vesselId: string, intervalHours: number) => {
  console.log('[seaTimeApi] Scheduling AIS checks for vessel:', vesselId, 'interval:', intervalHours);
  const headers = await getApiHeaders();
  const response = await fetch(`${API_BASE_URL}/api/ais/schedule/${vesselId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ interval_hours: intervalHours }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to schedule AIS checks:', response.status, errorText);
    throw new Error(`Failed to schedule AIS checks: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] AIS checks scheduled successfully');
  return data;
};

// Get scheduled tasks
export const getScheduledTasks = async () => {
  console.log('[seaTimeApi] Fetching scheduled tasks');
  const options = await getFetchOptions('GET');
  const response = await fetch(`${API_BASE_URL}/api/ais/scheduled-tasks`, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to fetch scheduled tasks:', response.status, errorText);
    throw new Error(`Failed to fetch scheduled tasks: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Scheduled tasks fetched successfully:', data.length);
  return data;
};

// Toggle scheduled task - FIXED: Use correct endpoint without /toggle
export const toggleScheduledTask = async (taskId: string, isActive: boolean) => {
  console.log('[seaTimeApi] Toggling scheduled task:', taskId, 'active:', isActive);
  const headers = await getApiHeaders();
  const response = await fetch(`${API_BASE_URL}/api/ais/scheduled-tasks/${taskId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ is_active: isActive }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to toggle scheduled task:', response.status, errorText);
    throw new Error(`Failed to toggle scheduled task: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Scheduled task toggled successfully');
  return data;
};

// Get AIS debug logs for a vessel
export const getAISDebugLogs = async (vesselId: string) => {
  console.log('[seaTimeApi] Fetching AIS debug logs for vessel:', vesselId);
  const options = await getFetchOptions('GET');
  const response = await fetch(`${API_BASE_URL}/api/ais/debug/${vesselId}`, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to fetch AIS debug logs:', response.status, errorText);
    throw new Error(`Failed to fetch AIS debug logs: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] AIS debug logs fetched successfully:', data.length);
  return data;
};

// Get all sea time entries
export const getSeaTimeEntries = async () => {
  console.log('[seaTimeApi] Fetching sea time entries');
  const options = await getFetchOptions('GET');
  const response = await fetch(`${API_BASE_URL}/api/sea-time`, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to fetch sea time entries:', response.status, errorText);
    throw new Error(`Failed to fetch sea time entries: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Sea time entries fetched successfully:', data.length);
  return data.map((entry: any) => ({
    ...entry,
    vessel: normalizeVessel(entry.vessel),
  }));
};

// Get pending sea time entries
export const getPendingEntries = async () => {
  console.log('[seaTimeApi] Fetching pending sea time entries');
  const options = await getFetchOptions('GET');
  const response = await fetch(`${API_BASE_URL}/api/sea-time/pending`, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to fetch pending entries:', response.status, errorText);
    throw new Error(`Failed to fetch pending entries: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Pending entries fetched successfully:', data.length);
  return data.map((entry: any) => ({
    ...entry,
    vessel: normalizeVessel(entry.vessel),
  }));
};

// Confirm sea time entry with service type
export const confirmSeaTimeEntry = async (entryId: string, serviceType?: string) => {
  console.log('[seaTimeApi] Confirming sea time entry:', entryId, 'service type:', serviceType);
  const headers = await getApiHeaders();
  const body: any = {};
  if (serviceType) {
    body.service_type = serviceType;
  }
  
  const response = await fetch(`${API_BASE_URL}/api/sea-time/${entryId}/confirm`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to confirm sea time entry:', response.status, errorText);
    throw new Error(`Failed to confirm sea time entry: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Sea time entry confirmed successfully');
  return data;
};

// Reject sea time entry
export const rejectSeaTimeEntry = async (entryId: string) => {
  console.log('[seaTimeApi] Rejecting sea time entry:', entryId);
  console.log('[seaTimeApi] API URL:', `${API_BASE_URL}/api/sea-time/${entryId}/reject`);
  const headers = await getApiHeaders();
  console.log('[seaTimeApi] Request headers:', headers);
  
  const response = await fetch(`${API_BASE_URL}/api/sea-time/${entryId}/reject`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({}),
  });

  console.log('[seaTimeApi] Response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to reject sea time entry:', response.status, errorText);
    throw new Error(`Failed to reject sea time entry: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Sea time entry rejected successfully:', data);
  return data;
};

// Update sea time entry
export const updateSeaTimeEntry = async (
  entryId: string,
  updates: {
    service_capacity?: string | null;
    vessel_category?: string | null;
    actual_days_at_sea?: number | null;
    standby_service_days?: number | null;
    shipyard_service_days?: number | null;
    watchkeeping_days?: number | null;
    leave_days?: number | null;
    duties_and_tasks?: string | null;
    area_cruised?: string | null;
    notes?: string | null;
    status?: string;
    service_type?: string | null;
  }
) => {
  console.log('[seaTimeApi] Updating sea time entry:', entryId);
  const headers = await getApiHeaders();
  const response = await fetch(`${API_BASE_URL}/api/sea-time/${entryId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to update sea time entry:', response.status, errorText);
    throw new Error(`Failed to update sea time entry: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Sea time entry updated successfully');
  return data;
};

// Delete sea time entry - FIXED: Don't send Content-Type header for DELETE
export const deleteSeaTimeEntry = async (entryId: string) => {
  console.log('[seaTimeApi] Deleting sea time entry:', entryId);
  const token = await getAuthToken();
  
  // For DELETE requests, don't send Content-Type: application/json header
  // This prevents 400 errors when there's no body
  const response = await fetch(`${API_BASE_URL}/api/sea-time/${entryId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': token ? `Bearer ${token}` : '',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to delete sea time entry:', response.status, errorText);
    throw new Error(`Failed to delete sea time entry: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Sea time entry deleted successfully');
  return data;
};

// Get report summary
export const getReportSummary = async () => {
  console.log('[seaTimeApi] Fetching report summary');
  const options = await getFetchOptions('GET');
  const response = await fetch(`${API_BASE_URL}/api/reports/summary`, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to fetch report summary:', response.status, errorText);
    throw new Error(`Failed to fetch report summary: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Report summary fetched successfully');
  return data;
};

// Download CSV report
export const downloadCSVReport = async () => {
  console.log('[seaTimeApi] Downloading CSV report');
  const options = await getFetchOptions('GET');
  const response = await fetch(`${API_BASE_URL}/api/reports/csv`, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to download CSV report:', response.status, errorText);
    throw new Error(`Failed to download CSV report: ${response.status}`);
  }

  const data = await response.text();
  console.log('[seaTimeApi] CSV report downloaded successfully');
  return data;
};

// Download PDF report
export const downloadPDFReport = async () => {
  console.log('[seaTimeApi] Downloading PDF report');
  const options = await getFetchOptions('GET');
  const response = await fetch(`${API_BASE_URL}/api/reports/pdf`, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to download PDF report:', response.status, errorText);
    throw new Error(`Failed to download PDF report: ${response.status}`);
  }

  const blob = await response.blob();
  console.log('[seaTimeApi] PDF report downloaded successfully');
  return blob;
};

// Create test sea day entry
export const createTestSeaDayEntry = async () => {
  console.log('[seaTimeApi] Creating test sea day entry');
  const headers = await getApiHeaders();
  const response = await fetch(`${API_BASE_URL}/api/sea-time/test-entry`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to create test sea day entry:', response.status, errorText);
    throw new Error(`Failed to create test sea day entry: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Test sea day entry created successfully');
  return data;
};

// Generate sample sea time entries
export const generateSampleSeaTimeEntries = async () => {
  console.log('[seaTimeApi] Generating sample sea time entries');
  const headers = await getApiHeaders();
  const response = await fetch(`${API_BASE_URL}/api/sea-time/generate-samples`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to generate sample entries:', response.status, errorText);
    throw new Error(`Failed to generate sample entries: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Sample sea time entries generated successfully');
  return data;
};

// Create manual sea time entry
export const createManualSeaTimeEntry = async (entry: {
  vessel_id: string;
  start_time: string;
  end_time?: string | null;
  notes?: string | null;
  start_latitude?: number | null;
  start_longitude?: number | null;
  end_latitude?: number | null;
  end_longitude?: number | null;
  service_type?: string | null;
}) => {
  console.log('[seaTimeApi] Creating manual sea time entry');
  const headers = await getApiHeaders();
  const response = await fetch(`${API_BASE_URL}/api/logbook/manual-entry`, {
    method: 'POST',
    headers,
    body: JSON.stringify(entry),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to create manual sea time entry:', response.status, errorText);
    throw new Error(`Failed to create manual sea time entry: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Manual sea time entry created successfully');
  return {
    ...data,
    vessel: normalizeVessel(data.vessel),
  };
};

// Get new sea time entries
export const getNewSeaTimeEntries = async () => {
  console.log('[seaTimeApi] Fetching new sea time entries');
  const options = await getFetchOptions('GET');
  const response = await fetch(`${API_BASE_URL}/api/sea-time/new-entries`, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to fetch new sea time entries:', response.status, errorText);
    throw new Error(`Failed to fetch new sea time entries: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] New sea time entries fetched successfully');
  return {
    newEntries: data.entries?.map((entry: any) => ({
      ...entry,
      vessel_name: entry.vessel?.vessel_name,
      duration_hours: entry.duration_hours,
    })) || [],
    count: data.count || 0,
  };
};

// Get notification schedule
export const getNotificationSchedule = async () => {
  console.log('[seaTimeApi] Fetching notification schedule');
  const options = await getFetchOptions('GET');
  const response = await fetch(`${API_BASE_URL}/api/notifications/schedule`, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to fetch notification schedule:', response.status, errorText);
    throw new Error(`Failed to fetch notification schedule: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Notification schedule fetched successfully:', data);
  return data;
};

// Update notification schedule
export const updateNotificationSchedule = async (updates: {
  scheduled_time?: string;
  timezone?: string;
  is_active?: boolean;
}) => {
  console.log('[seaTimeApi] Updating notification schedule:', updates);
  const headers = await getApiHeaders();
  const response = await fetch(`${API_BASE_URL}/api/notifications/schedule`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to update notification schedule:', response.status, errorText);
    throw new Error(`Failed to update notification schedule: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Notification schedule updated successfully:', data);
  return data;
};

// Check if notification is due
export const checkNotificationDue = async () => {
  console.log('[seaTimeApi] Checking if notification is due');
  const options = await getFetchOptions('GET');
  const response = await fetch(`${API_BASE_URL}/api/notifications/check-due`, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to check notification due:', response.status, errorText);
    throw new Error(`Failed to check notification due: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Notification due check completed:', data);
  return data;
};

// Verify vessel tasks - ensures all active vessels have scheduled tasks
export const verifyVesselTasks = async () => {
  console.log('[seaTimeApi] Verifying vessel tasks');
  const headers = await getApiHeaders();
  const response = await fetch(`${API_BASE_URL}/api/admin/verify-vessel-tasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to verify vessel tasks:', response.status, errorText);
    throw new Error(`Failed to verify vessel tasks: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Vessel tasks verification completed:', data);
  return data;
};

// Get vessel diagnostic status - detailed sea time detection analysis
export const getVesselDiagnosticStatus = async (mmsi: string) => {
  console.log('[seaTimeApi] Fetching vessel diagnostic status for MMSI:', mmsi);
  const options = await getFetchOptions('GET');
  const response = await fetch(`${API_BASE_URL}/api/admin/vessel-status/${mmsi}`, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to fetch vessel diagnostic status:', response.status, errorText);
    throw new Error(`Failed to fetch vessel diagnostic status: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Vessel diagnostic status fetched successfully');
  return data;
};

// Generate demo sea time entries for a user (admin endpoint)
export const generateDemoEntries = async (email: string, count: number = 43) => {
  console.log('[seaTimeApi] Generating demo entries for user:', email, 'count:', count);
  const headers = await getApiHeaders();
  const response = await fetch(`${API_BASE_URL}/api/admin/generate-demo-entries`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, count }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[seaTimeApi] Failed to generate demo entries:', response.status, errorText);
    throw new Error(`Failed to generate demo entries: ${response.status}`);
  }

  const data = await response.json();
  console.log('[seaTimeApi] Demo entries generated successfully:', data.entriesCreated);
  return data;
};

// Export getAuthToken and getApiHeaders for use in other components
export { getAuthToken, getApiHeaders };
