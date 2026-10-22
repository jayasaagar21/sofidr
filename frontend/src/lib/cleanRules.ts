/** Baked-in cleaning crosswalks (ISO-style country aliases + common synonyms). */

export const COUNTRY_CANONICAL: Record<string, string> = {
  us: "United States",
  "u.s": "United States",
  "u.s.": "United States",
  usa: "United States",
  "u.s.a": "United States",
  "u.s.a.": "United States",
  "united states": "United States",
  "united states of america": "United States",
  america: "United States",
  "the united states": "United States",
  "the us": "United States",
  "the usa": "United States",
  uk: "United Kingdom",
  "u.k": "United Kingdom",
  "u.k.": "United Kingdom",
  gb: "United Kingdom",
  gbr: "United Kingdom",
  "great britain": "United Kingdom",
  "united kingdom": "United Kingdom",
  england: "United Kingdom",
  scotland: "United Kingdom",
  wales: "United Kingdom",
  uae: "United Arab Emirates",
  "united arab emirates": "United Arab Emirates",
  "south korea": "South Korea",
  korea: "South Korea",
  "north korea": "North Korea",
  russia: "Russia",
  "russian federation": "Russia",
  vietnam: "Vietnam",
  "viet nam": "Vietnam",
  "czech republic": "Czechia",
  czechia: "Czechia",
  holland: "Netherlands",
  netherlands: "Netherlands",
  "the netherlands": "Netherlands",
  brasil: "Brazil",
  brazil: "Brazil",
  "ivory coast": "Côte d'Ivoire",
  "cote divoire": "Côte d'Ivoire",
  "cote d'ivoire": "Côte d'Ivoire",
  turkey: "Turkey",
  turkiye: "Turkey",
  deutschland: "Germany",
  germany: "Germany",
  france: "France",
  canada: "Canada",
  mexico: "Mexico",
  india: "India",
  china: "China",
  japan: "Japan",
  australia: "Australia",
  "new zealand": "New Zealand",
  nz: "New Zealand",
  singapore: "Singapore",
  "south africa": "South Africa",
}

const BOOL_CANONICAL: Record<string, string> = {
  y: "Yes",
  yes: "Yes",
  true: "Yes",
  t: "Yes",
  "1": "Yes",
  n: "No",
  no: "No",
  false: "No",
  f: "No",
  "0": "No",
}

export function normalizeKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function canonicalizeCountry(value: string): string | null {
  const key = normalizeKey(value)
  if (COUNTRY_CANONICAL[key]) return COUNTRY_CANONICAL[key]
  const compact = key.replace(/[\s.]+/g, "")
  return COUNTRY_CANONICAL[compact] || null
}

export function looksLikeCountryColumn(name: string, samples: string[]): boolean {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_")
  if (/country|nation|region|geo|location/.test(key)) return true
  if (!samples.length) return false
  const hits = samples.filter((s) => canonicalizeCountry(s)).length
  return hits / samples.length >= 0.25
}

export function standardizeValue(raw: string, columnName: string, samples: string[]): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  const key = normalizeKey(trimmed)

  if (looksLikeCountryColumn(columnName, samples)) {
    return canonicalizeCountry(trimmed) || trimmed.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
  }

  const country = canonicalizeCountry(trimmed)
  if (country) return country

  if (BOOL_CANONICAL[key]) return BOOL_CANONICAL[key]

  if (/name|status|category|type|label|class|state/.test(columnName.toLowerCase())) {
    return trimmed.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
  }

  return trimmed
}

/** SOFIDR-aligned tactic labels shown during processing. */
export const STRATEGY_STAGES = [
  {
    title: "Understand the dataset",
    detail: "Profile shape, missingness, duplicates, and field roles.",
  },
  {
    title: "Choose cleaning tactics",
    detail: "Match case scenarios: synonym collapse, bounds, imputation, format fixes.",
  },
  {
    title: "Apply structural repair",
    detail: "Sentinel nulls, trim, exact-duplicate removal — retention-aware.",
  },
  {
    title: "Normalize & canonicalize",
    detail: "US / USA / United States → one label; booleans, dates, currency cleaned.",
  },
  {
    title: "Prepare decision outputs",
    detail: "Build preview, analytics signals, and downloadable cleaned file.",
  },
] as const
