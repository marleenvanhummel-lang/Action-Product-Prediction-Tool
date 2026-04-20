import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export const CC_BASE = 'https://ads.tiktok.com/business/creativecenter'

// Netherlands context (locale + timezone). Fixed for this use case.
export const NL_CONTEXT = {
  locale: 'nl-NL',
  timezoneId: 'Europe/Amsterdam',
}

export const NL_COUNTRY_NAME = 'Netherlands'

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true })
}

export async function newNLContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ userAgent: UA, ...NL_CONTEXT })
}

/**
 * Waits for a single XHR response matching `urlPart` with `code === 0`,
 * then resolves with the extracted payload.
 */
export function waitAndCapture<T>(
  page: Page,
  urlPart: string,
  extract: (data: any) => T,
  timeout = 40_000,
): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeout)
    const handler = async (r: any) => {
      if (!r.url().includes(urlPart) || r.status() !== 200) return
      try {
        const j = await r.json()
        if (j?.code === 0 && j?.data) {
          clearTimeout(timer)
          page.off('response', handler)
          resolve(extract(j.data))
        }
      } catch {}
    }
    page.on('response', handler)
  })
}

export function captureOneBatch<T>(
  page: Page,
  urlPart: string,
  extract: (data: any) => T[],
  timeout = 20_000,
): Promise<T[]> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve([]), timeout)
    const handler = async (r: any) => {
      if (!r.url().includes(urlPart) || r.status() !== 200) return
      try {
        const j = await r.json()
        if (j?.code === 0 && j?.data) {
          clearTimeout(timer)
          page.off('response', handler)
          resolve(extract(j.data))
        }
      } catch {}
    }
    page.on('response', handler)
  })
}
