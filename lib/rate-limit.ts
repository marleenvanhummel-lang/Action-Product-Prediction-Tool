const windowMs = 60_000 // 1 minute window
const hits = new Map<string, number[]>()

// Clean up old entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, timestamps] of hits) {
      const valid = timestamps.filter((t) => now - t < windowMs)
      if (valid.length === 0) hits.delete(key)
      else hits.set(key, valid)
    }
  }, 300_000)
}

export function isRateLimited(ip: string, route: string, maxRequests: number): boolean {
  const key = `${ip}:${route}`
  const now = Date.now()
  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (timestamps.length >= maxRequests) return true
  timestamps.push(now)
  hits.set(key, timestamps)
  return false
}
