const secret = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_API_SECRET : undefined

export function authHeaders(): HeadersInit {
  if (!secret) return {}
  return { Authorization: `Bearer ${secret}` }
}

export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...authHeaders(),
      ...init?.headers,
    },
  })
}
