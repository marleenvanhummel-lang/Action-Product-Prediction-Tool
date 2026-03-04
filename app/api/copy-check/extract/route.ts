import { NextRequest, NextResponse } from 'next/server'
import { extractCopiesFromPdf } from '@/lib/copy-checker'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { draftPdfBase64 } = body

  if (!draftPdfBase64) {
    return NextResponse.json({ error: 'No drafts PDF provided' }, { status: 400 })
  }

  try {
    const copies = await extractCopiesFromPdf(draftPdfBase64)
    if (copies.length === 0) {
      return NextResponse.json({ error: 'No copy blocks found in the PDF' }, { status: 422 })
    }
    return NextResponse.json(copies)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
