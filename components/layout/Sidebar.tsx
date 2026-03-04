'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const tools = [
  {
    href: '/scanner',
    label: 'Image Scanner',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    ),
  },
  {
    href: '/promo-radar',
    label: 'Promo Radar',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <line x1="8" y1="14" x2="10" y2="14"/>
        <line x1="8" y1="18" x2="10" y2="18"/>
        <line x1="14" y1="14" x2="16" y2="14"/>
      </svg>
    ),
  },
  {
    href: '/copy-checker',
    label: 'Copy Checker',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  {
    href: '/trend-predictor',
    label: 'Trend Predictor',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
        <polyline points="17 6 23 6 23 12"/>
      </svg>
    ),
  },
  {
    href: '/audio-checker',
    label: 'Audio Checker',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>
    ),
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      fetch('/api/auth/is-admin', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((r) => r.json())
        .then((d) => setIsAdmin(d.isAdmin))
        .catch(() => {})
    })
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside
      style={{ width: 'var(--sidebar-width)', backgroundColor: 'var(--sidebar-bg)' }}
      className="fixed left-0 top-0 h-full flex flex-col z-10"
    >
      {/* Logo area — white background so the Action brand mark renders correctly */}
      <div
        style={{ borderBottom: '3px solid var(--action-red)', backgroundColor: '#ffffff' }}
        className="px-5 pt-4 pb-3"
      >
        {/* Action logo image cropped to show only the top "///ACTION" mark */}
        <div style={{ width: '100%', height: 46, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/action-logo.png"
            alt="Action"
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        </div>
        <p
          style={{ fontFamily: 'var(--font-body)', color: '#9ca3af', marginTop: 5 }}
          className="text-xs font-medium tracking-wide"
        >
          Internal Tools Platform
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 overflow-y-auto">
        <p
          style={{
            fontFamily: 'var(--font-display)',
            color: '#4a4f5c',
            letterSpacing: '0.1em',
            fontSize: 11,
          }}
          className="font-semibold uppercase px-2 mb-2"
        >
          Tools
        </p>
        <ul className="space-y-0.5">
          {tools.map((tool) => {
            const isActive = pathname === tool.href || pathname.startsWith(tool.href + '/')
            return (
              <li key={tool.href}>
                <Link
                  href={tool.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group"
                  style={{
                    fontFamily: 'var(--font-body)',
                    color: isActive ? '#ffffff' : '#8b8f9a',
                    backgroundColor: isActive ? 'var(--action-red)' : 'transparent',
                  }}
                >
                  <span
                    className="flex-shrink-0 transition-opacity"
                    style={{ opacity: isActive ? 1 : 0.6 }}
                  >
                    {tool.icon}
                  </span>
                  {tool.label}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="mt-7">
          <p
            style={{
              fontFamily: 'var(--font-display)',
              color: '#4a4f5c',
              letterSpacing: '0.1em',
              fontSize: 11,
            }}
            className="font-semibold uppercase px-2 mb-2"
          >
            Coming Soon
          </p>
          <div
            className="px-3 py-2.5 rounded-lg text-sm flex items-center gap-3 cursor-not-allowed"
            style={{ fontFamily: 'var(--font-body)', color: '#3a3f4a' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            Price Validator
          </div>
        </div>

        {isAdmin && (
          <div className="mt-7">
            <p
              style={{
                fontFamily: 'var(--font-display)',
                color: '#4a4f5c',
                letterSpacing: '0.1em',
                fontSize: 11,
              }}
              className="font-semibold uppercase px-2 mb-2"
            >
              Admin
            </p>
            <Link
              href="/admin"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                fontFamily: 'var(--font-body)',
                color: pathname === '/admin' ? '#ffffff' : '#8b8f9a',
                backgroundColor: pathname === '/admin' ? 'var(--action-red)' : 'transparent',
              }}
            >
              <span
                className="flex-shrink-0 transition-opacity"
                style={{ opacity: pathname === '/admin' ? 1 : 0.6 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </span>
              Manage Users
            </Link>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div
        style={{ borderTop: '1px solid var(--sidebar-border)' }}
        className="px-5 py-4 space-y-2"
      >
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-xs font-medium transition-colors hover:text-white w-full"
          style={{ fontFamily: 'var(--font-body)', color: '#8b8f9a' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Log out
        </button>
        <p
          style={{ fontFamily: 'var(--font-body)', color: '#4a4f5c' }}
          className="text-xs"
        >
          Action Tools v1.0
        </p>
      </div>
    </aside>
  )
}
