import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { assessCopyrightRisk, type MetadataResult } from '@/lib/audio-checker'

export const maxDuration = 60

async function extractMetadata(urls: string[]): Promise<{ results: MetadataResult[] }> {
  return new Promise((resolve) => {
    const script = path.join(process.cwd(), 'tools', 'check_instagram_audio.py')
    const child = spawn('python3', [script, JSON.stringify({ urls })])
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    const kill = setTimeout(() => {
      child.kill()
      resolve({ results: urls.map((url) => ({ url, error: 'extraction timed out' })) })
    }, 55_000)

    child.on('close', () => {
      clearTimeout(kill)
      try {
        resolve(JSON.parse(stdout.trim()))
      } catch {
        console.error('[AudioChecker] Python stdout parse error. stderr:', stderr)
        resolve({ results: urls.map((url) => ({ url, error: 'metadata extraction failed' })) })
      }
    })
  })
}

export async function POST(req: Request) {
  try {
    const { urls }: { urls: string[] } = await req.json()

    if (!urls?.length) {
      return NextResponse.json({ error: 'Geen URLs opgegeven.' }, { status: 400 })
    }
    if (urls.length > 5) {
      return NextResponse.json({ error: 'Maximum 5 URLs per keer.' }, { status: 400 })
    }
    const igPattern = /^https:\/\/(www\.)?instagram\.com\//
    for (const url of urls) {
      if (url.length > 500 || !igPattern.test(url)) {
        return NextResponse.json({ error: 'Alleen geldige Instagram URLs zijn toegestaan.' }, { status: 400 })
      }
    }

    const { results: metadata } = await extractMetadata(urls)
    const assessed = await assessCopyrightRisk(metadata)
    return NextResponse.json({ results: assessed })
  } catch (err) {
    console.error('[AudioChecker] Error:', err)
    return NextResponse.json(
      { error: 'Er is een fout opgetreden. Probeer het later opnieuw.' },
      { status: 500 }
    )
  }
}
