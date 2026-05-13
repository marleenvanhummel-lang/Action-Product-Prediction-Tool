/**
 * Trend embeddings — turn each trend into a 768d vector so we can:
 *   - Find similar trends across time (semantic dedup, "this is like X
 *     from last month")
 *   - Detect emerging meta-clusters (unnamed patterns spanning multiple
 *     surface-level trends)
 *   - Recommend related trends on the per-trend detail page
 *
 * Uses Gemini text-embedding-004 (768d). Vectors stored as JSONB float
 * arrays (Neon doesn't have pgvector yet on free tier).
 *
 * Cost: very cheap. ~$0.0001 per trend embedding.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? '')

export interface EmbedInput {
  id: string
  name: string
  description: string
  hashtags?: string[]
  subculture?: string | null
  vibe?: string | null
}

export interface EmbedResult {
  id: string
  vector: number[]   // 768 floats
}

/**
 * Build the text we embed per trend. Includes the most-distinctive
 * fields so semantic distance reflects how different the trends are
 * culturally, not just lexically.
 */
function embedText(t: EmbedInput): string {
  return [
    t.name,
    t.description,
    t.hashtags && t.hashtags.length > 0 ? t.hashtags.join(' ') : '',
    t.subculture ? `subculture:${t.subculture}` : '',
    t.vibe ? `vibe:${t.vibe}` : '',
  ].filter(Boolean).join('\n')
}

export async function embedTrend(t: EmbedInput): Promise<number[] | null> {
  try {
    // gemini-embedding-001 (3072d). text-embedding-004 is no longer
    // available on v1beta as of mid-2026.
    const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })
    const result = await model.embedContent(embedText(t))
    return result.embedding.values
  } catch (err) {
    console.error('[trend-embeddings] failed for', t.id, err)
    return null
  }
}

/**
 * Cosine similarity between two unit-ish vectors. Embeddings from
 * text-embedding-004 aren't strictly unit-normalized so we normalize
 * here.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Naive k-means. For ~500 trends and k=15 this is fast enough (<2s on
 * Vercel). For larger sets we'd add mini-batch.
 */
export function kMeansCluster(
  vectors: Array<{ id: string; vector: number[] }>,
  k: number,
  maxIterations = 25,
): Array<{ centroid: number[]; members: string[] }> {
  if (vectors.length === 0 || k <= 0) return []
  if (vectors.length <= k) {
    return vectors.map((v) => ({ centroid: v.vector, members: [v.id] }))
  }

  const dim = vectors[0].vector.length

  // Init: pick k random vectors as centroids (Lloyd's algorithm)
  const shuffled = [...vectors].sort(() => Math.random() - 0.5)
  let centroids = shuffled.slice(0, k).map((v) => [...v.vector])

  let assignments: number[] = new Array(vectors.length).fill(0)

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign each vector to nearest centroid
    let changed = false
    for (let i = 0; i < vectors.length; i++) {
      let bestC = 0
      let bestSim = -Infinity
      for (let c = 0; c < k; c++) {
        const sim = cosineSimilarity(vectors[i].vector, centroids[c])
        if (sim > bestSim) { bestSim = sim; bestC = c }
      }
      if (assignments[i] !== bestC) {
        assignments[i] = bestC
        changed = true
      }
    }

    if (!changed) break

    // Recompute centroids as mean of members
    const newCentroids: number[][] = Array.from({ length: k }, () => new Array(dim).fill(0))
    const counts: number[] = new Array(k).fill(0)
    for (let i = 0; i < vectors.length; i++) {
      const c = assignments[i]
      counts[c]++
      for (let d = 0; d < dim; d++) {
        newCentroids[c][d] += vectors[i].vector[d]
      }
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < dim; d++) {
          newCentroids[c][d] /= counts[c]
        }
      } else {
        // Re-seed empty cluster with a random vector
        newCentroids[c] = [...vectors[Math.floor(Math.random() * vectors.length)].vector]
      }
    }
    centroids = newCentroids
  }

  // Build output
  const clusters: Array<{ centroid: number[]; members: string[] }> =
    centroids.map((c) => ({ centroid: c, members: [] }))
  for (let i = 0; i < vectors.length; i++) {
    clusters[assignments[i]].members.push(vectors[i].id)
  }

  // Sort clusters by member count desc, drop empties
  return clusters
    .filter((c) => c.members.length > 0)
    .sort((a, b) => b.members.length - a.members.length)
}
