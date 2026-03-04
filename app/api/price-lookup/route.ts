import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { SCRAPER_TIMEOUT_MS } from '@/lib/constants'

const TOOLS_DIR = path.join(process.cwd(), 'tools')

// POST /api/price-lookup — spawns Python price scraper
const ALLOWED_COUNTRIES = ['nl-nl', 'be-nl', 'be-fr', 'de-de', 'fr-fr', 'at-de', 'lu-fr', 'pl-pl', 'cz-cs', 'it-it', 'es-es']

export async function POST(req: NextRequest) {
  const body = await req.json()

  if (body.product_name && typeof body.product_name === 'string' && body.product_name.length > 200) {
    return NextResponse.json({ success: false, results: [], error: 'Productnaam te lang (max 200 tekens).' }, { status: 400 })
  }
  if (body.country_code && !ALLOWED_COUNTRIES.includes(body.country_code)) {
    return NextResponse.json({ success: false, results: [], error: 'Ongeldig land.' }, { status: 400 })
  }

  return new Promise<NextResponse>((resolve) => {
    let proc: ReturnType<typeof spawn>

    try {
      proc = spawn('python3', [
        path.join(TOOLS_DIR, 'scrape_action_price.py'),
        JSON.stringify(body),
      ])
    } catch {
      resolve(NextResponse.json({ success: false, results: [], error: 'python_unavailable' }))
      return
    }

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    const timeout = setTimeout(() => {
      proc.kill()
      resolve(NextResponse.json({ success: false, results: [], error: 'timeout' }))
    }, SCRAPER_TIMEOUT_MS)

    proc.on('close', () => {
      clearTimeout(timeout)
      try {
        const parsed = JSON.parse(stdout.trim())
        resolve(NextResponse.json(parsed))
      } catch {
        resolve(
          NextResponse.json({
            success: false,
            results: [],
            error: 'parse_error',
          })
        )
      }
    })

    proc.on('error', () => {
      clearTimeout(timeout)
      resolve(NextResponse.json({ success: false, results: [], error: 'spawn_error' }))
    })
  })
}
