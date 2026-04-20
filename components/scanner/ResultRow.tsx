'use client'

import { useState, useEffect } from 'react'
import StatusBadge from '@/components/ui/StatusBadge'
import type { ImageResult } from '@/types/scanner'

interface Props {
  result: ImageResult
}

export default function ResultRow({ result }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [lightbox, setLightbox] = useState(false)

  const langStatus = result.languageCheck
    ? result.languageCheck.language_correct === true
      ? 'pass'
      : result.languageCheck.language_correct === false
      ? 'fail'
      : result.languageCheck.text_found
      ? 'warning'
      : 'skipped'
    : 'skipped'

  const priceStatus = result.priceCheck
    ? result.priceCheck.price_format_correct === false
      ? 'fail'
      : result.priceCheck.price_visible
      ? 'pass'
      : 'skipped'
    : 'skipped'

  const brandStatus = result.brandCheck
    ? result.brandCheck.offensive_content
      ? 'fail'
      : result.brandCheck.overall_quality === 'good'
      ? 'pass'
      : result.brandCheck.overall_quality === 'acceptable'
      ? 'warning'
      : 'fail'
    : 'skipped'

  return (
    <>
      <tr
        className={`cursor-pointer border-b border-gray-100 transition-colors ${
          result.status === 'fail'
            ? 'bg-red-50 hover:bg-red-100'
            : result.status === 'warning'
            ? 'bg-yellow-50 hover:bg-yellow-100'
            : result.status === 'pass'
            ? 'bg-green-50 hover:bg-green-100'
            : 'hover:bg-gray-50'
        }`}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Thumbnail */}
        <td className="py-3 px-4 w-16">
          {result.objectUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={result.objectUrl}
              alt={result.filename}
              className="w-12 h-12 object-cover rounded-lg border border-gray-200 bg-gray-100 cursor-zoom-in"
              onClick={(e) => {
                e.stopPropagation()
                setLightbox(true)
              }}
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
              N/A
            </div>
          )}
        </td>

        {/* Filename */}
        <td className="py-3 px-4">
          <p className="text-sm font-medium text-gray-900 truncate max-w-48">{result.filename}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-48">{result.summary}</p>
        </td>

        {/* Overall */}
        <td className="py-3 px-4 text-center">
          <StatusBadge status={result.status === 'error' ? 'error' : result.status} />
        </td>

        {/* Language */}
        <td className="py-3 px-4 text-center">
          {result.languageCheck ? (
            <div className="flex flex-col items-center gap-0.5">
              <StatusBadge status={langStatus as 'pass' | 'fail' | 'warning' | 'skipped'} />
              {result.languageCheck.detected_languages.length > 0 && (
                <span className="text-xs text-gray-400">
                  {result.languageCheck.detected_languages.join(', ')}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
        </td>

        {/* Price */}
        <td className="py-3 px-4 text-center">
          {result.priceCheck ? (
            <div className="flex flex-col items-center gap-0.5">
              <StatusBadge status={priceStatus as 'pass' | 'fail' | 'warning' | 'skipped'} />
              {result.priceCheck.price_in_image && (
                <span className="text-xs text-gray-400">{result.priceCheck.price_in_image}</span>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
        </td>

        {/* Brand */}
        <td className="py-3 px-4 text-center">
          {result.brandCheck ? (
            <StatusBadge status={brandStatus as 'pass' | 'fail' | 'warning' | 'skipped'} />
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
        </td>

        {/* Expand icon */}
        <td className="py-3 px-4 text-right">
          <span className="text-gray-400 text-sm">{expanded ? '▲' : '▼'}</span>
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {result.languageCheck && (
                <DetailCard title="Language Check">
                  <DetailItem label="Detected" value={result.languageCheck.detected_languages.join(', ') || 'None'} />
                  <DetailItem label="Correct" value={result.languageCheck.language_correct === null ? 'N/A' : result.languageCheck.language_correct ? 'Yes' : 'No'} />
                  <DetailItem label="Confidence" value={result.languageCheck.confidence} />
                  {result.languageCheck.language_issues.length > 0 && (
                    <DetailItem label="Issues" value={result.languageCheck.language_issues.join('; ')} highlight />
                  )}
                </DetailCard>
              )}
              {result.priceCheck && (
                <DetailCard title="Price Check">
                  <DetailItem label="Price found" value={result.priceCheck.price_in_image ?? 'None'} />
                  <DetailItem label="Currency" value={result.priceCheck.currency_symbol ?? 'N/A'} />
                  <DetailItem label="Format OK" value={result.priceCheck.price_format_correct === null ? 'N/A' : result.priceCheck.price_format_correct ? 'Yes' : 'No'} />
                  {result.priceCheck.notes && <DetailItem label="Notes" value={result.priceCheck.notes} />}
                </DetailCard>
              )}
              {result.brandCheck && (
                <DetailCard title="Brand Check">
                  <DetailItem label="Logo present" value={result.brandCheck.action_logo_present ? 'Yes' : 'No'} />
                  <DetailItem label="Text readable" value={result.brandCheck.text_readable ? 'Yes' : 'No'} />
                  <DetailItem label="Quality" value={result.brandCheck.overall_quality} />
                  {result.brandCheck.offensive_content && (
                    <DetailItem label="Offensive content" value="Flagged" highlight />
                  )}
                  {result.brandCheck.quality_issues.length > 0 && (
                    <DetailItem label="Issues" value={result.brandCheck.quality_issues.join('; ')} highlight />
                  )}
                </DetailCard>
              )}
              {result.error && (
                <div className="md:col-span-3">
                  <p className="text-xs text-red-600 font-mono bg-red-50 rounded px-3 py-2">{result.error}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}

      {/* Image lightbox modal */}
      {lightbox && result.objectUrl && (
        <ImageLightbox result={result} onClose={() => setLightbox(false)} />
      )}
    </>
  )
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <p className="font-semibold text-xs text-gray-500 uppercase tracking-wider mb-2">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function DetailItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-400 flex-shrink-0 w-24">{label}:</span>
      <span className={highlight ? 'text-red-700 font-medium' : 'text-gray-700'}>{value}</span>
    </div>
  )
}

function ImageLightbox({ result, onClose }: { result: ImageResult; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <tr>
      <td colSpan={7} className="p-0">
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl max-w-5xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col md:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors text-lg"
            >
              &times;
            </button>

            {/* Image side */}
            <div className="flex-1 min-h-0 bg-gray-100 flex items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.objectUrl}
                alt={result.filename}
                className="max-w-full max-h-[80vh] object-contain rounded-lg"
              />
            </div>

            {/* Details side */}
            <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-gray-200 p-5 overflow-y-auto max-h-[40vh] md:max-h-[90vh] space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm truncate">{result.filename}</h3>
                <div className="mt-1">
                  <StatusBadge status={result.status === 'error' ? 'error' : result.status} />
                </div>
                {result.summary && (
                  <p className="text-xs text-gray-500 mt-2">{result.summary}</p>
                )}
              </div>

              {result.languageCheck && (
                <DetailCard title="Language Check">
                  <DetailItem label="Detected" value={result.languageCheck.detected_languages.join(', ') || 'None'} />
                  <DetailItem label="Correct" value={result.languageCheck.language_correct === null ? 'N/A' : result.languageCheck.language_correct ? 'Yes' : 'No'} />
                  <DetailItem label="Confidence" value={result.languageCheck.confidence} />
                  {result.languageCheck.language_issues.length > 0 && (
                    <DetailItem label="Issues" value={result.languageCheck.language_issues.join('; ')} highlight />
                  )}
                </DetailCard>
              )}

              {result.priceCheck && (
                <DetailCard title="Price Check">
                  <DetailItem label="Price found" value={result.priceCheck.price_in_image ?? 'None'} />
                  <DetailItem label="Format OK" value={result.priceCheck.price_format_correct === null ? 'N/A' : result.priceCheck.price_format_correct ? 'Yes' : 'No'} />
                  {result.priceCheck.notes && <DetailItem label="Notes" value={result.priceCheck.notes} />}
                </DetailCard>
              )}

              {result.brandCheck && (
                <DetailCard title="Brand Check">
                  <DetailItem label="Text readable" value={result.brandCheck.text_readable ? 'Yes' : 'No'} />
                  <DetailItem label="Quality" value={result.brandCheck.overall_quality} />
                  {result.brandCheck.offensive_content && (
                    <DetailItem label="Offensive" value="Flagged" highlight />
                  )}
                  {result.brandCheck.quality_issues.length > 0 && (
                    <DetailItem label="Issues" value={result.brandCheck.quality_issues.join('; ')} highlight />
                  )}
                </DetailCard>
              )}

              {result.error && (
                <p className="text-xs text-red-600 font-mono bg-red-50 rounded px-3 py-2">{result.error}</p>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  )
}
