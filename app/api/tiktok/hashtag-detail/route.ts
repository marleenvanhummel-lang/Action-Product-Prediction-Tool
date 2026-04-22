import { NextResponse } from 'next/server'
import youtubeDl from 'youtube-dl-exec'
import {
  CC_BASE,
  launchBrowser,
  newNLContext,
  sleep,
} from '@/lib/tiktok-scraper'

export const runtime = 'nodejs'
export const maxDuration = 300

const COUNTRY = 'NL'
const PERIOD = 7

export async function POST(req: Request) {
  const { hashtag } = await req.json().catch(() => ({}))
  if (!hashtag || typeof hashtag !== 'string') {
    return NextResponse.json({ error: 'hashtag required' }, { status: 400 })
  }

  console.log(`[hashtag-detail] START hashtag=${hashtag}`)

  const browser = await launchBrowser()
  const detail: any = {}
  let ccVideos: any[] = []

  try {
    const context = await newNLContext(browser)
    const page = await context.newPage()

    // Accumulate XHR video batches
    const videoHandler = async (r: any) => {
      if (!r.url().includes('hashtag/video') || r.status() !== 200) return
      try {
        const j = await r.json()
        if (j?.code === 0 && j?.data?.list?.length) {
          ccVideos.push(...j.data.list)
          console.log(`[hashtag-detail] video batch: +${j.data.list.length} (total ${ccVideos.length})`)
        }
      } catch {}
    }
    page.on('response', videoHandler)

    await page
      .goto(
        `${CC_BASE}/hashtag/${encodeURIComponent(hashtag)}/pc/en?countryCode=${COUNTRY}&period=${PERIOD}`,
        { waitUntil: 'domcontentloaded', timeout: 60_000 },
      )
      .catch((e) => console.log(`[hashtag-detail] goto error: ${e.message}`))

    await sleep(2000)

    // Extract SSR __NEXT_DATA__
    const d = await page
      .evaluate(() => {
        try {
          const el = document.getElementById('__NEXT_DATA__')
          if (el) return JSON.parse(el.textContent || '{}')?.props?.pageProps?.data || null
        } catch {}
        return null
      })
      .catch(() => null)

    if (d) {
      detail.info = {
        hashtagId: d.hashtagId,
        hashtagName: d.hashtagName,
        publishCnt: d.publishCnt,
        videoViews: d.videoViews,
        publishCntAll: d.publishCntAll,
        videoViewsAll: d.videoViewsAll,
        trend: d.trend || [],
        longevity: d.longevity || {},
        isPromoted: d.isPromoted || false,
        countryInfo: d.countryInfo || {},
      }
      detail.relatedHashtags = (d.relatedHashtags || []).map((r: any) => ({
        label: r.hashtagName || r.hashtag_name || r.name || r.label || String(r),
        publishCnt: r.publishCnt ?? r.publish_cnt ?? r.postCnt ?? r.cnt ?? null,
      }))
      detail.audienceAges = normalizeAudience(d.audienceAges || [])
      detail.audienceInterests = normalizeAudience(d.audienceInterests || [])
      detail.audienceCountries = normalizeAudience(d.audienceCountries || [])

      // Debug logs to discover raw shapes on first run
      console.log('[hashtag-detail] SSR keys:', Object.keys(d).join(','))
      if ((d.audienceAges || [])[0])
        console.log('[hashtag-detail] age RAW:', JSON.stringify((d.audienceAges || [])[0]))
      if ((d.audienceInterests || [])[0])
        console.log('[hashtag-detail] interest RAW:', JSON.stringify((d.audienceInterests || [])[0]))
      if ((d.audienceCountries || [])[0])
        console.log('[hashtag-detail] country RAW:', JSON.stringify((d.audienceCountries || [])[0]))
      if ((d.relatedHashtags || [])[0])
        console.log('[hashtag-detail] related RAW:', JSON.stringify((d.relatedHashtags || [])[0]))
      if (ccVideos[0])
        console.log('[hashtag-detail] video RAW:', JSON.stringify(ccVideos[0]).slice(0, 500))

      if (d.relatedItems?.length) {
        ccVideos = d.relatedItems.map((v: any) => ({
          ...v,
          url: `https://www.tiktok.com/embed/v2/${v.itemId}`,
        }))
      }
    }

    // Scroll to trigger video carousel + paginate via right-arrow clicks
    await page.evaluate(() => window.scrollTo(0, 500)).catch(() => {})
    await sleep(1500)

    for (let p = 0; p < 8; p++) {
      const clicked = await page
        .evaluate(() => {
          const arrows = [...document.querySelectorAll("button, [role='button']")].filter(
            (el) => el.querySelector('svg') || /next|right|arrow/i.test((el as HTMLElement).className),
          )
          const rightArrow = arrows.find((el) => {
            const rect = el.getBoundingClientRect()
            return (
              rect.right > window.innerWidth * 0.7 &&
              rect.top > 100 &&
              rect.top < window.innerHeight * 0.8
            )
          }) as HTMLElement | undefined
          if (rightArrow) {
            rightArrow.click()
            return true
          }
          return false
        })
        .catch(() => false)
      if (!clicked) break
      await sleep(1500)
    }

    page.off('response', videoHandler)
    await page.close().catch(() => {})
    await context.close().catch(() => {})
  } finally {
    await browser.close().catch(() => {})
  }

  // Dedupe videos by itemId
  const seen = new Set<string>()
  const uniqueVideos = ccVideos.filter((v) => {
    const id = String(v.itemId || v.id || '')
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })

  console.log(`[hashtag-detail] unique videos to enrich: ${uniqueVideos.length}`)

  // Enrich videos via yt-dlp (in batches to avoid overload)
  const enriched = await enrichVideos(uniqueVideos)

  return NextResponse.json({
    success: true,
    hashtag,
    info: detail.info || null,
    relatedHashtags: detail.relatedHashtags || [],
    audienceAges: detail.audienceAges || [],
    audienceInterests: detail.audienceInterests || [],
    audienceCountries: detail.audienceCountries || [],
    videoCount: enriched.length,
    enrichedCount: enriched.filter((v: any) => v.metaFetched).length,
    videos: enriched,
  })
}

function normalizeAudience(items: any[]): { label: string; value: number }[] {
  return items
    .map((it: any) => {
      const label =
        it.label ||
        it.name ||
        it.age ||
        it.interest ||
        it.country ||
        it.countryName ||
        it.country_name ||
        it.code ||
        it.key ||
        ''
      const rawValue =
        it.value ??
        it.percent ??
        it.percentage ??
        it.ratio ??
        it.score ??
        it.weight ??
        it.count ??
        it.cnt ??
        0
      // If value is > 1, assume it's a percentage (e.g. 35 → 0.35)
      const value = rawValue > 1 ? rawValue / 100 : rawValue
      return { label: String(label), value: Number(value) || 0 }
    })
    .filter((it) => it.label)
}

async function enrichVideos(videos: any[]): Promise<any[]> {
  const BATCH = 5
  const out: any[] = []
  for (let i = 0; i < videos.length; i += BATCH) {
    const results = await Promise.all(
      videos.slice(i, i + BATCH).map(async (v) => {
        let url =
          v.item_url ||
          v.video_url ||
          (v.url && !v.url.includes('embed') ? v.url : null)

        if (!url && v.itemId) {
          try {
            const oe = await fetch(
              `https://www.tiktok.com/oembed?url=https://www.tiktok.com/video/${v.itemId}`,
            )
            if (oe.ok) {
              const j = (await oe.json()) as any
              if (j.author_url) url = `${j.author_url}/video/${v.itemId}`
            }
          } catch {}
        }
        // Always ensure thumbnail fallback from SSR fields
        const fallbackThumb = v.coverUri || v.cover || v.thumbnail || ''
        if (!url) return { ...v, thumbnail: fallbackThumb }

        try {
          const info: any = await youtubeDl(url, {
            dumpSingleJson: true,
            noWarnings: true,
            callHome: false,
            preferFreeFormats: true,
            skipDownload: true,
          })
          return {
            ...v,
            url: info.webpage_url || url,
            viewCount: info.view_count ?? null,
            likeCount: info.like_count ?? null,
            commentCount: info.comment_count ?? null,
            shareCount: info.share_count ?? null,
            bookmarkCount: info.bookmark_count ?? null,
            uploader: info.uploader || v.uploader || '',
            uploadDate: info.upload_date || '',
            description: info.description || '',
            track: info.track || '',
            artist: info.artist || '',
            thumbnail: info.thumbnail || fallbackThumb,
            metaFetched: true,
          }
        } catch (e: any) {
          console.warn(`[enrich] failed ${url}: ${e.message}`)
          return { ...v, thumbnail: fallbackThumb }
        }
      }),
    )
    out.push(...results)
    console.log(`[enrich] ${out.length}/${videos.length}`)
  }
  return out
}

