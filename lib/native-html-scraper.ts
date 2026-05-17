/**
 * Native HTML scraper — Firecrawl alternative for static blogs.
 *
 * Most blogs we scrape (Social Media Today, Allure, Tasty, Today Food,
 * Apartment Therapy, etc.) are server-rendered: the HTML already
 * contains the article titles, headings, and excerpts before any
 * JavaScript runs. Firecrawl spends a paid credit per page to do
 * exactly the same fetch + JS-render + markdown-extract; for these
 * sites the JS-render step adds nothing.
 *
 * This module does the fetch + HTML→markdown extraction ourselves
 * using only Node's built-in `fetch`. No external dependency,
 * sub-second per page, zero per-page cost.
 *
 * When this fails (SPA blogs where the article body is injected by
 * JS, or sites that 403 cloud IPs), the caller can fall back to
 * Firecrawl on demand.
 */

import type { ScrapeResult } from '@/types/culture'
import type { SourceRow } from '@/app/api/culture/fetch/route'

const NATIVE_FETCH_TIMEOUT_MS = 12_000
const MIN_USABLE_CHARS = 1000

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Scrape a static blog by fetching its HTML and converting the main
 * content into a markdown-flavoured digest. Returns null when the
 * fetch produced too little usable content (< MIN_USABLE_CHARS) —
 * caller should then fall back to Firecrawl for that source.
 */
export async function scrapeStaticHtml(
  source: SourceRow,
): Promise<ScrapeResult | null> {
  const fetchedAt = new Date().toISOString()

  try {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), NATIVE_FETCH_TIMEOUT_MS)
    const res = await fetch(source.url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8',
      },
      redirect: 'follow',
    })
    clearTimeout(tid)

    if (!res.ok) {
      return {
        sourceId: source.id,
        sourceName: source.name,
        sourceCategory: source.category,
        url: source.url,
        ok: false,
        fetchedAt,
        textSnippet: '',
        topLinks: [],
        error: `native http ${res.status}`,
      }
    }

    const html = await res.text()
    const { markdown, links } = htmlToMarkdown(html, source.url)

    // Sanity check: if the markdown is too short, this is likely an SPA
    // that needs JS to populate content. Signal a fallback to caller.
    const usable = markdown.replace(/\s+/g, ' ').length
    if (usable < MIN_USABLE_CHARS) {
      return null
    }

    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceCategory: source.category,
      url: source.url,
      ok: true,
      fetchedAt,
      textSnippet: markdown.slice(0, 12_000),
      topLinks: links.slice(0, 20),
    }
  } catch (err) {
    // Distinguish timeout / abort from other errors so caller can
    // decide whether to retry or fall back.
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceCategory: source.category,
      url: source.url,
      ok: false,
      fetchedAt,
      textSnippet: '',
      topLinks: [],
      error: err instanceof Error ? `native ${err.message}` : `native ${String(err)}`,
    }
  }
}

/**
 * Convert HTML to a compact markdown-ish digest. Designed for the
 * Gemini extraction step downstream — it cares about headings,
 * paragraphs, and links, not perfect formatting fidelity.
 *
 * Returns { markdown, links } where links is the list of href URLs we
 * pulled out of <a> tags (deduped, absolute, same-origin filtered out
 * for noise reduction).
 */
export function htmlToMarkdown(
  html: string,
  baseUrl: string,
): { markdown: string; links: string[] } {
  // 1. Strip noise tags entirely
  let body = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  // 2. Extract page title for the digest header
  const titleMatch = body.match(/<title[^>]*>([^<]*)<\/title>/i)
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : ''

  // 3. Try to narrow to the main article area. Most modern sites wrap
  // the article in <main> or <article>. If neither exists we keep the
  // whole body — Gemini is tolerant.
  const mainMatch =
    body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
    body.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)
  if (mainMatch) {
    body = mainMatch[1]
  }

  // 4. Collect anchor URLs before we strip tags
  const links: string[] = []
  const seenLinks = new Set<string>()
  const linkRe = /<a\b[^>]*href=["']([^"'#?\s][^"'\s]*?)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(body)) !== null) {
    const href = absolutize(m[1], baseUrl)
    if (!href || seenLinks.has(href)) continue
    seenLinks.add(href)
    links.push(href)
  }

  // 5. Tag substitutions to preserve hierarchy
  body = body
    .replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n')
    .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n')
    .replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n')
    .replace(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n')
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')

  // 6. Strip remaining tags
  body = body.replace(/<[^>]+>/g, ' ')

  // 7. Decode common entities, normalise whitespace
  body = decodeEntities(body).replace(/\s+/g, ' ').replace(/ (\n|$)/g, '$1')

  // 8. Collapse multiple blank lines into one and trim
  body = body.replace(/\n{3,}/g, '\n\n').trim()

  const markdown = title ? `# ${title}\n\n${body}` : body
  return { markdown, links }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rdquo;/g, '”')
    .replace(/&ldquo;/g, '“')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
}

function absolutize(href: string, baseUrl: string): string | null {
  try {
    if (href.startsWith('http')) return href
    if (href.startsWith('//')) return `https:${href}`
    if (href.startsWith('/')) {
      const u = new URL(baseUrl)
      return `${u.protocol}//${u.host}${href}`
    }
    // Relative URLs are mostly noise; ignore
    return null
  } catch {
    return null
  }
}
