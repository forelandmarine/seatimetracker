/**
 * UN/LOCODE → friendly port name lookup.
 *
 * AIS systems report `destination` as either a UN/LOCODE (e.g. "ESVLC") or
 * free-text (e.g. "GIBRALTAR"). This module normalizes both into a friendly
 * port name for display in voyage entries and PDF reports.
 *
 * Source: subset of UN/LOCODE focused on major yacht/superyacht destinations
 * and common commercial ports. Add more as needed.
 */

const PORTS: Record<string, string> = {
  // United Kingdom
  GBLON: "London",
  GBSOU: "Southampton",
  GBPME: "Portsmouth",
  GBPLY: "Plymouth",
  GBFAL: "Falmouth",
  GBPOO: "Poole",
  GBLIV: "Liverpool",
  GBHUL: "Hull",
  GBDOV: "Dover",

  // Spain
  ESBCN: "Barcelona",
  ESVLC: "Valencia",
  ESPMI: "Palma de Mallorca",
  ESALC: "Alicante",
  ESMAH: "Mahon",
  ESIBZ: "Ibiza",
  ESMLG: "Malaga",
  ESCAR: "Cartagena",
  ESBIO: "Bilbao",
  ESLPA: "Las Palmas",
  ESTCI: "Santa Cruz de Tenerife",

  // France
  FRMRS: "Marseille",
  FRMNL: "Marseille La Joliette",
  FRTLN: "Toulon",
  FRNCE: "Nice",
  FRCEQ: "Cannes",
  FRCAN: "Cannes",
  FRJAN: "Antibes",
  FRSTA: "St Tropez",
  FRSXM: "Saint Martin",
  FRLEH: "Le Havre",
  FRBOD: "Bordeaux",

  // Italy
  ITGOA: "Genoa",
  ITNAP: "Naples",
  ITPMO: "Palermo",
  ITCIV: "Civitavecchia",
  ITROM: "Rome",
  ITLIV: "Livorno",
  ITSPE: "La Spezia",
  ITVCE: "Venice",
  ITTRS: "Trieste",
  ITCAG: "Cagliari",
  ITOLB: "Olbia",
  ITPRJ: "Porto Cervo",
  ITPSA: "Pisa",
  ITRMI: "Rimini",

  // Greece
  GRPIR: "Piraeus",
  GRATH: "Athens",
  GRKLX: "Kalamata",
  GRMYT: "Mytilene",
  GRSKG: "Thessaloniki",
  GRRHO: "Rhodes",
  GRHER: "Heraklion",
  GRKZS: "Kos",

  // Croatia
  HRDBV: "Dubrovnik",
  HRSPU: "Split",
  HRRJK: "Rijeka",
  HRZAD: "Zadar",
  HRPUY: "Pula",

  // Monaco
  MCMON: "Monaco",

  // Malta
  MTMLA: "Valletta",
  MTMRX: "Marsaxlokk",

  // Netherlands
  NLRTM: "Rotterdam",
  NLAMS: "Amsterdam",

  // Germany
  DEHAM: "Hamburg",
  DEKEL: "Kiel",
  DEBRV: "Bremerhaven",

  // Denmark
  DKCPH: "Copenhagen",

  // Norway
  NOOSL: "Oslo",
  NOBGO: "Bergen",
  NOTOS: "Tromso",
  NOSVG: "Stavanger",

  // Sweden
  SESTO: "Stockholm",
  SEGOT: "Gothenburg",

  // Caribbean
  AGSJN: "St John's, Antigua",
  AGFAL: "Falmouth Harbour, Antigua",
  BSNAS: "Nassau",
  BSFPO: "Freeport",
  VGRAD: "Road Town, Tortola",
  VGVIJ: "Virgin Gorda",
  AISXM: "Sint Maarten",
  KNBAS: "Basseterre",
  LCKIN: "Kingstown",
  GDSGU: "St George's",
  BBBGI: "Bridgetown",
  CWWIL: "Willemstad",
  TTPOS: "Port of Spain",
  JMKIN: "Kingston",
  PRSJU: "San Juan",
  DOLRM: "La Romana",
  DOPOP: "Puerto Plata",
  CUHAV: "Havana",
  KYGEC: "George Town, Cayman",

  // United States
  USNYC: "New York",
  USMIA: "Miami",
  USFLL: "Fort Lauderdale",
  USPBI: "Palm Beach",
  USNAP: "Naples, FL",
  USTPA: "Tampa",
  USKEY: "Key West",
  USJAX: "Jacksonville",
  USCHS: "Charleston",
  USNFK: "Norfolk",
  USBAL: "Baltimore",
  USBOS: "Boston",
  USNWP: "Newport, RI",
  USSAN: "San Diego",
  USLAX: "Los Angeles",
  USSFO: "San Francisco",
  USSEA: "Seattle",
  USHNL: "Honolulu",

  // Mexico / Central America
  MXACA: "Acapulco",
  MXCUN: "Cancun",
  MXCZM: "Cozumel",
  MXPVR: "Puerto Vallarta",
  PAPTY: "Panama City",

  // Middle East / Gulf
  AEDXB: "Dubai",
  AEAUH: "Abu Dhabi",
  AESHJ: "Sharjah",
  QADOH: "Doha",
  BHBAH: "Manama",
  KWKWI: "Kuwait City",

  // Asia
  SGSIN: "Singapore",
  HKHKG: "Hong Kong",
  CNSHA: "Shanghai",
  JPYOK: "Yokohama",
  JPTYO: "Tokyo",
  THBKK: "Bangkok",
  THPKT: "Phuket",
  IDDPS: "Bali",
  PHMNL: "Manila",
  MYSSG: "Sandakan",

  // Australia / NZ
  AUSYD: "Sydney",
  AUMEL: "Melbourne",
  AUBNE: "Brisbane",
  AUFRE: "Fremantle",
  AUDRW: "Darwin",
  AUHBA: "Hobart",
  NZAKL: "Auckland",
  NZWLG: "Wellington",
  NZCHC: "Christchurch",

  // Africa
  ZACPT: "Cape Town",
  ZADUR: "Durban",
  ZAJNB: "Johannesburg",
  EGSUZ: "Suez",
  EGPSD: "Port Said",
  MAcasablanca: "Casablanca",
  MACAS: "Casablanca",

  // Gibraltar
  GIGIB: "Gibraltar",
};

/**
 * Look up a port name from a UN/LOCODE or free-text destination.
 * Returns null if not found.
 *
 * Examples:
 *   lookupPort('ESVLC')           → 'Valencia'
 *   lookupPort('FRJAN')           → 'Antibes'
 *   lookupPort('Gibraltar')       → 'Gibraltar' (passed through)
 *   lookupPort('GIBRALTAR')       → 'Gibraltar'
 *   lookupPort('US BAL')          → 'Baltimore'
 *   lookupPort('Some text')       → 'Some text' (passed through, normalized case)
 */
export function lookupPort(input: string | null | undefined): string | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try exact UN/LOCODE match (case-insensitive, no spaces)
  const noSpaces = trimmed.replace(/\s+/g, '').toUpperCase();
  if (PORTS[noSpaces]) return PORTS[noSpaces];

  // Try with the original casing (for codes that include spaces in the database)
  const upper = trimmed.toUpperCase();
  if (PORTS[upper]) return PORTS[upper];

  // If input looks like a 5-char UN/LOCODE but not in our database, return null
  if (/^[A-Z]{5}$/.test(noSpaces) && noSpaces.length === 5) {
    return null;
  }

  // Otherwise pass through with title case
  return trimmed
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
