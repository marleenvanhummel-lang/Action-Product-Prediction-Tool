import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isRateLimited } from '@/lib/rate-limit'

const RATE_LIMITS: Record<string, number> = {
  '/api/audio-checker': 10,
  '/api/copy-check': 10,
  '/api/scan': 800,
  '/api/trends': 5,
  '/api/culture/fetch': 2,
  '/api/culture': 30,
  '/api/moments': 30,
  '/api/price-lookup': 20,
  '/api/brand-guidelines': 10,
}

function getRateLimit(pathname: string): number {
  for (const [prefix, limit] of Object.entries(RATE_LIMITS)) {
    if (pathname.startsWith(prefix)) return limit
  }
  return 30 // default
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!pathname.startsWith('/api/')) return NextResponse.next()

  // --- Auth check (skip for SSE streams, /api/auth/*, and public report) ---
  const isSSE = pathname.endsWith('/stream') && request.method === 'GET'
  const isAuthRoute = pathname.startsWith('/api/auth/')
  // The culture report is intentionally public — team forwards it via
  // Slack / WhatsApp / email and external recipients shouldn't need auth.
  const isPublicReport = pathname === '/api/culture/report.html'
  // Public read access to Culture Radar & Moments: anyone with the URL
  // should be able to see what's trending — dashboard, magazine, trend
  // detail pages, sources health. Writes (scrape, extract, briefs,
  // cron, enrichment, manual submissions) still require auth because
  // they trigger paid AI calls or modify state.
  const isPublicCultureRead =
    request.method === 'GET' &&
    (pathname.startsWith('/api/culture/') || pathname.startsWith('/api/moments/'))
  const secret = process.env.API_SECRET
  if (!isSSE && !isAuthRoute && !isPublicReport && !isPublicCultureRead) {
    if (!secret) {
      // API_SECRET not configured — reject all API requests in production
      console.error('[Middleware] API_SECRET environment variable is not set')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // --- Rate limit ---
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const limit = getRateLimit(pathname)
  if (isRateLimited(ip, pathname, limit)) {
    return NextResponse.json(
      { error: 'Te veel verzoeken. Probeer het over een minuut opnieuw.' },
      { status: 429 },
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
