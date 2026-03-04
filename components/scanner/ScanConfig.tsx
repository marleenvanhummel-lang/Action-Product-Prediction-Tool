'use client'

import { ALL_COUNTRIES, COUNTRY_LABELS } from '@/lib/constants'
import type { CountryCode, ScanConfig } from '@/types/scanner'

interface Props {
  config: ScanConfig
  onChange: (config: ScanConfig) => void
  fileCount: number
  onStart: () => void
  isStarting: boolean
}

export default function ScanConfig({ config, onChange, fileCount, onStart, isStarting }: Props) {
  const toggleCountry = (code: CountryCode) => {
    const exists = config.targetCountries.includes(code)
    onChange({
      ...config,
      targetCountries: exists
        ? config.targetCountries.filter((c) => c !== code)
        : [...config.targetCountries, code],
    })
  }

  const toggleAll = () => {
    onChange({
      ...config,
      targetCountries:
        config.targetCountries.length === ALL_COUNTRIES.length ? [] : [...ALL_COUNTRIES],
    })
  }

  const canStart = fileCount > 0 && config.targetCountries.length > 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
      <div>
        <h3 className="font-semibold text-gray-900 mb-1">Scan Configuration</h3>
        <p className="text-sm text-gray-500">Select target markets and which checks to run</p>
      </div>

      {/* Country Selection */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-gray-700">Target Markets</label>
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs font-medium hover:underline"
            style={{ color: 'var(--action-red)' }}
          >
            {config.targetCountries.length === ALL_COUNTRIES.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_COUNTRIES.map((code) => {
            const selected = config.targetCountries.includes(code)
            return (
              <button
                key={code}
                type="button"
                onClick={() => toggleCountry(code)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  selected
                    ? 'text-white border-transparent'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                }`}
                style={selected ? { backgroundColor: 'var(--action-red)', borderColor: 'var(--action-red)' } : {}}
              >
                {code.toUpperCase()}
              </button>
            )
          })}
        </div>
        {config.targetCountries.length > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            {config.targetCountries.map((c) => COUNTRY_LABELS[c]).join(', ')}
          </p>
        )}
        {config.targetCountries.length === 0 && (
          <p className="text-xs text-red-500 mt-2">Select at least one market to continue</p>
        )}
      </div>

      {/* Check Toggles */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-3">Checks to Run</label>
        <div className="space-y-3">
          <Toggle
            checked={config.enableLanguageCheck}
            onChange={(v) => onChange({ ...config, enableLanguageCheck: v })}
            label="Language Check"
            description="Detect text language and verify it matches target market"
          />
          <Toggle
            checked={config.enablePriceCheck}
            onChange={(v) => onChange({ ...config, enablePriceCheck: v })}
            label="Price Check"
            description="Extract price from image and compare against Action website"
          />
          <Toggle
            checked={config.enableBrandCheck}
            onChange={(v) => onChange({ ...config, enableBrandCheck: v })}
            label="Brand & Quality Check"
            description="Verify logo usage, brand colors, text readability, and content appropriateness"
          />
        </div>
      </div>

      {/* Start Button */}
      <button
        type="button"
        onClick={onStart}
        disabled={!canStart || isStarting}
        className="w-full py-3 px-6 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: canStart && !isStarting ? 'var(--action-red)' : undefined, background: !canStart || isStarting ? '#d1d5db' : 'var(--action-red)' }}
      >
        {isStarting ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Starting scan...
          </span>
        ) : (
          `Scan ${fileCount > 0 ? fileCount : ''} image${fileCount !== 1 ? 's' : ''}`
        )}
      </button>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${
          checked ? '' : 'bg-gray-200'
        }`}
        style={checked ? { backgroundColor: 'var(--action-red)' } : {}}
      >
        <span
          className={`absolute top-1 left-0 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}
