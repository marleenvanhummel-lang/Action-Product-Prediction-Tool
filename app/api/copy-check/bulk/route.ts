import { NextRequest, NextResponse } from 'next/server'
import { extractCopiesFromPdf, analyzeCopy } from '@/lib/copy-checker'
import type { BulkCopyResult } from '@/types/copy-checker'

const CONCURRENCY = 5

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { draftPdfBase64, brandPdfBase64 } = body

  if (!draftPdfBase64) return NextResponse.json({ error: 'No drafts PDF provided' }, { status: 400 })
  if (!brandPdfBase64) return NextResponse.json({ error: 'No brand guidelines PDF provided' }, { status: 400 })
  if (typeof draftPdfBase64 === 'string' && draftPdfBase64.length > 6_800_000) {
    return NextResponse.json({ error: 'Drafts PDF te groot. Maximum 5MB.' }, { status: 400 })
  }
  if (typeof brandPdfBase64 === 'string' && brandPdfBase64.length > 6_800_000) {
    return NextResponse.json({ error: 'Brand guidelines PDF te groot. Maximum 5MB.' }, { status: 400 })
  }

  try {
    // Step 1: extract all copies from the drafts PDF
    const copies = await extractCopiesFromPdf(draftPdfBase64)

    if (copies.length === 0) {
      return NextResponse.json({ error: 'No copy blocks found in the PDF' }, { status: 422 })
    }

    // Step 2: analyze each copy against brand guidelines with limited concurrency
    const results: BulkCopyResult[] = new Array(copies.length)

    for (let i = 0; i < copies.length; i += CONCURRENCY) {
      const chunk = copies.slice(i, i + CONCURRENCY)
      await Promise.all(
        chunk.map(async (copy, j) => {
          const idx = i + j
          try {
            const result = await analyzeCopy(brandPdfBase64, copy.copyText)
            results[idx] = { draftName: copy.draftName, copyText: copy.copyText, result }
          } catch (err) {
            results[idx] = {
              draftName: copy.draftName,
              copyText: copy.copyText,
              result: { status: 'warning', issues: [], suggestions: [], rewrittenOptions: [], summary: 'Check failed' },
              error: err instanceof Error ? err.message : 'Unknown error',
            }
          }
        })
      )
    }

    return NextResponse.json(results)
  } catch (err) {
    console.error('[CopyCheckBulk] Error:', err)
    return NextResponse.json({ error: 'Er is een fout opgetreden. Probeer het later opnieuw.' }, { status: 500 })
  }
}
