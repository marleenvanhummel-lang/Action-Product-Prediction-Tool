/**
 * Trend mindmap generator.
 *
 * For each trend, generate a Google-Trends-meets-mindmap context bundle that
 * helps the team:
 *   1. UNDERSTAND the trend (where it came from, who's driving it)
 *   2. THINK CREATIVELY about it (adjacent concepts, variations, brand angles)
 *
 * Returns 6 categories of bullets:
 *   - origin       — who/where/when did this start
 *   - spreading    — creators / accounts / platforms amplifying it
 *   - adjacent     — related trends, formats, communities
 *   - variations   — spinoffs, parodies, evolutions of the format
 *   - searches     — what people are searching/hashtagging around it
 *   - brandPlays   — brands that already executed on it (or could)
 *
 * Implementation: Perplexity research with a structured-section prompt,
 * then markdown parsing.
 */

import { perplexitySearch } from '@/lib/perplexity'

export interface MindmapNode {
  label: string         // The bullet text
  detail?: string       // Optional sub-context
  url?: string          // Optional source URL
}

export interface TrendMindmap {
  origin: MindmapNode[]
  spreading: MindmapNode[]
  adjacent: MindmapNode[]
  variations: MindmapNode[]
  searches: MindmapNode[]
  brandPlays: MindmapNode[]
}

export async function generateTrendMindmap(input: {
  name: string
  description: string
  category: string
  hashtags: string[]
}): Promise<TrendMindmap | null> {
  const query = `For the trend "${input.name}" (${input.category} trend), build a context mindmap.

Brief description: ${input.description}
${input.hashtags.length > 0 ? `Hashtags: ${input.hashtags.join(' ')}` : ''}

Return 6 sections, each with 3-5 concise bullet points. Use this exact markdown structure with these exact headers:

## ORIGIN
- Where the trend started — specific creator, account, platform, or event. Date if known.
- (3-5 bullets)

## SPREADING
- Specific named creators / accounts / brands amplifying this right now
- Include @handles where known

## ADJACENT
- Related trends, formats, communities, subcultures it connects to
- Things that share an audience or vibe

## VARIATIONS
- Specific spinoffs, parodies, or evolutions of the format
- Country-specific or community-specific versions

## SEARCHES
- What people are searching on Google / TikTok / Instagram around this
- Related queries and hashtags that signal interest

## BRAND PLAYS
- Brands that have already executed on this trend (name them with country)
- Or specific creative angles a brand could take

Be concise. One sentence per bullet. Name specific creators, brands, hashtags wherever possible. No generic statements like "various creators are using this".`

  const result = await perplexitySearch(query)
  if (!result.ok || !result.text) return null

  return parseMindmapMarkdown(result.text, result.citations)
}

function parseMindmapMarkdown(text: string, citations: string[]): TrendMindmap {
  const sections: Record<string, MindmapNode[]> = {
    origin: [],
    spreading: [],
    adjacent: [],
    variations: [],
    searches: [],
    brandPlays: [],
  }

  const sectionMap: Record<string, keyof TrendMindmap> = {
    'ORIGIN': 'origin',
    'SPREADING': 'spreading',
    'ADJACENT': 'adjacent',
    'VARIATIONS': 'variations',
    'SEARCHES': 'searches',
    'BRAND PLAYS': 'brandPlays',
    'BRAND-PLAYS': 'brandPlays',
    'BRANDPLAYS': 'brandPlays',
  }

  const lines = text.split('\n')
  let currentSection: keyof TrendMindmap | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    // Section header: ## NAME or # NAME
    const headerMatch = line.match(/^#{1,3}\s+(.+)$/)
    if (headerMatch) {
      const key = headerMatch[1].toUpperCase().replace(/[^A-Z\s-]/g, '').trim()
      currentSection = sectionMap[key] ?? null
      continue
    }

    if (!currentSection) continue

    // Bullet line: -, *, or numbered
    if (!/^[-*•]|^\d+\./.test(line)) continue
    const cleaned = line
      .replace(/^[-*•]\s*/, '')
      .replace(/^\d+\.\s*/, '')
      .replace(/\[\d+(?:,\s*\d+)*\]/g, '') // citation refs [1] [2,3]
      .trim()

    if (!cleaned || cleaned.length < 4) continue

    // Try to split label from detail on em-dash or colon
    let label = cleaned
    let detail: string | undefined

    const dashIdx = cleaned.search(/\s[—–-]\s/)
    const colonIdx = cleaned.indexOf(':')
    const splitIdx = dashIdx > 0 ? dashIdx : colonIdx > 0 && colonIdx < 80 ? colonIdx : -1

    if (splitIdx > 0) {
      label = cleaned.slice(0, splitIdx).trim().replace(/[*_]/g, '')
      detail = cleaned.slice(splitIdx).replace(/^[\s—–:-]+/, '').trim()
    }

    // Strip leading "Bold:" markdown
    label = label.replace(/^\*\*([^*]+)\*\*/, '$1').trim()

    if (label.length > 120) {
      // Likely the whole bullet is a single sentence, split awkwardly
      label = label.slice(0, 120)
    }

    sections[currentSection].push({
      label,
      detail: detail?.slice(0, 240),
    })

    if (sections[currentSection].length >= 6) {
      // Cap per section
      continue
    }
  }

  // Attach citations to origin bullets where applicable
  if (citations.length > 0 && sections.origin.length > 0) {
    for (let i = 0; i < Math.min(citations.length, 3); i++) {
      const target = sections.origin[i] ?? sections.spreading[i]
      if (target && !target.url) target.url = citations[i]
    }
  }

  return sections as unknown as TrendMindmap
}
