/**
 * Trend bundling — group hashtag/topic variants under one bundle_key.
 *
 * Examples:
 *   #worldcup + #worldcup2026 + #fifaworldcup + #mundial2026 → "worldcup"
 *   #mothersday + #happymothersday + #mother → "mothersday" (caught by holiday
 *      filter so usually not active, but bundled if they survive)
 *   "Easter Sunday" + "Pasen" → "easter"
 *
 * Strategy:
 *   1. Compute a "topic key" per trend via normalization
 *   2. Apply synonym table (mundial → worldcup, pasen → easter, etc.)
 *   3. Trends with same topic key share a bundle_key
 *   4. Bundle key = the topic key
 *
 * No AI required — pure pattern matching, fast.
 */

// Cross-lingual synonyms → canonical topic key
const SYNONYM_TABLE: Record<string, string> = {
  // World Cup variants
  mundial: 'worldcup',
  fifaworldcup: 'worldcup',
  worldcup2026: 'worldcup',
  mundial2026: 'worldcup',
  fifaworldcup2026: 'worldcup',
  // Mother's Day
  moederdag: 'mothersday',
  fetedesmeres: 'mothersday',
  festadellamamma: 'mothersday',
  diadelamadre: 'mothersday',
  diadelasmadres: 'mothersday',
  diadamae: 'mothersday',
  muttertag: 'mothersday',
  anyaknapja: 'mothersday',
  dzienmatki: 'mothersday',
  '10demayo': 'mothersday',
  happymothersday: 'mothersday',
  mother: 'mothersday',
  mama: 'mothersday',
  mamamia: 'mothersday',
  // Father's Day
  vaderdag: 'fathersday',
  fetedesperes: 'fathersday',
  vatertag: 'fathersday',
  diadelpadre: 'fathersday',
  diadopai: 'fathersday',
  // Eurovision
  eurovision2026: 'eurovision',
  // Easter
  pasen: 'easter',
  paques: 'easter',
  ostern: 'easter',
  pascua: 'easter',
  pasqua: 'easter',
  // Christmas
  kerst: 'christmas',
  weihnachten: 'christmas',
  noel: 'christmas',
  navidad: 'christmas',
  natale: 'christmas',
  // Valentine's Day
  valentijnsdag: 'valentinesday',
  valentijn: 'valentinesday',
  // Cannes Film Festival vs Cannes Lions
  cannesfilmfestival: 'cannesfilm',
  // TikTok / Instagram general
  tiktoksound: 'tiktoksounds',
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for',
  'with', 'by', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
])

/**
 * Compute a canonical topic key for a trend.
 *
 * Strips:
 *   - Leading "#"
 *   - Year suffixes (2026, 2027, etc.)
 *   - Non-letter characters
 *   - Trailing "s" (loose plural normalization — careful with this)
 * Applies synonym lookup.
 *
 * Returns lowercase string suitable for grouping. Empty string if no
 * meaningful key can be derived.
 */
export function computeBundleKey(name: string, hashtags: string[] = []): string {
  // Try the name first, fall back to first hashtag
  const candidates = [name, ...hashtags]
  for (const raw of candidates) {
    const key = normalizeTopic(raw)
    if (key && key.length >= 4) {
      return SYNONYM_TABLE[key] ?? key
    }
  }
  return ''
}

function normalizeTopic(raw: string): string {
  // Lowercase, strip # @ and punctuation, strip years, strip stopwords
  const cleaned = raw
    .toLowerCase()
    .replace(/^[#@]/, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return ''

  // Pick the longest non-stopword token, or join all if short.
  const tokens = cleaned.split(' ').filter((t) => t.length >= 3 && !STOPWORDS.has(t))
  if (tokens.length === 0) return cleaned.replace(/\s/g, '')
  // For multi-word names, pick the longest token as the topic key
  tokens.sort((a, b) => b.length - a.length)
  return tokens[0]
}
