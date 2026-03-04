'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AdminPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const res = await fetch('/api/auth/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create user')
      } else {
        setSuccess(`User created: ${data.user.email}`)
        setEmail('')
        setPassword('')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-lg">
      <h1
        className="text-2xl font-bold text-gray-900 mb-1"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Admin
      </h1>
      <p
        className="text-sm text-gray-500 mb-8"
        style={{ fontFamily: 'var(--font-body)' }}
      >
        Create new user accounts for the platform.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="new-email"
            className="block text-xs font-medium text-gray-500 mb-1.5"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Email
          </label>
          <input
            id="new-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@company.nl"
            className="w-full px-4 py-2.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            style={{ fontFamily: 'var(--font-body)' }}
          />
        </div>

        <div>
          <label
            htmlFor="new-password"
            className="block text-xs font-medium text-gray-500 mb-1.5"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Password
          </label>
          <input
            id="new-password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 6 characters"
            className="w-full px-4 py-2.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            style={{ fontFamily: 'var(--font-body)' }}
          />
        </div>

        {error && (
          <div
            className="text-sm rounded-lg px-4 py-2.5"
            style={{
              fontFamily: 'var(--font-body)',
              backgroundColor: 'rgba(227, 0, 15, 0.06)',
              color: '#dc2626',
              border: '1px solid rgba(227, 0, 15, 0.15)',
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            className="text-sm rounded-lg px-4 py-2.5"
            style={{
              fontFamily: 'var(--font-body)',
              backgroundColor: 'rgba(22, 163, 74, 0.06)',
              color: '#16a34a',
              border: '1px solid rgba(22, 163, 74, 0.15)',
            }}
          >
            {success}
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
          {loading ? 'Creating...' : 'Create user'}
        </button>
      </form>
    </div>
  )
}
