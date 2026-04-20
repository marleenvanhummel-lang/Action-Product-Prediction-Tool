'use client'

import { useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api-client'
import DropZone from '@/components/scanner/DropZone'
import ScanConfig from '@/components/scanner/ScanConfig'
import ProgressPanel from '@/components/scanner/ProgressPanel'
import ResultsTable from '@/components/scanner/ResultsTable'
import { BATCH_SIZE, ALL_COUNTRIES } from '@/lib/constants'
import type { ProcessableFile, ScanConfig as ScanConfigType, ImageResult, ScanSummary } from '@/types/scanner'

type Phase = 'setup' | 'scanning' | 'complete'

const DEFAULT_CONFIG: ScanConfigType = {
  targetCountries: [...ALL_COUNTRIES],
  enableLanguageCheck: true,
  enablePriceCheck: true,
  enableBrandCheck: true,
}

export default function ScannerPage() {
  const [files, setFiles] = useState<ProcessableFile[]>([])
  const [config, setConfig] = useState<ScanConfigType>(DEFAULT_CONFIG)
  const [phase, setPhase] = useState<Phase>('setup')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [results, setResults] = useState<ImageResult[]>([])
  const [summary, setSummary] = useState<ScanSummary | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [dropZoneKey, setDropZoneKey] = useState(0)
  const [startError, setStartError] = useState<string | null>(null)

  const handleStart = async () => {
    if (files.length === 0) return
    setIsStarting(true)
    setStartError(null)

    try {
      // Create session
      const res = await apiFetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, total: files.length }),
      })
      if (!res.ok) {
        const errBody = await res.text()
        throw new Error(`Session creation failed (${res.status}): ${errBody.slice(0, 200)}`)
      }
      const { sessionId: sid } = await res.json()
      setSessionId(sid)
      setResults([])
      setSummary(null)
      setPhase('scanning')

      // Send files with controlled concurrency (one file per request to avoid body size limits)
      const CONCURRENCY = BATCH_SIZE
      let cancelled = false

      async function sendFile(file: ProcessableFile) {
        if (cancelled) return
        const formData = new FormData()
        formData.append('metadata', JSON.stringify({ id: file.id, filename: file.filename, mimeType: file.mimeType }))
        if (file.file) formData.append('file', file.file)

        const res = await apiFetch(`/api/scan/${sid}/batch`, { method: 'POST', body: formData })
        if (!res.ok) {
          const errBody = await res.text()
          throw new Error(`Batch failed (${res.status}): ${errBody.slice(0, 200)}`)
        }
        const data = await res.json()
        if (data.cancelled) cancelled = true
      }

      // Process in chunks of CONCURRENCY
      for (let i = 0; i < files.length; i += CONCURRENCY) {
        if (cancelled) break
        const chunk = files.slice(i, i + CONCURRENCY)
        await Promise.all(chunk.map(sendFile))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Scan failed:', msg)
      setStartError(msg)
      setPhase('setup')
    } finally {
      setIsStarting(false)
    }
  }

  const handleResult = useCallback((result: ImageResult) => {
    // Restore the browser objectUrl from the original file (server doesn't have it)
    const original = files.find((f) => f.id === result.id)
    if (original?.objectUrl) {
      result = { ...result, objectUrl: original.objectUrl }
    }
    setResults((prev) => [...prev, result])
  }, [files])

  const handleComplete = useCallback((s: ScanSummary) => {
    setSummary(s)
    setPhase('complete')
  }, [])

  const handleCancel = useCallback(() => {
    setPhase('setup')
    setResults([])
  }, [])

  const handleReset = () => {
    setPhase('setup')
    setFiles([])
    setResults([])
    setSummary(null)
    setSessionId(null)
    setStartError(null)
    setDropZoneKey((k) => k + 1)
  }

  return (
    <div className="min-h-screen">
      {/* Page header */}
      <div className="border-b border-gray-200 bg-white px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1
              className="font-bold text-gray-900"
              style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: '0.01em', lineHeight: 1.1 }}
            >
              Image Scanner
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Upload up to 700 images and check language, pricing, and brand compliance with AI
            </p>
          </div>
          {phase === 'setup' && files.length > 0 && (
            <button
              onClick={handleReset}
              className="text-sm font-medium text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
            >
              Clear all
            </button>
          )}
          {(phase === 'scanning' || phase === 'complete') && (
            <button
              onClick={handleReset}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-4 py-2 transition-colors"
            >
              New scan
            </button>
          )}
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Summary banner on complete */}
        {phase === 'complete' && summary && (
          <div className="rounded-xl p-5 border grid grid-cols-2 sm:grid-cols-4 gap-4" style={{ backgroundColor: '#fff', borderColor: '#e5e7eb' }}>
            <SummaryCard label="Total scanned" value={summary.total} color="text-gray-900" />
            <SummaryCard label="Passed" value={summary.passed} color="text-green-700" />
            <SummaryCard label="Failed" value={summary.failed} color="text-red-700" />
            <SummaryCard label="Warnings" value={summary.warnings} color="text-yellow-700" />
          </div>
        )}

        {/* Error banner */}
        {startError && phase === 'setup' && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-5 py-4">
            <p className="text-sm font-semibold text-red-800 mb-1">Scan failed to start</p>
            <p className="text-xs text-red-700 font-mono break-all">{startError}</p>
          </div>
        )}

        {/* Setup phase: upload + config side by side */}
        {phase === 'setup' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">1. Upload Images</h2>
              <DropZone key={dropZoneKey} onFilesSelected={setFiles} />
            </div>
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">2. Configure & Start</h2>
              <ScanConfig
                config={config}
                onChange={setConfig}
                fileCount={files.length}
                onStart={handleStart}
                isStarting={isStarting}
              />
            </div>
          </div>
        )}

        {/* Scanning phase: progress + live results */}
        {phase === 'scanning' && sessionId && (
          <div className="space-y-6">
            <ProgressPanel
              sessionId={sessionId}
              total={files.length}
              onResult={handleResult}
              onComplete={handleComplete}
              onCancel={handleCancel}
            />
            <ResultsTable results={results} summary={null} isScanning={true} />
          </div>
        )}

        {/* Complete phase: full results */}
        {phase === 'complete' && (
          <ResultsTable results={results} summary={summary} isScanning={false} />
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}
