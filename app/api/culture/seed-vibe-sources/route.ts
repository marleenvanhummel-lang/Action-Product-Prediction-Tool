/**
 * POST /api/culture/seed-vibe-sources
 *
 * One-shot endpoint to idempotently insert Perplexity discovery sources
 * targeted at unhinged / brainrot content. Lets the daily cron go
 * hunting for chaotic absurd internet culture, not just mainstream trends.
 *
 * Run once after deploy. Subsequent calls are no-ops (uses slug uniqueness).
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'

interface VibeSource {
  name: string
  slug: string
  category: string         // CultureCategory
  url: string              // the actual Perplexity prompt
  reliability: number
}

const SOURCES: VibeSource[] = [
  {
    name: 'Perplexity · Italian Brainrot Hunt',
    slug: 'pplx-italian-brainrot',
    category: 'meme',
    reliability: 6,
    url: `What chaotic absurd "Italian brainrot" content is trending on TikTok this week? List the specific characters, sounds, and remixes that are spreading right now. Examples of the genre: Tralalero Tralala, Ballerina Cappuccina, Bombardiro Crocodilo, Lirili Larila, Brr Brr Patapim, Tung Tung Tung Sahur. I want NEW entries from the last 7-14 days, not old viral ones. Include the original TikTok creator handle (@username), approximate view counts, and any cross-platform spread (Reels/Shorts). Format each as a discrete trend: name, what it is, who started it, why it's spreading.`,
  },
  {
    name: 'Perplexity · Gen Alpha Brainrot Slop',
    slug: 'pplx-gen-alpha-brainrot',
    category: 'meme',
    reliability: 6,
    url: `What Gen Alpha / brainrot slang or formats are blowing up on TikTok this week? Things like skibidi, ohio, sigma, gyatt, fanum tax, rizz, delulu, but I want what's CURRENT now in the last 7-14 days, not the originals. Also surface absurd AI-generated weird music videos, AI fever dream edits, weirdcore, and any new chaotic format Gen Alpha is using. For each entry give: the term/format, what it means, example TikTok URL with creator handle, why it caught on.`,
  },
  {
    name: 'Perplexity · Unhinged TikTok Formats',
    slug: 'pplx-unhinged-tiktok-formats',
    category: 'format',
    reliability: 6,
    url: `What "unhinged" TikTok video formats are trending right now this week? I mean formats where the creator deliberately does something chaotic, absurd, low-fi, or no-filter — fake rage bait, mock screaming, surreal stitches, weird POV jumps, deliberately bad green-screens, shitposts, fake outrage, ironic seriousness, anti-aesthetic content. NOT polished aesthetic videos. NOT informational. Examples of the genre: "I'm a delulu", LookMax, mock-yelling-at-camera, the "stop reading" overlay format, deranged commentary edits. Give specific examples from the last 14 days with creator handles and example URLs. Focus on Europe-relevant content for Action's markets (NL, BE, FR, DE, IT, ES, PL, CZ, AT, CH, HU, RO, SK, PT).`,
  },
  {
    name: 'Perplexity · Reddit Surreal / Brainrot Subs',
    slug: 'pplx-reddit-brainrot-subs',
    category: 'meme',
    reliability: 6,
    url: `What's currently trending on Reddit's absurd/surreal/chaotic subreddits this week? Specifically r/okbuddyretard, r/surrealmemes, r/perfectlycutscreams, r/oddlyterrifying, r/PeopleFuckingDying, r/comedyhomicide, r/196, r/CursedComments. Give the top 5-8 posts from the last 7 days that capture the "unhinged internet" zeitgeist. For each: post title, subreddit, what makes it spread, link to post if you have it. Look for patterns that could become broader formats.`,
  },
]

export async function POST(_req: NextRequest) {
  const results: Array<{ slug: string; inserted: boolean }> = []

  for (const s of SOURCES) {
    const inserted = await sql().query(
      `INSERT INTO culture_sources
          (name, slug, category, url, source_type, reliability, detection_lag_days, active)
       VALUES ($1, $2, $3, $4, 'perplexity_query', $5, 1, true)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         url = EXCLUDED.url,
         active = true,
         updated_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [s.name, s.slug, s.category, s.url, s.reliability],
    ) as Array<{ inserted: boolean }>

    results.push({ slug: s.slug, inserted: inserted[0]?.inserted ?? false })
  }

  return NextResponse.json({
    ok: true,
    sources: results,
    message: 'Vibe-targeted Perplexity sources seeded. Next daily cron will scrape them.',
  })
}
