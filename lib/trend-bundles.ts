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
 * Words that are too generic to anchor a bundle on. If "aesthetic" or
 * "challenge" is the only key we'd extract, we should leave the trend
 * UNBUNDLED rather than over-merging different topics that happen to
 * share a category word.
 */
const GENERIC_CATEGORY_WORDS = new Set([
  'aesthetic', 'aesthetics', 'challenge', 'challenges', 'trend', 'trends',
  'movement', 'movements', 'dance', 'dances', 'format', 'formats',
  'content', 'culture', 'cultures', 'beauty', 'fashion', 'food', 'foods',
  'lifestyle', 'tech', 'sound', 'sounds', 'music', 'song', 'songs',
  'meme', 'memes', 'video', 'videos', 'reel', 'reels', 'recipe', 'recipes',
  'hack', 'hacks', 'tutorial', 'tutorials', 'review', 'reviews',
  'launch', 'launches', 'release', 'releases', 'drop', 'drops',
  'remix', 'remixes', 'cover', 'covers', 'edit', 'edits', 'montage',
  'tiktok', 'instagram', 'reddit', 'youtube', 'pinterest',
  'platform', 'platforms', 'feed', 'feeds', 'post', 'posts',
  'discourse', 'critique', 'debate', 'discussion',
  'celebrity', 'creator', 'creators', 'influencer', 'influencers',
  'national', 'international', 'world', 'global', 'european',
  'controversy', 'scandal', 'drama', 'criticism',
  'expansion', 'growth', 'rise', 'fall', 'decline', 'surge', 'boom',
  'anticipation', 'reflection', 'reflections', 'resurgence', 'revival',
  'adoption', 'adoption', 'integration', 'innovation',
  'natural', 'organic', 'artificial', 'digital', 'online',
  'everything', 'something', 'anyone', 'someone', 'people',
  'novelty', 'mashup', 'fusion', 'hybrid',
  'mopping', 'cleaning', 'cooking', 'baking', 'making',
  'proactive', 'reactive', 'satisfying',
  'football', 'soccer', 'basketball', 'tennis',
  'japanese', 'italian', 'french', 'german', 'dutch', 'spanish',
  'rejection', 'relegation', 'performance',
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

  // Candidate tokens: 3+ chars, not stopwords.
  const rawTokens = cleaned.split(' ').filter((t) => t.length >= 3 && !STOPWORDS.has(t))
  if (rawTokens.length === 0) {
    // Single-word hashtag like "#worldcup" — return as-is for bundling.
    const compact = cleaned.replace(/\s/g, '')
    return GENERIC_CATEGORY_WORDS.has(compact) ? '' : compact
  }

  // Prefer tokens that are NOT generic category words. If we only have
  // generic ones (e.g. "Aesthetic Trends"), return '' so the trend stays
  // unbundled rather than merging unrelated topics.
  const specific = rawTokens.filter((t) => !GENERIC_CATEGORY_WORDS.has(t))
  const pool = specific.length > 0 ? specific : []

  if (pool.length === 0) return ''

  // For multi-word names, pick the longest specific token as the topic key.
  pool.sort((a, b) => b.length - a.length)
  return pool[0]
}
