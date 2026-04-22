import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 30

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })

interface PinterestTrend {
  keyword: string
  category: string
  growth_raw: string | null
  week: string
  region: string
}

export async function POST(req: Request) {
  try {
    const { product, trends } = await req.json()

    if (!product || !Array.isArray(trends) || trends.length === 0) {
      return NextResponse.json({ matches: [] })
    }

    const trendList = trends
      .map((t: PinterestTrend, i: number) => `${i}: "${t.keyword}" (${t.category}, ${t.region})`)
      .join('\n')

    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Product: "${product.searchTerm}" — ${product.productName ?? ''} (category: ${product.category})

Pinterest trending keywords:
${trendList}

Which of these keywords are genuinely relevant to this product? Return ONLY a JSON array of index numbers, e.g. [0, 3, 7]. Return [] if none are relevant. No explanation.`,
      }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '[]'
    const indices: number[] = JSON.parse(text.match(/\[[\d,\s]*\]/)?.[0] ?? '[]')
    const matches = indices.map((i) => trends[i]).filter(Boolean).slice(0, 6)

    return NextResponse.json({ matches })
  } catch (err) {
    console.error('[pinterest-match]', err)
    return NextResponse.json({ matches: [] })
  }
}
