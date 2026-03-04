import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const B64_PATH = path.join(DATA_DIR, 'brand-guidelines.b64')
const NAME_PATH = path.join(DATA_DIR, 'brand-guidelines-name.txt')

export async function GET() {
  try {
    const [b64, name] = await Promise.all([
      fs.readFile(B64_PATH, 'utf8').catch(() => null),
      fs.readFile(NAME_PATH, 'utf8').catch(() => null),
    ])
    if (!b64) {
      return NextResponse.json({ exists: false })
    }
    return NextResponse.json({ exists: true, base64: b64.trim(), filename: (name ?? 'brand-guidelines.pdf').trim() })
  } catch {
    return NextResponse.json({ exists: false })
  }
}

export async function POST(req: NextRequest) {
  const { base64, filename } = await req.json()
  if (!base64) return NextResponse.json({ error: 'No base64 provided' }, { status: 400 })
  if (typeof base64 === 'string' && base64.length > 6_800_000) {
    return NextResponse.json({ error: 'Bestand te groot. Maximum 5MB.' }, { status: 400 })
  }
  if (filename && typeof filename === 'string') {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (!['pdf', 'docx', 'txt', 'doc'].includes(ext ?? '')) {
      return NextResponse.json({ error: 'Alleen .pdf, .docx en .txt bestanden zijn toegestaan.' }, { status: 400 })
    }
  }
  await fs.mkdir(DATA_DIR, { recursive: true })
  await Promise.all([
    fs.writeFile(B64_PATH, base64, 'utf8'),
    fs.writeFile(NAME_PATH, filename ?? 'brand-guidelines.pdf', 'utf8'),
  ])
  return NextResponse.json({ success: true })
}

export async function DELETE() {
  await Promise.all([
    fs.unlink(B64_PATH).catch(() => null),
    fs.unlink(NAME_PATH).catch(() => null),
  ])
  return NextResponse.json({ success: true })
}
