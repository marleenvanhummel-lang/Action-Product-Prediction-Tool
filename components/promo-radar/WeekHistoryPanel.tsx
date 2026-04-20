'use client'

import type { UploadRecord } from '@/types/promo'

interface Props {
  uploads: UploadRecord[]
  onDelete: (week: number, year: number) => void
}

export default function WeekHistoryPanel({ uploads, onDelete }: Props) {
  if (uploads.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-bold text-gray-900 text-sm mb-1">Week History</h3>
        <p className="text-xs text-gray-400 mt-3 text-center py-4">
          No weeks uploaded yet.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-bold text-gray-900 text-sm mb-3">
        Week History
        <span className="ml-2 text-xs font-normal text-gray-400">
          {uploads.length} week{uploads.length !== 1 ? 's' : ''}
        </span>
      </h3>

      <ul className="space-y-2">
        {uploads.map((u) => (
          <li
            key={u.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2.5 hover:border-gray-200 transition-colors"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-900">
                  W{u.week} · {u.year}
                </span>
                <span className="text-xs text-gray-400">{u.productCount} products</span>
              </div>
              <p
                className="text-xs text-gray-400 truncate max-w-[160px]"
                title={u.filename}
              >
                {u.filename}
              </p>
            </div>

            <button
              onClick={() => {
                if (confirm(`Remove W${u.week} ${u.year} from the radar?`)) {
                  onDelete(u.week, u.year)
                }
              }}
              className="flex-shrink-0 text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
              title="Remove this week"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
