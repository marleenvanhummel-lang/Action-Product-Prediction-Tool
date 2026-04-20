import { NextResponse } from 'next/server'
import {
  CC_BASE,
  launchBrowser,
  newNLContext,
  waitAndCapture,
} from '@/lib/tiktok-scraper'

export const runtime = 'nodejs'
export const maxDuration = 300

const COUNTRY = 'NL'
const PERIOD = 7

export async function POST() {
  console.log(`[scrape-hashtags] START country=${COUNTRY} period=${PERIOD}`)

  let browser
  try {
    browser = await launchBrowser()
  } catch (e: any) {
    return NextResponse.json({ error: 'browser launch failed: ' + e.message }, { status: 500 })
  }

  try {
    const context = await newNLContext(browser)
    const page = await context.newPage()

    await page.route('**popular_trend/hashtag/list**', async (route) => {
      const u = new URL(route.request().url())
      u.searchParams.set('country_code', COUNTRY)
      u.searchParams.set('period', String(PERIOD))
      u.searchParams.set('limit', '50')
      u.searchParams.set('page', '1')
      u.searchParams.set('sort_by', 'popular')
      u.searchParams.delete('industry_id')
      await route.continue({ url: u.toString() })
    })

    const hashtagWait = waitAndCapture<any[]>(
      page,
      'popular_trend/hashtag/list',
      (d) => d.list || [],
      45_000,
    )

    await page
      .goto(
        `${CC_BASE}/inspiration/popular/hashtag/pc/en?countryCode=${COUNTRY}&period=${PERIOD}`,
        { waitUntil: 'domcontentloaded', timeout: 60_000 },
      )
      .catch(() => {})
    await page.evaluate(() => window.scrollTo(0, 600)).catch(() => {})

    const hashtags = (await hashtagWait) || []
    console.log(`[scrape-hashtags] captured ${hashtags.length} hashtags`)

    await page.close().catch(() => {})
    await context.close().catch(() => {})

    if (!hashtags.length) {
      return NextResponse.json({ error: 'No hashtags captured' }, { status: 502 })
    }

    const items = hashtags.map((h: any, i: number) => ({
      rank: h.rank ?? i + 1,
      hashtag_id: h.hashtag_id ?? h.id ?? null,
      hashtag_name: h.hashtag_name || h.name || '',
      publish_cnt: h.publish_cnt ?? null,
      video_views: h.video_views ?? null,
    }))

    return NextResponse.json({ success: true, count: items.length, hashtags: items })
  } finally {
    await browser.close().catch(() => {})
  }
}
