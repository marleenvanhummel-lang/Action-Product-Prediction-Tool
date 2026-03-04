'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    router.push('/scanner')
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: '#111318' }}
    >
      <div className="w-full max-w-sm">
        {/* Logos */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-white rounded-xl px-6 py-4 mb-4" style={{ width: 200 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/action-logo.png"
              alt="Action"
              className="w-full h-auto"
            />
          </div>
        </div>

        {/* Title */}
        <h1
          className="text-center text-xl font-bold text-white mb-1"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Action Tools
        </h1>
        <p
          className="text-center text-sm mb-8"
          style={{ fontFamily: 'var(--font-body)', color: '#6b7280' }}
        >
          Sign in to access the platform
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium mb-1.5"
              style={{ fontFamily: 'var(--font-body)', color: '#9ca3af' }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@action.nl"
              className="w-full px-4 py-2.5 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-600"
              style={{
                fontFamily: 'var(--font-body)',
                backgroundColor: '#1a1d24',
                border: '1px solid #2a2d35',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium mb-1.5"
              style={{ fontFamily: 'var(--font-body)', color: '#9ca3af' }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2"
              style={{
                fontFamily: 'var(--font-body)',
                backgroundColor: '#1a1d24',
                border: '1px solid #2a2d35',
              }}
            />
          </div>

          {error && (
            <div
              className="text-sm text-center rounded-lg px-4 py-2.5"
              style={{
                fontFamily: 'var(--font-body)',
                backgroundColor: 'rgba(227, 0, 15, 0.1)',
                color: '#f87171',
                border: '1px solid rgba(227, 0, 15, 0.2)',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{
              fontFamily: 'var(--font-body)',
              backgroundColor: 'var(--action-red)',
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
