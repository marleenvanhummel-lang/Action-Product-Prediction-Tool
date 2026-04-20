'use client'

import { useEffect, useRef, useState } from 'react'
import type { ImageResult, ScanSummary } from '@/types/scanner'

interface Props {
  sessionId: string
  total: number
  onResult: (result: ImageResult) => void
  onComplete: (summary: ScanSummary) => void
  onCancel: () => void
}

export default function ProgressPanel({ sessionId, total, onResult, onComplete, onCancel }: Props) {
  const [processed, setProcessed] = useState(0)
  const [currentFile, setCurrentFile] = useState('')
  const [passCount, setPassCount] = useState(0)
  const [failCount, setFailCount] = useState(0)
  const [warnCount, setWarnCount] = useState(0)
  const [errCount, setErrCount] = useState(0)
  const [isCancelling, setIsCancelling] = useState(false)
  const [startTime] = useState(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const es = new EventSource(`/api/scan/${sessionId}/stream`)
    esRef.current = es

    es.onmessage = (e) => {
      const event = JSON.parse(e.data)

      if (event.type === 'progress') {
        setProcessed(event.processed)
        if (event.currentFile) setCurrentFile(event.currentFile)
      }

      if (event.type === 'result') {
        const r: ImageResult = event.result
        if (r.status === 'pass') setPassCount((n) => n + 1)
        else if (r.status === 'fail') setFailCount((n) => n + 1)
        else if (r.status === 'warning') setWarnCount((n) => n + 1)
        else if (r.status === 'error') setErrCount((n) => n + 1)
        onResult(r)
      }

      if (event.type === 'complete') {
        es.close()
        onComplete(event.summary)
      }
    }

    es.onerror = () => {
      es.close()
    }

    return () => es.close()
  }, [sessionId, onResult, onComplete])

  // Elapsed timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000)
    return () => clearInterval(t)
  }, [startTime])

  const handleCancel = async () => {
    setIsCancelling(true)
    esRef.current?.close()
    const secret = process.env.NEXT_PUBLIC_API_SECRET
    await fetch(`/api/scan/${sessionId}/stream`, {
      method: 'DELETE',
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
    })
    onCancel()
  }

  const pct = total > 0 ? Math.round((processed / total) * 100) : 0
  const avgMs = processed > 0 ? elapsed / processed : 0
  const remaining = avgMs > 0 ? Math.round((total - processed) * avgMs) : null

  const formatTime = (secs: number) => {
    if (secs < 60) return `${secs}s`
    return `${Math.floor(secs / 60)}m ${secs % 60}s`
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Scanning images...</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {processed} of {total} processed &bull; {elapsed > 0 ? formatTime(elapsed) + ' elapsed' : 'Starting...'}
            {remaining !== null && processed > 0 && processed < total && (
              <> &bull; ~{formatTime(remaining)} remaining</>
            )}
          </p>
        </div>
        <button
          onClick={handleCancel}
          disabled={isCancelling}
          className="text-sm font-medium text-gray-500 hover:text-red-600 transition-colors disabled:opacity-50"
        >
          {isCancelling ? 'Cancelling...' : 'Cancel'}
        </button>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-gray-500">
          <span>{currentFile ? `Processing: ${currentFile}` : 'Waiting...'}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, backgroundColor: 'var(--action-red)' }}
          />
        </div>
      </div>

      {/* Live counters */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-center">
          <div className="text-xl font-bold text-green-700">{passCount}</div>
          <div className="text-xs text-green-600 font-medium">Pass</div>
        </div>
        <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-center">
          <div className="text-xl font-bold text-red-700">{failCount}</div>
          <div className="text-xs text-red-600 font-medium">Fail</div>
        </div>
        <div className="rounded-lg bg-yellow-50 border border-yellow-100 px-3 py-2 text-center">
          <div className="text-xl font-bold text-yellow-700">{warnCount}</div>
          <div className="text-xs text-yellow-600 font-medium">Warning</div>
        </div>
        <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2 text-center">
          <div className="text-xl font-bold text-orange-700">{errCount}</div>
          <div className="text-xs text-orange-600 font-medium">Error</div>
        </div>
      </div>
    </div>
  )
}
