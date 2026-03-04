import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })

export interface MetadataResult {
  url: string
  error?: string
  reelId?: string
  creator?: string
  caption?: string
  track?: string | null
  artist?: string | null
  album?: string | null
  audioTitle?: string
  isOriginalSound?: boolean
}

export interface AssessedResult {
  url: string
  verdict: 'safe' | 'uncertain' | 'risky'
  verdictNL: string
  audioName: string
  audioType: string
  explanation: string
  recommendation: string
  creator?: string
  error?: string
}

export async function assessCopyrightRisk(metadataResults: MetadataResult[]): Promise<AssessedResult[]> {
  const toAssess = metadataResults.filter((r) => !r.error)
  const errorResults: AssessedResult[] = metadataResults
    .filter((r) => r.error)
    .map((r) => ({
      url: r.url,
      verdict: 'uncertain' as const,
      verdictNL: 'Onzeker',
      audioName: 'Onbekend',
      audioType: 'Onbekend',
      explanation: `Kon geen metadata ophalen: ${r.error}`,
      recommendation: 'Controleer of de Reel openbaar is en de URL correct is.',
      error: r.error,
    }))

  if (toAssess.length === 0) return errorResults

  // Process in batches of 15 to stay well within token limits
  const BATCH_SIZE = 15
  const batches: MetadataResult[][] = []
  for (let i = 0; i < toAssess.length; i += BATCH_SIZE) {
    batches.push(toAssess.slice(i, i + BATCH_SIZE))
  }

  async function assessBatch(batch: MetadataResult[]): Promise<AssessedResult[]> {
    const prompt = `Je bent een auteursrecht-adviseur voor Action (Nederlandse retailer, commercieel merk).

Voor elk Instagram Reel hieronder, beoordeel of het audio veilig is voor commercieel gebruik door Action.

REGELS:
- Original sound (gemaakt door een creator, isOriginalSound: true) = doorgaans LAAG risico → verdict "safe"
- Meta Sound Collection / Instagram Free Music = VEILIG → verdict "safe"
- Bekende commerciële nummers (track + artist aanwezig, herkenbare artiest) = HOOG risico → verdict "risky"
- Onduidelijk / geen duidelijke info = ONZEKER → verdict "uncertain"

Reels metadata (JSON):
${JSON.stringify(batch, null, 2)}

Return ONLY a valid JSON array, één object per reel in dezelfde volgorde:
[{
  "url": "...",
  "verdict": "safe" | "uncertain" | "risky",
  "verdictNL": "Veilig" | "Onzeker" | "Risico",
  "audioName": "naam van het audio (track titel of original sound beschrijving)",
  "audioType": "Original sound" | "Commercieel nummer" | "Meta bibliotheek" | "Onbekend",
  "explanation": "1-2 zinnen uitleg waarom dit verdict",
  "recommendation": "Concrete aanbeveling voor Action creators (1 zin)"
}]`

    let msg: Awaited<ReturnType<typeof anthropic.messages.create>> | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        msg = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4000,
          messages: [{ role: 'user', content: prompt }],
        })
        break
      } catch (err: unknown) {
        const status = (err as { status?: number }).status
        if (status === 529 && attempt < 2) {
          await new Promise((r) => setTimeout(r, (attempt + 1) * 5000))
          continue
        }
        throw err
      }
    }
    if (!msg) throw new Error('Claude API niet beschikbaar. Probeer het opnieuw.')

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
    const match = text.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : []
  }

  // Run batches sequentially to avoid rate limits
  const allAssessed: AssessedResult[] = []
  for (const batch of batches) {
    const batchResults = await assessBatch(batch)
    allAssessed.push(...batchResults)
  }

  // Enrich assessed results with creator from metadata
  const enriched = allAssessed.map((r) => {
    const meta = toAssess.find((m) => m.url === r.url)
    return { ...r, creator: meta?.creator }
  })

  // Return in original order, interleaving errors and assessed
  const all: AssessedResult[] = []
  for (const meta of metadataResults) {
    const err = errorResults.find((r) => r.url === meta.url)
    const ok = enriched.find((r) => r.url === meta.url)
    if (err) all.push(err)
    else if (ok) all.push(ok)
  }
  return all
}
