import { NextRequest, NextResponse } from 'next/server'
import { analyzeCopy } from '@/lib/copy-checker'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { pdfBase64, copyText } = body

  if (!pdfBase64) {
    return NextResponse.json({ error: 'No PDF provided' }, { status: 400 })
  }
  if (typeof pdfBase64 === 'string' && pdfBase64.length > 6_800_000) {
    return NextResponse.json({ error: 'PDF te groot. Maximum 5MB.' }, { status: 400 })
  }
  if (!copyText || !copyText.trim()) {
    return NextResponse.json({ error: 'No copy text provided' }, { status: 400 })
  }

  try {
    const result = await analyzeCopy(pdfBase64, copyText.trim())
    return NextResponse.json(result)
  } catch (err) {
    console.error('[CopyCheck] Error:', err)
    return NextResponse.json({ error: 'Er is een fout opgetreden. Probeer het later opnieuw.' }, { status: 500 })
  }
}
