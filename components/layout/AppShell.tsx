'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import AuthGuard from '@/components/auth/AuthGuard'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'

  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <AuthGuard>
      <div className="flex min-h-screen">
        <Sidebar />
        {/* Jack & A! logo — fixed top-right corner */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="fixed top-0 right-0 z-20 bg-white px-5 flex items-center" style={{ height: 75 }}>
          <img
            src="/jack-logo.png"
            alt="Jack & A!"
            style={{ height: 58, width: 'auto', display: 'block' }}
          />
        </div>
        <main
          style={{ marginLeft: 'var(--sidebar-width)' }}
          className="flex-1 min-h-screen bg-gray-50"
        >
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
