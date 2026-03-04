import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { assessCopyrightRisk, type MetadataResult } from '@/lib/audio-checker'

export const maxDuration = 120

interface ScanResult {
  username: string
  count: number
  results: MetadataResult[]
  error?: string
}

async function scanAccount(username: string): Promise<ScanResult> {
  return new Promise((resolve) => {
    const script = path.join(process.cwd(), 'tools', 'scan_instagram_account.py')
    const child = spawn('python3', [script, JSON.stringify({ username, limit: 50 })])
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    const kill = setTimeout(() => {
      child.kill()
      resolve({ username, count: 0, results: [], error: 'Account scan timed out.' })
    }, 115_000)

    child.on('close', () => {
      clearTimeout(kill)
      try {
        resolve(JSON.parse(stdout.trim()))
      } catch {
        console.error('[AccountScanner] Python stdout parse error. stderr:', stderr)
        resolve({ username, count: 0, results: [], error: 'Kon accountdata niet verwerken.' })
      }
    })
  })
}

export async function POST(req: Request) {
  try {
    const { username }: { username: string } = await req.json()

    if (!username?.trim()) {
      return NextResponse.json({ error: 'Geen gebruikersnaam opgegeven.' }, { status: 400 })
    }

    const clean = username.replace('@', '').trim()
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(clean)) {
      return NextResponse.json({ error: 'Ongeldige gebruikersnaam. Alleen letters, cijfers, punten en underscores.' }, { status: 400 })
    }
    const { username: scannedUser, count, results: metadata, error: scanError } = await scanAccount(clean)

    if (scanError && !metadata.length) {
      console.error(`[AccountScanner] Scan failed for @${scannedUser}:`, scanError)
      return NextResponse.json(
        { error: `Scan mislukt voor @${scannedUser}. Controleer of het account openbaar is.` },
        { status: 502 }
      )
    }

    if (!metadata.length) {
      return NextResponse.json(
        { error: `Geen reels gevonden voor @${scannedUser}. Controleer of het account openbaar is.` },
        { status: 404 }
      )
    }

    const assessed = await assessCopyrightRisk(metadata)
    return NextResponse.json({ username: scannedUser, count, results: assessed })
  } catch (err) {
    console.error('[AccountScanner] Error:', err)
    return NextResponse.json(
      { error: 'Er is een fout opgetreden. Probeer het later opnieuw.' },
      { status: 500 }
    )
  }
}
