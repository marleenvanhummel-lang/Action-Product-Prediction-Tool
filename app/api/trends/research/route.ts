import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { ProductPrediction, DeepResearchResult } from '@/types/trends'

export const maxDuration = 120

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })

export async function POST(req: Request) {
  try {
    const { prediction }: { prediction: ProductPrediction } = await req.json()

    const {
      productName,
      productType,
      price,
      category,
      searchTerm,
      platformBuzz,
      season,
      trendScore,
      reasoning,
      topSignals,
      contentConcept,
      hook,
      priceQuality,
      innovation,
      practicalUtility,
      giftPotential,
      seasonalRelevance,
      viralPotential,
      targetAudience,
    } = prediction

    const name = productName ?? productType
    const priceStr = price != null ? `€${price.toFixed(2)}` : 'onbekend'
    const seasonStr = Array.isArray(season) && season.length > 0 ? season.join(', ') : 'algemeen'
    const signalsStr = Array.isArray(topSignals) && topSignals.length > 0
      ? topSignals.map((s) => `- ${s}`).join('\n')
      : '- geen specifieke signalen beschikbaar'
    const audienceStr = Array.isArray(targetAudience) && targetAudience.length > 0
      ? targetAudience.join(', ')
      : 'algemeen'

    const prompt = `Je bent een diepgaand content- en marktanalist voor Action (Europese budget retailer, producten €0.50–€20, actief in 14 landen waaronder Nederland, België, Duitsland, Frankrijk).

PRODUCT: ${name} (${priceStr})
Categorie: ${category} | Zoekterm: "${searchTerm}"
Dominant platform: ${platformBuzz} | Seizoenen: ${seasonStr}
Doelgroep: ${audienceStr}

TREND SCORES (1–10):
- Virale Potentie: ${viralPotential ?? 'n/a'}/10
- Prijs-Kwaliteit: ${priceQuality ?? 'n/a'}/10
- Cadeau Potentie: ${giftPotential ?? 'n/a'}/10
- Seizoen Relevantie: ${seasonalRelevance ?? 'n/a'}/10
- Praktisch Nut: ${practicalUtility ?? 'n/a'}/10
- Innovatie: ${innovation ?? 'n/a'}/10
- Overall TrendScore: ${trendScore}/100

TREND SIGNALS:
${signalsStr}

BESTAANDE ANALYSE:
${reasoning}

HUIDIG CONCEPT:
${contentConcept ?? 'niet beschikbaar'}

HOOK:
${hook ?? 'niet beschikbaar'}

━━━ TAAK: DIEPGAANDE ANALYSE ━━━

Genereer een uitgebreide analyse voor dit Action-product. Return ONLY valid JSON (geen extra tekst, geen markdown):

{
  "marketAnalysis": "3-4 zinnen: marktpotentieel van dit product bij Action, prijspositionering vs. duurdere alternatieven, waarom dit product nu scoort bij Nederlandse/Belgische consumenten",
  "competitorContext": "2-3 zinnen: vergelijkbare producten in de markt, waarom Action's lage prijs een concurrentievoordeel geeft, eventuele risico's van de lage prijs",
  "contentScripts": [
    {
      "title": "Pakkende scripttitel (bijv. 'POV: je vindt dit voor €2')",
      "format": "TikTok POV of Instagram Reel of Facebook DIY of YouTube Short",
      "script": "Volledig uitgeschreven script met [SHOT: beschrijving] aanwijzingen voor elke scène, minimaal 120 woorden, maximaal 200 woorden. Schrijf alsof je direct de creator instrueert.",
      "duration": "bijv. '30-45 sec' of '60 sec'",
      "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"]
    },
    {
      "title": "Tweede scripttitel (ander format dan script 1)",
      "format": "ander format dan script 1",
      "script": "Volledig script voor dit format, 120-200 woorden met [SHOT: ...] aanwijzingen",
      "duration": "bijv. '45-60 sec'",
      "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"]
    },
    {
      "title": "Derde scripttitel (ander format dan scripts 1 en 2)",
      "format": "ander format dan scripts 1 en 2",
      "script": "Volledig script voor dit format, 120-200 woorden met [SHOT: ...] aanwijzingen",
      "duration": "bijv. '15-30 sec'",
      "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"]
    }
  ],
  "trendForecast": "2-3 zinnen: wanneer piekt deze trend (bijv. over hoeveel weken)? Hoe lang duurt de trend waarschijnlijk? Wanneer moeten creators beginnen met posten voor maximale impact?",
  "postingStrategy": "2-3 zinnen: beste dagen van de week (bijv. dinsdag en donderdag), beste tijden (bijv. 18:00-20:00 CET), aanbevolen postfrequentie, platform-specifieke tips voor ${platformBuzz}",
  "hashtagSuggestions": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5", "#hashtag6", "#hashtag7", "#hashtag8", "#hashtag9", "#hashtag10"],
  "riskAssessment": "2-3 zinnen: mogelijke risico's zoals seizoensdip, voorraadproblemen bij Action, concurrentie van andere retailers, of inhoud die niet aanslaat bij de doelgroep. Geef ook een tip om elk risico te beperken.",
  "audienceInsights": "2-3 zinnen: diepere analyse van wie dit product koopt en deelt — psychografie (wat drijft hen?), motivaties, lifestyle, hoe zij over dit product praten op social media"
}

REGELS:
- contentScripts: genereer EXACT 3 scripts, elk voor een ANDER format (mix van TikTok/Instagram/Facebook)
- hashtagSuggestions: EXACT 10 hashtags, mix van niche (#actionhaul) en populair (#budgettips)
- Schrijf ALLES in het NEDERLANDS
- Gebruik Nederlandse termen en context (Action NL/BE markt)
- Return ONLY the JSON object, geen extra tekst of markdown blokken`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[Research] No JSON in response. Preview:', text.slice(0, 400))
      throw new Error('No JSON object in Claude response')
    }

    const result: DeepResearchResult = JSON.parse(jsonMatch[0])
    return NextResponse.json(result)
  } catch (err) {
    console.error('[Research] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'research_failed' },
      { status: 500 }
    )
  }
}
