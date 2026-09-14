/**
 * One country name for a location an artist typed freely. No imports, so it
 * can be tested on its own. See regions.ts for why regions come from the roster.
 */

const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia",
  "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin",
  "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia",
  "Comoros", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czechia", "DR Congo", "Denmark", "Djibouti", "Dominica",
  "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini",
  "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada",
  "Guatemala", "Guinea-Bissau", "Guinea", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia",
  "Iran", "Iraq", "Ireland", "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya",
  "Kiribati", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya",
  "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta",
  "Mauritania", "Mauritius", "Mexico", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique",
  "Myanmar", "Namibia", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea",
  "North Macedonia", "Norway", "Oman", "Pakistan", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru",
  "Philippines", "Poland", "Portugal", "Qatar", "Republic of the Congo", "Romania", "Russia", "Rwanda",
  "Saint Lucia", "Samoa", "San Marino", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone",
  "Singapore", "Slovakia", "Slovenia", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka",
  "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste",
  "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Uganda", "Ukraine",
  "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Venezuela",
  "Vietnam", "Yemen", "Zambia", "Zimbabwe",
];

/** Other ways people write a country, and cities people give instead of one. */
const ALIASES: Record<string, string> = {
  "usa": "United States", "u.s.a": "United States", "u.s": "United States", "us": "United States",
  "america": "United States", "united states of america": "United States",
  "uk": "United Kingdom", "u.k": "United Kingdom", "england": "United Kingdom", "scotland": "United Kingdom",
  "wales": "United Kingdom", "great britain": "United Kingdom", "britain": "United Kingdom",
  "uae": "United Arab Emirates", "drc": "DR Congo", "democratic republic of the congo": "DR Congo",
  "congo-kinshasa": "DR Congo", "congo-brazzaville": "Republic of the Congo", "congo": "Republic of the Congo",
  "cote d'ivoire": "Ivory Coast", "côte d'ivoire": "Ivory Coast", "swaziland": "Eswatini", "burma": "Myanmar",
  "czech republic": "Czechia", "holland": "Netherlands", "turkiye": "Turkey", "türkiye": "Turkey",
  "cape verde": "Cabo Verde", "sa": "South Africa", "rsa": "South Africa", "zim": "Zimbabwe", "naija": "Nigeria",
  // Cities
  "lusaka": "Zambia", "livingstone": "Zambia", "kitwe": "Zambia", "ndola": "Zambia", "kabwe": "Zambia",
  "chingola": "Zambia", "mufulira": "Zambia", "luanshya": "Zambia", "kasama": "Zambia", "chipata": "Zambia",
  "solwezi": "Zambia", "mongu": "Zambia", "choma": "Zambia", "mansa": "Zambia", "kafue": "Zambia", "mazabuka": "Zambia",
  "lagos": "Nigeria", "abuja": "Nigeria", "port harcourt": "Nigeria", "ibadan": "Nigeria", "kano": "Nigeria",
  "johannesburg": "South Africa", "joburg": "South Africa", "cape town": "South Africa", "durban": "South Africa",
  "pretoria": "South Africa", "soweto": "South Africa", "harare": "Zimbabwe", "bulawayo": "Zimbabwe",
  "gaborone": "Botswana", "francistown": "Botswana", "nairobi": "Kenya", "mombasa": "Kenya", "accra": "Ghana",
  "kumasi": "Ghana", "kampala": "Uganda", "dar es salaam": "Tanzania", "lilongwe": "Malawi", "blantyre": "Malawi",
  "windhoek": "Namibia", "maputo": "Mozambique", "luanda": "Angola", "kinshasa": "DR Congo", "lubumbashi": "DR Congo",
  "kigali": "Rwanda", "addis ababa": "Ethiopia", "dakar": "Senegal", "tripoli": "Libya", "benghazi": "Libya",
  "cairo": "Egypt", "casablanca": "Morocco", "tunis": "Tunisia", "algiers": "Algeria",
  "london": "United Kingdom", "manchester": "United Kingdom", "birmingham": "United Kingdom",
  "new york": "United States", "los angeles": "United States", "atlanta": "United States", "houston": "United States",
  "chicago": "United States", "miami": "United States", "toronto": "Canada", "paris": "France", "berlin": "Germany",
  "dubai": "United Arab Emirates", "kingston": "Jamaica", "tbilisi": "Georgia", "batumi": "Georgia",
};

const US_STATES = [
  "georgia",
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida",
  "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland",
  "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada",
  "new hampshire", "new jersey", "new mexico", "north carolina", "north dakota", "ohio", "oklahoma", "oregon",
  "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
  "virginia", "washington", "west virginia", "wisconsin", "wyoming",
];
/** State abbreviations, only trusted after a comma ("Atlanta, Ga.", "Austin, TX"). */
const US_STATE_ABBR = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me",
  "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa",
  "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy", "dc", "calif", "fla", "mich", "penn", "tenn",
]);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phraseRe = (phrase: string) => new RegExp(`(^|[^a-z])${escapeRe(phrase)}($|[^a-z])`, "i");

// Longest first, so "South Sudan" wins over "Sudan" and "Guinea-Bissau" over "Guinea".
const COUNTRY_MATCHERS = [...COUNTRIES].sort((a, b) => b.length - a.length).map((c) => ({ name: c, re: phraseRe(c.toLowerCase()) }));
const ALIAS_MATCHERS = Object.keys(ALIASES).sort((a, b) => b.length - a.length).map((k) => ({ key: k, re: phraseRe(k) }));
const STATE_MATCHERS = [...US_STATES].sort((a, b) => b.length - a.length).map((s) => phraseRe(s));

/**
 * One country for whatever an artist wrote as their location, or null when
 * there is nothing to go on. Something we cannot place is kept as they wrote
 * it (its last part), so a new place still shows up rather than vanishing.
 */
export function countryOf(location: string | null | undefined): string | null {
  const raw = (location ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const text = raw.toLowerCase();

  const parts = text.split(/[,/|]/).map((p) => p.trim().replace(/\.+$/, "")).filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  // A US state after a city ("Atlanta, Ga.", "Savannah, Georgia") is the United
  // States, checked before countries so Georgia the state is not Georgia the country.
  const knownCity = ALIAS_MATCHERS.find((a) => a.key.length > 3 && a.re.test(text));
  if (
    parts.length > 1 &&
    (US_STATE_ABBR.has(last.replace(/\./g, "")) || US_STATES.includes(last)) &&
    (!knownCity || ALIASES[knownCity.key] === "United States")
  ) return "United States";

  for (const c of COUNTRY_MATCHERS) if (c.re.test(text)) return c.name;

  for (const a of ALIAS_MATCHERS) {
    // Two-letter aliases (us, uk, sa) only count as a whole part, never inside a word or sentence.
    if (a.key.replace(/\./g, "").length <= 3) {
      if (parts.some((p) => p.replace(/\./g, "") === a.key.replace(/\./g, ""))) return ALIASES[a.key];
      continue;
    }
    if (a.re.test(text)) return ALIASES[a.key];
  }
  for (const s of STATE_MATCHERS) if (s.test(text)) return "United States";

  // Somewhere we do not know yet: keep the place as they wrote it.
  const fallback = raw.split(/[,/|]/).map((p) => p.trim()).filter(Boolean).pop() ?? raw;
  const cleaned = fallback.replace(/[^\p{L}\p{M}\s'.-]/gu, "").trim();
  if (cleaned.length < 2 || cleaned.length > 40) return null;
  return cleaned.replace(/\b\p{L}/gu, (ch) => ch.toUpperCase());
}
