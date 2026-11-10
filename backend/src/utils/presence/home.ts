/**
 * A best guess at the user's home country for the Days abroad tax cards, from the
 * free-text nationality on their profile, else their maritime authority.
 */

const NATIONALITY: Array<[RegExp, string]> = [
  [/\b(british|english|scottish|welsh|northern irish|united kingdom|uk|gb|great britain)\b/i, 'GB'],
  [/\b(american|usa|us|united states)\b/i, 'US'],
  [/\b(australian|australia)\b/i, 'AU'],
  [/\b(new zealand|new zealander|kiwi|nz)\b/i, 'NZ'],
  [/\b(south african|south africa|rsa)\b/i, 'ZA'],
  [/\b(irish|ireland)\b/i, 'IE'],
  [/\b(canadian|canada)\b/i, 'CA'],
  [/\b(spanish|spain|español|espanol)\b/i, 'ES'],
  [/\b(french|france|français|francais)\b/i, 'FR'],
  [/\b(italian|italy|italiano)\b/i, 'IT'],
  [/\b(german|germany|deutsch)\b/i, 'DE'],
  [/\b(dutch|netherlands|nederlands)\b/i, 'NL'],
];

const AUTHORITY: Record<string, string> = { mca: 'GB', uscg: 'US', amsa: 'AU', mnz: 'NZ', samsa: 'ZA' };

export function guessHomeCountry(nationality: string | null | undefined, authority: string | null | undefined): string | null {
  const n = (nationality ?? '').trim();
  // "Northern Irish" must win over "Irish".
  if (/northern irish/i.test(n)) return 'GB';
  for (const [re, code] of NATIONALITY) if (re.test(n)) return code;
  if (/^[A-Za-z]{2}$/.test(n)) return n.toUpperCase();
  return (authority && AUTHORITY[authority.toLowerCase()]) || null;
}
