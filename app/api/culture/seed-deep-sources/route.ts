/**
 * POST /api/culture/seed-deep-sources
 *
 * Deep discovery sources for Culture Radar v2:
 *
 *   - 20+ subculture-specific Perplexity queries (cottagecore, dark
 *     academia, mob wife, coquette, italian brainrot, gen alpha,
 *     dimes square, that girl, tradwife, etc).
 *   - 12 niche subreddit Firecrawl sources (r/cottagecore,
 *     r/DarkAcademia, r/coquette, r/MobWives, r/Y2Kaesthetic,
 *     r/Weirdcore, r/BookTok, r/internetfuneral, etc).
 *   - 3 KnowYourMeme entry points (new entries, deadpool, popular).
 *   - 4 culture newsletter archives (Garbage Day, Dirt, Embedded, After School).
 *
 * Idempotent via url UNIQUE. Run once after deploy.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'

interface Src {
  name: string
  url: string
  category: string
  sourceType: 'perplexity_query' | 'blog' | 'reddit' | 'aggregator'
  reliability: number
  detectionLagDays: number
  notes?: string
}

const PERPLEXITY_SUBCULTURES: Array<{ slug: string; name: string; prompt: string; category: string }> = [
  {
    slug: 'cottagecore',
    name: 'Cottagecore',
    category: 'lifestyle',
    prompt: `What's new in the cottagecore aesthetic on TikTok/Instagram this week? List specific creators, viral cottagecore videos, new sub-trends within the movement (e.g. "fairycore", "goblincore", "grandparentcore"). Include creator @handles and view counts where you can. Last 7-14 days only.`,
  },
  {
    slug: 'dark-academia',
    name: 'Dark Academia',
    category: 'lifestyle',
    prompt: `What dark academia content is trending on TikTok this week? Specific creators, viral edits, new books being recommended in the niche, library/aesthetic videos. Donna Tartt energy. Last 7-14 days. Give @handles + view counts.`,
  },
  {
    slug: 'mob-wife',
    name: 'Mob Wife Aesthetic',
    category: 'fashion',
    prompt: `What mob wife aesthetic content is going viral on TikTok this week? Fur coats, gold jewelry, leopard print, Italian American aesthetic. Specific creators, new spin-offs, what's evolving in the niche. Last 7-14 days. Include creator @handles and example videos.`,
  },
  {
    slug: 'coquette',
    name: 'Coquette',
    category: 'fashion',
    prompt: `What coquette aesthetic trends are blowing up on TikTok this week? Pink bows, ribbons, Lana Del Rey core, hyper-feminine looks. Specific creators with @handles, viral coquette videos, sub-niches emerging within coquette. Last 7-14 days.`,
  },
  {
    slug: 'clean-girl',
    name: 'Clean Girl',
    category: 'beauty',
    prompt: `What's new in the "clean girl" aesthetic on TikTok this week? Slicked-back hair, gold hoops, glowy minimal makeup, the wellness/optimization angle. Specific creators, new sub-trends, product mentions. Last 7-14 days. Include @handles and view counts.`,
  },
  {
    slug: 'balletcore',
    name: 'Balletcore',
    category: 'fashion',
    prompt: `Balletcore TikTok trends this week — ballet flats, leg warmers, pink tights, soft tutus. Who are the creators driving this niche right now? What new spin-offs (e.g. balletmaxxing, dirty balletcore) are emerging? Last 7-14 days. @handles.`,
  },
  {
    slug: 'gorpcore',
    name: 'Gorpcore',
    category: 'fashion',
    prompt: `Gorpcore content trending on TikTok and Instagram this week — Patagonia, Arc'teryx, Salomon, technical outdoor wear as fashion. Specific creators, viral fits, sub-trends. Last 7-14 days. Include @handles.`,
  },
  {
    slug: 'weirdcore',
    name: 'Weirdcore',
    category: 'meme',
    prompt: `Weirdcore / liminal spaces / dreamcore content trending on TikTok this week. Surreal unsettling imagery, backrooms-style edits, "you were never here" energy. Specific creators (@handles) and new sub-niches emerging. Last 7-14 days.`,
  },
  {
    slug: 'y2k-revival',
    name: 'Y2K Revival',
    category: 'fashion',
    prompt: `Y2K revival content on TikTok this week — low-rise jeans, butterfly clips, frosted everything, early 2000s nostalgia. Specific creators driving it, viral Y2K fit checks, new sub-trends. Last 7-14 days. @handles + view counts.`,
  },
  {
    slug: 'alt-fashion',
    name: 'Alt Fashion / E-girl / Scene',
    category: 'fashion',
    prompt: `Alt fashion content on TikTok this week — e-girl, scene revival, alt hair colors, chains, emo nostalgia. Specific creators (@handles), viral fits, what new alt sub-trends are emerging. Last 7-14 days.`,
  },
  {
    slug: 'ohio-culture',
    name: 'Ohio / Skibidi / Gen Alpha',
    category: 'meme',
    prompt: `What's new in "ohio" / skibidi / gen alpha brainrot on TikTok this week? Specific new memes, character variations, viral edits. Include @handles of creators, view counts. Last 7-14 days only — not the old viral originals.`,
  },
  {
    slug: 'foodtok-niche',
    name: 'FoodTok niche trends',
    category: 'food',
    prompt: `What hyper-specific FoodTok niches are blowing up this week? Not generic recipes — specific obsessions like "girl dinner", "stanley cup cocktails", "pickle everything", "cottage cheese ice cream", "fruit fishing". Last 7-14 days. @handles + view counts. Focus on Europe-relevant food trends.`,
  },
  {
    slug: 'beautytok-niche',
    name: 'BeautyTok niches',
    category: 'beauty',
    prompt: `Niche BeautyTok trends this week — not mainstream products. I want things like "blueberry milk nails", "doll lashes", "cherry mocha lip combo", "blush draping", specific micro-trends. Last 7-14 days. Specific creators with @handles + example videos.`,
  },
  {
    slug: 'hometok-niche',
    name: 'HomeTok niches',
    category: 'home',
    prompt: `What hyper-specific HomeTok / cleantok niches are trending this week? Mopping techniques, organizing methods, niche home decor, "shower routine", "house ick", specific cleaning hacks. Last 7-14 days. @handles + view counts. Focus on EU markets.`,
  },
  {
    slug: 'booktok',
    name: 'BookTok',
    category: 'lifestyle',
    prompt: `What's trending on BookTok this week? Specific books going viral, new sub-genres (e.g. "romantasy", "dark romance", "spice levels"), creator @handles, view counts. Last 7-14 days. Include any cross-pollination with fictok / fairy smut / dark academia.`,
  },
  {
    slug: 'fittok-niche',
    name: 'FitTok / wellness niches',
    category: 'lifestyle',
    prompt: `What FitTok / wellness micro-trends are blowing up this week? Specific things like "75 hard", "12-3-30", "cozy cardio", "pilates princess", "mewing", "lookmaxxing", "sleepmaxxing", "vagus nerve" content. Last 7-14 days. @handles + example videos.`,
  },
  {
    slug: 'tradwife-discourse',
    name: 'Tradwife discourse',
    category: 'culture',
    prompt: `What tradwife content / discourse is going viral this week? Both the creators themselves (Nara Smith, Ballerina Farm) AND the critique/commentary. Specific creators and the videos getting the most engagement. Last 7-14 days. @handles + view counts.`,
  },
  {
    slug: 'that-girl',
    name: 'That Girl / 5am routine',
    category: 'lifestyle',
    prompt: `"That girl" content trending this week — 5am routines, matcha, journaling, optimization aesthetic. Specific creators, viral routines, new sub-trends within the niche. Last 7-14 days. @handles + view counts.`,
  },
  {
    slug: 'gen-alpha-slang',
    name: 'Gen Alpha slang + AI weirdcore',
    category: 'meme',
    prompt: `What new Gen Alpha slang or AI-generated weirdcore content is going viral this week on TikTok? Beyond skibidi/ohio/rizz — what NEW terms or visual styles are emerging? Last 7-14 days. Include example videos with @handles.`,
  },
  {
    slug: 'dimes-square',
    name: 'Dimes Square / NYC post-irony',
    category: 'culture',
    prompt: `What's happening in the Dimes Square / NYC downtown post-irony scene this week? Specific events, creators, podcasts, substack pieces, fashion moments. Honor Levy, Dasha Nekrasova, Red Scare orbit. Last 7-14 days. Include @handles and URLs.`,
  },
  {
    slug: 'kpop-fandom',
    name: 'K-Pop fandom moments',
    category: 'culture',
    prompt: `K-pop fandom culture moments going viral on TikTok this week — fancams, group drama, comebacks, dance challenges. Specific groups, viral fan edits, what's spreading beyond core stan culture. Last 7-14 days. @handles + view counts.`,
  },
  {
    slug: 'anime-otaku',
    name: 'Anime / otaku culture',
    category: 'culture',
    prompt: `Anime culture moments going viral on TikTok this week — specific shows trending, "weeb" humor formats, cosplay moments, anime-to-fashion crossovers. Last 7-14 days. Include @handles, shows, and example videos.`,
  },
]

const REDDIT_NICHE: Array<{ slug: string; sub: string; category: string }> = [
  { slug: 'r-cottagecore',     sub: 'cottagecore',     category: 'lifestyle' },
  { slug: 'r-darkacademia',    sub: 'DarkAcademia',    category: 'lifestyle' },
  { slug: 'r-coquette',        sub: 'coquette',        category: 'fashion'   },
  { slug: 'r-mobwivesaesthetic', sub: 'mobwivesaesthetic', category: 'fashion' },
  { slug: 'r-y2kaesthetic',    sub: 'Y2Kaesthetic',    category: 'fashion'   },
  { slug: 'r-weirdcore',       sub: 'Weirdcore',       category: 'meme'      },
  { slug: 'r-internetfuneral', sub: 'internetfuneral', category: 'meme'      },
  { slug: 'r-booktok',         sub: 'BookTok',         category: 'lifestyle' },
  { slug: 'r-okbuddyretard',   sub: 'okbuddyretard',   category: 'meme'      },
  { slug: 'r-surrealmemes',    sub: 'surrealmemes',    category: 'meme'      },
  { slug: 'r-fashionreps',     sub: 'fashionreps',     category: 'fashion'   },
  { slug: 'r-trashtaste',      sub: 'TrashTaste',      category: 'culture'   },
]

const AGGREGATORS: Src[] = [
  {
    name: 'KnowYourMeme · New Entries',
    url: 'https://knowyourmeme.com/memes/recent',
    category: 'meme',
    sourceType: 'aggregator',
    reliability: 7,
    detectionLagDays: 3,
    notes: 'KnowYourMeme recent entries — meme catalog with provenance.',
  },
  {
    name: 'KnowYourMeme · Popular',
    url: 'https://knowyourmeme.com/memes/popular',
    category: 'meme',
    sourceType: 'aggregator',
    reliability: 7,
    detectionLagDays: 5,
    notes: 'Top recent memes by views.',
  },
  {
    name: 'KnowYourMeme · Deadpool (declining)',
    url: 'https://knowyourmeme.com/memes/categories/deadpool',
    category: 'meme',
    sourceType: 'aggregator',
    reliability: 6,
    detectionLagDays: 7,
    notes: 'Memes flagged as fading — useful negative signal.',
  },
  {
    name: 'Garbage Day · Latest',
    url: 'https://www.garbageday.email/archive',
    category: 'culture',
    sourceType: 'blog',
    reliability: 8,
    detectionLagDays: 2,
    notes: 'Ryan Broderick newsletter — best internet culture analysis.',
  },
  {
    name: 'Dirt · Latest',
    url: 'https://dirt.fyi',
    category: 'culture',
    sourceType: 'blog',
    reliability: 7,
    detectionLagDays: 5,
    notes: 'Internet culture daily — entertainment + tech zeitgeist.',
  },
  {
    name: 'Embedded by Kate Lindsay · Archive',
    url: 'https://embedded.substack.com/archive',
    category: 'culture',
    sourceType: 'blog',
    reliability: 7,
    detectionLagDays: 3,
    notes: 'Newsletter about being on the internet.',
  },
  {
    name: 'After School by Casey Lewis · Archive',
    url: 'https://afterschool.substack.com/archive',
    category: 'culture',
    sourceType: 'blog',
    reliability: 8,
    detectionLagDays: 2,
    notes: 'Daily Gen Z + Gen Alpha trend tracking. Goldmine.',
  },
]

export async function POST(_req: NextRequest) {
  const all: Src[] = [
    ...PERPLEXITY_SUBCULTURES.map((p) => ({
      name: `Perplexity · ${p.name}`,
      url: `internal://perplexity/${p.slug}`,
      category: p.category,
      sourceType: 'perplexity_query' as const,
      reliability: 6,
      detectionLagDays: 2,
      notes: p.prompt,
    })),
    ...REDDIT_NICHE.map((r) => ({
      name: `Reddit · r/${r.sub}`,
      url: `https://www.reddit.com/r/${r.sub}/top/?t=week`,
      category: r.category,
      sourceType: 'reddit' as const,
      reliability: 6,
      detectionLagDays: 3,
      notes: `Top of the week from r/${r.sub}. Niche subculture community.`,
    })),
    ...AGGREGATORS,
  ]

  let inserted = 0
  let updated = 0
  for (const s of all) {
    const rows = await sql().query(
      `INSERT INTO culture_sources
          (name, url, category, source_type, reliability, detection_lag_days, active, notes)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)
       ON CONFLICT (url) DO UPDATE SET
         name = EXCLUDED.name,
         notes = EXCLUDED.notes,
         active = true
       RETURNING (xmax = 0) AS inserted`,
      [s.name, s.url, s.category, s.sourceType, s.reliability, s.detectionLagDays, s.notes ?? null],
    ) as Array<{ inserted: boolean }>
    if (rows[0]?.inserted) inserted++
    else updated++
  }

  return NextResponse.json({
    ok: true,
    total: all.length,
    inserted,
    updated,
    breakdown: {
      perplexitySubcultures: PERPLEXITY_SUBCULTURES.length,
      redditNiche: REDDIT_NICHE.length,
      aggregators: AGGREGATORS.length,
    },
    message: 'Deep discovery sources seeded. Next daily cron will scrape them.',
  })
}
