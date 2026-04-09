/**
 * HubSpot CRM integration for tracking SeaTime Tracker users
 * as leads in the Foreland Marine sales pipeline.
 *
 * Set HUBSPOT_API_KEY in env to enable. When unset, all functions are no-ops.
 *
 * Strategy: every SeaTime user becomes a HubSpot contact tagged with
 * source "SeaTime Tracker". Senior officers (Master, Chief Engineer)
 * are flagged for follow-up to introduce Lightship ISM.
 */

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
const HUBSPOT_API_URL = "https://api.hubapi.com";

interface CreateContactInput {
  email: string;
  firstName?: string;
  lastName?: string;
  department?: string | null; // 'deck' | 'engineering'
  source?: string; // e.g. 'signup', 'apple_signin'
}

interface HubspotContactProperties {
  email: string;
  firstname?: string;
  lastname?: string;
  lifecyclestage?: string;
  hs_lead_status?: string;
  // Custom properties
  seatime_user?: string; // 'true'
  seatime_signup_date?: string; // ISO date
  seatime_department?: string;
  seatime_signup_source?: string;
  seatime_vessel_name?: string;
  seatime_vessel_mmsi?: string;
  seatime_vessel_flag?: string;
}

/**
 * Create or update a contact in HubSpot.
 * Idempotent — uses upsert by email.
 */
export async function upsertHubspotContact(
  input: CreateContactInput,
  logger?: { info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void }
): Promise<{ success: boolean; contactId?: string; error?: string }> {
  if (!HUBSPOT_API_KEY) {
    logger?.info({ email: input.email }, "[HubSpot] No API key, skipping contact creation");
    return { success: false, error: "HUBSPOT_API_KEY not configured" };
  }

  // Split name into first/last if provided as a single field
  const [firstName, ...rest] = (input.firstName || "").split(" ");
  const lastName = input.lastName || rest.join(" ") || undefined;

  const properties: HubspotContactProperties = {
    email: input.email,
    firstname: firstName || undefined,
    lastname: lastName,
    lifecyclestage: "lead",
    hs_lead_status: "NEW",
    seatime_user: "true",
    seatime_signup_date: new Date().toISOString(),
    seatime_department: input.department || undefined,
    seatime_signup_source: input.source || "signup",
  };

  // Strip undefined values
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined && value !== null) {
      cleaned[key] = String(value);
    }
  }

  try {
    // First try to find existing contact by email
    const searchRes = await fetch(`${HUBSPOT_API_URL}/crm/v3/objects/contacts/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [{ propertyName: "email", operator: "EQ", value: input.email }],
          },
        ],
        limit: 1,
      }),
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      logger?.warn({ status: searchRes.status, error: errText }, "[HubSpot] Search failed");
      return { success: false, error: `HubSpot search returned ${searchRes.status}` };
    }

    const searchData = (await searchRes.json()) as { results?: Array<{ id: string }> };
    const existingId = searchData.results?.[0]?.id;

    if (existingId) {
      // Update existing contact
      const updateRes = await fetch(`${HUBSPOT_API_URL}/crm/v3/objects/contacts/${existingId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${HUBSPOT_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ properties: cleaned }),
      });
      if (!updateRes.ok) {
        const errText = await updateRes.text();
        logger?.warn({ status: updateRes.status, error: errText }, "[HubSpot] Update failed");
        return { success: false, error: `HubSpot update returned ${updateRes.status}` };
      }
      logger?.info({ email: input.email, contactId: existingId }, "[HubSpot] Contact updated");
      return { success: true, contactId: existingId };
    }

    // Create new contact
    const createRes = await fetch(`${HUBSPOT_API_URL}/crm/v3/objects/contacts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ properties: cleaned }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      logger?.warn({ status: createRes.status, error: errText }, "[HubSpot] Create failed");
      return { success: false, error: `HubSpot create returned ${createRes.status}` };
    }

    const createData = (await createRes.json()) as { id: string };
    logger?.info(
      { email: input.email, contactId: createData.id },
      "[HubSpot] Contact created"
    );
    return { success: true, contactId: createData.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger?.error({ err: error, email: input.email }, "[HubSpot] Request failed");
    return { success: false, error: errorMessage };
  }
}

interface VesselEnrichmentInput {
  email: string;
  vesselName?: string;
  mmsi?: string;
  flag?: string;
}

/**
 * Enrich an existing HubSpot contact with vessel information.
 * Used when a user adds a vessel — gives the Foreland sales team
 * vessel context for Lightship outreach.
 */
export async function enrichHubspotContactWithVessel(
  input: VesselEnrichmentInput,
  logger?: { info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void }
): Promise<{ success: boolean; error?: string }> {
  if (!HUBSPOT_API_KEY) {
    return { success: false, error: "HUBSPOT_API_KEY not configured" };
  }

  const properties: Record<string, string> = {};
  if (input.vesselName) properties.seatime_vessel_name = input.vesselName;
  if (input.mmsi) properties.seatime_vessel_mmsi = input.mmsi;
  if (input.flag) properties.seatime_vessel_flag = input.flag;

  if (Object.keys(properties).length === 0) {
    return { success: true };
  }

  try {
    // Find by email
    const searchRes = await fetch(`${HUBSPOT_API_URL}/crm/v3/objects/contacts/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [{ propertyName: "email", operator: "EQ", value: input.email }],
          },
        ],
        limit: 1,
      }),
    });

    if (!searchRes.ok) {
      logger?.warn({ status: searchRes.status }, "[HubSpot] Enrichment search failed");
      return { success: false };
    }

    const searchData = (await searchRes.json()) as { results?: Array<{ id: string }> };
    const contactId = searchData.results?.[0]?.id;
    if (!contactId) {
      logger?.info({ email: input.email }, "[HubSpot] Contact not found for enrichment");
      return { success: false, error: "Contact not found" };
    }

    const updateRes = await fetch(`${HUBSPOT_API_URL}/crm/v3/objects/contacts/${contactId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ properties }),
    });

    if (!updateRes.ok) {
      logger?.warn({ status: updateRes.status }, "[HubSpot] Enrichment update failed");
      return { success: false };
    }

    logger?.info(
      { email: input.email, contactId, vesselName: input.vesselName },
      "[HubSpot] Contact enriched with vessel data"
    );
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger?.error({ err: error, email: input.email }, "[HubSpot] Enrichment request failed");
    return { success: false, error: errorMessage };
  }
}
