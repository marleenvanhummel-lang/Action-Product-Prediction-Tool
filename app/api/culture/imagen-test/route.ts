/**
 * GET /api/culture/imagen-test
 *
 * Probe Gemini's image-generation models to see what's available on
 * v1beta with the current API key. We test a few model names.
 */
import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const maxDuration = 60

export async function GET() {
  const apiKey = process.env.GOOGLE_API_KEY ?? ''
  const genAI = new GoogleGenerativeAI(apiKey)
  const prompt = 'Cinematic editorial photograph of a viral TikTok cottagecore moment, soft natural light, golden hour, magazine cover style, high resolution'

  const candidates = [
    'gemini-2.5-flash-image',
    'gemini-2.0-flash-exp-image-generation',
    'imagen-3.0-generate-002',
    'imagen-4.0-generate-001',
  ]
  const results: Array<{ model: string; ok: boolean; bytes: number; error?: string }> = []
  for (const m of candidates) {
    try {
      const model = genAI.getGenerativeModel({ model: m })
      const r = await model.generateContent(prompt)
      const parts = r.response.candidates?.[0]?.content?.parts ?? []
      const imagePart = parts.find((p) => (p as { inlineData?: unknown }).inlineData)
      const dataLen = imagePart && (imagePart as { inlineData?: { data?: string } }).inlineData?.data
        ? ((imagePart as { inlineData: { data: string } }).inlineData.data.length)
        : 0
      results.push({ model: m, ok: dataLen > 0, bytes: dataLen })
    } catch (err) {
      results.push({ model: m, ok: false, bytes: 0, error: (err instanceof Error ? err.message : String(err)).slice(0, 200) })
    }
  }
  return NextResponse.json({ apiKeyPresent: !!apiKey, results })
}
