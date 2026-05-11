/**
 * Culture Radar — Perplexity adapter.
 *
 * Perplexity's `sonar` models do real-time web search and return synthesized
 * answers with citations. That's a perfect input format for Gemini's trend
 * extraction:
 *
 *   1. We ask Perplexity a focused question ("what memes are trending in NL
 *      this week?")
 *   2. Perplexity searches the web, synthesizes an answer, returns citations.
 *   3. We hand the answer + citations to Gemini as if it were a scraped
 *      source. Citations become exampleUrls.
 *
 * Used by:
 *   - app/api/culture/fetch  (discovery — sources with source_type='perplexity_query')
 *   - app/api/culture/submit (enrichment — when a manually-spotted trend has no description)
 */

const PERPLEXITY_API = 'https://api.perplexity.ai/chat/completions'
const DEFAULT_MODEL = 'sonar'

export interface PerplexityResult {
  ok: boolean
  text: string                   // synthesized answer body (markdown)
  citations: string[]            // URLs Perplexity used as sources
  error?: string
}

/**
 * Ask Perplexity a single question. Designed for queries about cultural
 * trends — keeps the system prompt focused on naming specifics and citing
 * real examples.
 */
export async function perplexitySearch(query: string, opts: {
  model?: string
  systemPromptOverride?: string
} = {}): Promise<PerplexityResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) {
    return { ok: false, text: '', citations: [], error: 'PERPLEXITY_API_KEY not set' }
  }

  const system = opts.systemPromptOverride ?? `
You are a cultural intelligence researcher. When asked about trends, name
specific named examples (creators, sounds, formats, aesthetics, hashtags)
and cite real sources. Be precise. Do not give generic category overviews.
If you cannot find specific named examples, say so.
`.trim()

  try {
    const res = await fetch(PERPLEXITY_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model ?? DEFAULT_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: query },
        ],
        temperature: 0.2,
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return {
        ok: false,
        text: '',
        citations: [],
        error: `Perplexity ${res.status}: ${errText.slice(0, 200)}`,
      }
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      citations?: string[]
    }

    const text = data.choices?.[0]?.message?.content ?? ''
    const citations = Array.isArray(data.citations) ? data.citations : []

    // Detect "I can't / I don't have access" non-answers. Perplexity's
    // sonar model occasionally refuses with no citations when its web
    // search returns nothing useful. We treat those as failures so the
    // caller can fall back to the original description.
    const refusalSignals = [
      'i need to be transparent',
      'i cannot verify',
      "i don't have access",
      'i do not have access',
      'i cannot browse',
      'my knowledge was last updated',
      'i am unable to',
      'i apologize',
    ]
    const lower = text.toLowerCase()
    const looksLikeRefusal =
      citations.length === 0 &&
      refusalSignals.some((s) => lower.includes(s))

    if (looksLikeRefusal) {
      return {
        ok: false,
        text: '',
        citations: [],
        error: 'perplexity_refused_no_web_data',
      }
    }

    return {
      ok: true,
      text,
      citations,
    }
  } catch (err) {
    return {
      ok: false,
      text: '',
      citations: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Research a manually-submitted trend: takes a name + optional context,
 * asks Perplexity what it is, who's doing it, how big it is, with examples.
 * Returns a markdown summary the Action brief generator can feed on.
 */
export async function perplexityResearchTrend(args: {
  name: string
  brandExample?: string | null
  url?: string | null
}): Promise<PerplexityResult> {
  const context = [
    args.brandExample ? `Spotted at: ${args.brandExample}` : null,
    args.url ? `Reference: ${args.url}` : null,
  ]
    .filter(Boolean)
    .join('. ')

  const query = `What is the social media trend known as "${args.name}"?
${context ? `Context: ${context}.\n` : ''}
Answer with:
- A concrete 2-3 sentence description of what the trend actually looks like (visuals, audio, format, named participants).
- Who is doing it: specific creators, brands, or communities.
- How big it is right now: post counts, view counts, regions, dates.
- 3-5 concrete example posts or articles with URLs.
- Why it is happening now: cultural driver or news hook.

Be specific. No generic explanations of "viral content" or "TikTok trends in general".`

  return perplexitySearch(query)
}

/**
 * Convert a Perplexity result into a markdown-flavored "source content"
 * blob that the existing Gemini extraction prompt can consume.
 */
export function perplexityToMarkdown(result: PerplexityResult): string {
  if (!result.ok || !result.text) return ''
  const citations = result.citations.length
    ? '\n\n## Citations\n' + result.citations.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : ''
  return `# Perplexity synthesis\n\n${result.text}${citations}`
}
