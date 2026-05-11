'use client'

import { useState } from 'react'

export default function ReportToolbar({ generatedAt }: { generatedAt: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div
      className="no-print"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 200 }}>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 700,
            color: '#111827',
          }}
        >
          Culture Radar — Daily Report
        </p>
        <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>
          Generated {new Date(generatedAt).toLocaleString('nl-NL')}
        </p>
      </div>
      <a
        href="/api/culture/report.html"
        target="_blank"
        rel="noreferrer"
        style={{
          padding: '8px 14px',
          background: '#ffffff',
          border: '1px solid #d1d5db',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          color: '#374151',
          textDecoration: 'none',
        }}
      >
        ⬇ Standalone HTML
      </a>
      <button
        onClick={() => window.print()}
        style={{
          padding: '8px 14px',
          background: '#ffffff',
          border: '1px solid #d1d5db',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          color: '#374151',
          cursor: 'pointer',
        }}
      >
        🖨 Print
      </button>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch {
            alert('URL: ' + window.location.href)
          }
        }}
        style={{
          padding: '8px 14px',
          background: 'var(--action-red, #E3000F)',
          color: '#ffffff',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {copied ? '✓ Copied' : '🔗 Copy share URL'}
      </button>
    </div>
  )
}
