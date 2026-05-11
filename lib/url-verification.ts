/**
 * Video URL verification.
 *
 * Perplexity's sonar model occasionally fabricates plausible-looking
 * tiktok.com / instagram.com / youtube.com URLs when the actual examples
 * it cites aren't directly accessible. The fake URLs hit 404, or worse,
 * 200-redirect-to-homepage on TikTok, which a naive HEAD check would miss.
 *
 * This module:
 *   - Does a GET with redirect-follow and a tight timeout
 *   - Validates that the FINAL URL still looks like a video/post URL
 *     (so a TikTok URL redirected to /foryou is treated as 404)
 *   - Returns the subset of URLs that survive
 */

export interface VerifyResult {
  url: string
  ok: boolean
  reason?: string
}

const REAL_BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const DEFAULT_TIMEOUT_MS = 6000

export async function verifyVideoUrl(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<VerifyResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': REAL_BROWSER_UA,
        'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8',
      },
    })
    clearTimeout(timer)

    if (!res.ok) {
      return { url, ok: false, reason: `HTTP ${res.status}` }
    }

    const finalUrl = (res.url || url).toLowerCase()
    const lowerOrig = url.toLowerCase()

    // TikTok: a valid video URL preserves /video/ or /photo/ after redirect.
    // If TikTok bounced us to /foryou / /trending / /discover / their app
    // landing, the video doesn't exist.
    if (lowerOrig.includes('tiktok.com')) {
      if (!finalUrl.includes('/video/') && !finalUrl.includes('/photo/')) {
        return { url, ok: false, reason: 'tiktok_redirected_to_homepage' }
      }
      // TikTok video IDs are 19 digits. Check the URL has that pattern.
      const idMatch = lowerOrig.match(/\/video\/(\d+)/)
      if (idMatch && idMatch[1].length < 18) {
        return { url, ok: false, reason: 'tiktok_id_too_short' }
      }
    }

    // Instagram: valid post/reel URLs preserve /p/ or /reel(s)/ after redirect.
    if (lowerOrig.includes('instagram.com')) {
      if (!/\/(p|reel|reels|tv)\//.test(finalUrl)) {
        return { url, ok: false, reason: 'instagram_redirected' }
      }
    }

    // YouTube: short URLs (youtu.be/X) should preserve the ID. Watch URLs
    // shouldn't redirect to homepage.
    if (lowerOrig.includes('youtube.com') || lowerOrig.includes('youtu.be')) {
      if (finalUrl.endsWith('youtube.com/') || finalUrl.endsWith('youtube.com')) {
        return { url, ok: false, reason: 'youtube_redirected_to_homepage' }
      }
    }

    return { url, ok: true }
  } catch (err) {
    clearTimeout(timer)
    const msg = err instanceof Error ? err.message : String(err)
    return { url, ok: false, reason: msg.slice(0, 80) }
  }
}

/**
 * Verify a batch of URLs in parallel, with a concurrency cap so we don't
 * hammer TikTok / Instagram and trigger rate limits.
 */
export async function verifyVideoUrls(
  urls: string[],
  opts: { concurrency?: number; timeoutMs?: number } = {},
): Promise<VerifyResult[]> {
  const concurrency = opts.concurrency ?? 3
  const results: VerifyResult[] = []
  let idx = 0
  async function worker() {
    while (idx < urls.length) {
      const i = idx++
      const r = await verifyVideoUrl(urls[i], opts.timeoutMs)
      results.push(r)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return results
}

/**
 * Convenience: takes a list, returns only the URLs that verified ok.
 */
export async function filterToValidVideoUrls(urls: string[]): Promise<string[]> {
  if (urls.length === 0) return []
  const results = await verifyVideoUrls(urls)
  return results.filter((r) => r.ok).map((r) => r.url)
}

/**
 * Is the URL a direct video-platform URL (worth verifying)?
 * Blog/news URLs are skipped — their reliability isn't a Perplexity-
 * hallucination concern.
 */
export function isVideoPlatformUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return (
    lower.includes('tiktok.com') ||
    lower.includes('instagram.com') ||
    lower.includes('youtube.com') ||
    lower.includes('youtu.be')
  )
}
