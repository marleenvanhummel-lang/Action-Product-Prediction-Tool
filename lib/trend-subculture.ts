/**
 * Subculture taxonomy classifier.
 *
 * Maps each trend to the subculture / community / niche where it ORIGINATED
 * or lives most strongly. Different from `vibe` (broad emotional register)
 * and `category` (food/beauty/tech/etc).
 *
 * Subculture answers: "which corner of the internet is this from?"
 *
 * Taxonomy is opinionated — 30 specific subcultures covering the major
 * 2025-26 culture vectors. Trends that don't fit any → null.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { CULTURE_GEMINI_MODEL } from '@/lib/constants'
import { extractJson } from '@/lib/culture-radar'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? '')

/**
 * Full subculture taxonomy. Edit this list to expand/refine.
 *
 * Loosely grouped:
 *   Aesthetic visual identities: cottagecore, dark_academia, clean_girl,
 *     mob_wife, coquette, balletcore, weirdcore, dreamcore, kidcore,
 *     y2k, alt_fashion, grunge_revival, normcore, gorpcore
 *   Internet humor / chaos: italian_brainrot, gen_alpha_brainrot,
 *     weirdcore_humor, ironic_seriousness, ohio_culture
 *   Communities: stan_culture, kpop_fandom, anime_otaku, gaming_fandom,
 *     bookstagram, foodtok, fittok, beautytok, hometok, traveltok
 *   Counter-culture: tradwife, anti_woke, lookmax, dimes_square,
 *     vibe_shift_right, alt_right_adjacent (track but flag)
 *   Wellness: clean_girl, that_girl, gut_health, vagus, sleep_maxxing
 *   Music scenes: hyperpop, indie_sleaze_revival, sad_girl,
 *     country_pop, regional_mexican
 */
export const SUBCULTURES = [
  // Aesthetic / visual identity
  'cottagecore',
  'dark_academia',
  'clean_girl',
  'mob_wife',
  'coquette',
  'balletcore',
  'weirdcore',
  'kidcore',
  'y2k',
  'alt_fashion',
  'gorpcore',
  // Internet chaos
  'italian_brainrot',
  'gen_alpha_brainrot',
  'ohio_culture',
  'ironic_seriousness',
  // Communities (-tok verticals)
  'foodtok',
  'beautytok',
  'fittok',
  'hometok',
  'booktok',
  'traveltok',
  'gaming_fandom',
  'kpop_fandom',
  'anime_otaku',
  'stan_culture',
  // Counter / wellness / lifestyle
  'tradwife',
  'that_girl',
  'sleepmaxxing',
  'lookmax',
  'dimes_square',
  // Music
  'hyperpop',
  'indie_sleaze_revival',
  'sad_girl_pop',
] as const

export type Subculture = typeof SUBCULTURES[number]

export const SUBCULTURE_LABELS: Record<Subculture, string> = {
  cottagecore: 'Cottagecore',
  dark_academia: 'Dark Academia',
  clean_girl: 'Clean Girl',
  mob_wife: 'Mob Wife',
  coquette: 'Coquette',
  balletcore: 'Balletcore',
  weirdcore: 'Weirdcore',
  kidcore: 'Kidcore',
  y2k: 'Y2K',
  alt_fashion: 'Alt Fashion',
  gorpcore: 'Gorpcore',
  italian_brainrot: 'Italian Brainrot',
  gen_alpha_brainrot: 'Gen Alpha Brainrot',
  ohio_culture: 'Ohio Culture',
  ironic_seriousness: 'Ironic Seriousness',
  foodtok: 'FoodTok',
  beautytok: 'BeautyTok',
  fittok: 'FitTok',
  hometok: 'HomeTok',
  booktok: 'BookTok',
  traveltok: 'TravelTok',
  gaming_fandom: 'Gaming Fandom',
  kpop_fandom: 'K-Pop Fandom',
  anime_otaku: 'Anime Otaku',
  stan_culture: 'Stan Culture',
  tradwife: 'Tradwife',
  that_girl: 'That Girl',
  sleepmaxxing: 'Sleepmaxxing',
  lookmax: 'Lookmaxxing',
  dimes_square: 'Dimes Square',
  hyperpop: 'Hyperpop',
  indie_sleaze_revival: 'Indie Sleaze',
  sad_girl_pop: 'Sad Girl Pop',
}

export interface SubcultureInferInput {
  id: string
  name: string
  description: string
  category: string
  hashtags: string[]
}

export interface SubcultureInferResult {
  id: string
  subculture: Subculture | null
}

export async function inferSubcultures(
  trends: SubcultureInferInput[],
): Promise<SubcultureInferResult[]> {
  if (trends.length === 0) return []

  const prompt = buildPrompt(trends)
  const model = genAI.getGenerativeModel({
    model: CULTURE_GEMINI_MODEL,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  })

  const result = await model.generateContent(prompt)
  const text = result.response.text()
  const parsed = extractJson<{ results?: unknown }>(text)
  const rawResults = Array.isArray(parsed?.results) ? parsed.results : []

  const validSet = new Set<string>(SUBCULTURES)
  const byId = new Map<string, SubcultureInferResult>()
  for (const raw of rawResults) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id : null
    if (!id) continue
    const subRaw = typeof r.subculture === 'string' ? r.subculture.toLowerCase().replace(/-/g, '_') : null
    const subculture = subRaw && validSet.has(subRaw) ? (subRaw as Subculture) : null
    byId.set(id, { id, subculture })
  }

  return trends.map((t) => byId.get(t.id) ?? { id: t.id, subculture: null })
}

function buildPrompt(trends: SubcultureInferInput[]): string {
  const list = trends
    .map((t, i) =>
      `${i + 1}. ID: ${t.id}
   NAME: ${t.name}
   CATEGORY: ${t.category}
   DESCRIPTION: ${t.description.slice(0, 280)}
   ${t.hashtags.length > 0 ? `HASHTAGS: ${t.hashtags.slice(0, 6).join(' ')}` : ''}`,
    )
    .join('\n\n')

  return `For each trend below, identify the SUBCULTURE / NICHE / COMMUNITY it lives in.

Pick exactly ONE from this fixed list (or null if none fit):

VISUAL AESTHETICS:
- cottagecore        rural-romance, soft pastoral, baking, flowers, sweaters
- dark_academia      tweed, libraries, gothic literature, Donna Tartt energy
- clean_girl         slicked hair, gold hoops, glowy minimal makeup, that_girl-adjacent
- mob_wife           heavy gold, fur, leopard print, anti-clean-girl
- coquette           pink bows, ribbons, lana del rey, hyper-feminine
- balletcore         ballet flats, leg warmers, pink tights, soft tutus
- weirdcore          liminal spaces, dreamlike unsettling imagery, surreal
- kidcore            bright primary colors, toys, 90s child energy
- y2k                low-rise, butterfly clips, frosted, early 2000s
- alt_fashion        emo, scene, e-girl, alt hair colors, chains
- gorpcore           technical outdoor wear (Patagonia, Salomon, Arc'teryx)

INTERNET CHAOS:
- italian_brainrot   tralalero tralala, ballerina cappuccina, AI italian voiceovers
- gen_alpha_brainrot skibidi, ohio, gyatt, fanum tax, rizz, delulu, sigma
- ohio_culture       specifically the "in ohio" meme universe
- ironic_seriousness mock-deep, fake-philosophical shitposts

TOK VERTICALS (large communities on TikTok):
- foodtok            recipes, cooking, food reviews
- beautytok          makeup tutorials, skincare, beauty hacks
- fittok             workout, gym, fitness
- hometok            home decor, cleaning, organizing
- booktok            book reviews, reading vlogs, fictok
- traveltok          travel content, destinations
- gaming_fandom      gaming culture, streamers
- kpop_fandom        K-pop stans, fancams
- anime_otaku        anime culture, weeb humor
- stan_culture       celebrity stan accounts

COUNTER / LIFESTYLE:
- tradwife           traditional housewife aesthetic, anti-feminist undertones
- that_girl          5am wakeups, matcha, journaling, optimization
- sleepmaxxing       biohacking sleep, mouth tape, magnesium
- lookmax            (mostly male) facial optimization, jaw, mewing
- dimes_square       NYC downtown post-irony scene, contrarian

MUSIC SCENES:
- hyperpop           glitchy, pitched-up, charli xcx adjacent
- indie_sleaze_revival 2010s indie revival, blog rock, scenestercore
- sad_girl_pop       lana del rey, billie eilish, melancholy female vocal

Rules:
- A trend can have ONLY ONE subculture. Pick the strongest fit.
- If the trend is a tradwife critique, classify as "tradwife" (the subculture, not the stance).
- "Italian Brainrot characters" → italian_brainrot. "Skibidi toilet variations" → gen_alpha_brainrot.
- Specific product launches without subculture vibe → null.
- General news / sports / informational → null.
- Generic "aesthetic baking" without cottagecore signals → null (only tag if cottagecore-coded).
- A clean girl morning routine → that_girl OR clean_girl (pick the closer one).

Trends to classify:

${list}

Return JSON:
{
  "results": [
    { "id": "<trend id>", "subculture": "<one of the values above or null>" }
  ]
}
`
}
