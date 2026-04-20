'use client'

import { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { TrendPost, TikTokPost, FacebookPost, ProductPrediction, DeepResearchResult } from '@/types/trends'

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function getSeasonContext(): { headline: string; body: string } {
  const month = new Date().getMonth() + 1
  const day = new Date().getDate()
  if (month === 1) return { headline: 'January', body: "New Year's energy is high — focus on organisation and home refresh content." }
  if (month === 2 && day < 10) return { headline: 'Early February', body: "Valentine's Day is approaching — candles, gifts, and cosy home decor are peaking right now." }
  if (month === 2) return { headline: 'Mid-February', body: "Valentine's content is wrapping up — spring cleaning and Easter content peaks in 3–4 weeks. Get ahead of it." }
  if (month === 3 && day < 15) return { headline: 'Early March', body: 'Spring cleaning season is here — organisation, storage, and home refresh products are trending.' }
  if (month === 3) return { headline: 'Mid-March', body: 'Easter is 2–3 weeks away — seasonal decor, craft/DIY and gift-guide content peaks soon.' }
  if (month === 4) return { headline: 'April', body: 'Spring is in full swing — garden, plants and outdoor living content is gaining momentum.' }
  if (month === 5) return { headline: 'May', body: 'Late spring — garden, outdoor and "summer prep" content is trending across platforms.' }
  if (month === 6) return { headline: 'June', body: 'Summer is starting — outdoor living, garden and cooling-down content is peaking.' }
  if (month === 7 || month === 8) return { headline: 'Summer', body: 'Peak summer — outdoor, holiday prep, and "room refresh" content perform best right now.' }
  if (month === 9) return { headline: 'September', body: 'Back to school energy — organisation, storage, and study-space content is trending.' }
  if (month === 10) return { headline: 'October', body: 'Autumn is here — cosy home decor, candles, and Halloween content are peaking.' }
  if (month === 11) return { headline: 'November', body: 'Pre-Christmas build-up — gift guides, Christmas decor, and cosy home content dominate feeds.' }
  return { headline: 'December', body: 'Christmas is here — gift content, festive decor, and "last minute" picks are trending hard.' }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const REDDIT_CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  HomeDecorating: { bg: '#fef3c7', text: '#92400e' },
  InteriorDesign: { bg: '#e0e7ff', text: '#3730a3' },
}

const PLATFORM_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  tiktok:   { bg: '#000', text: '#fff', label: 'TikTok' },
  reddit:   { bg: '#fff7ed', text: '#c2410c', label: 'Reddit' },
  facebook: { bg: '#1877f2', text: '#fff', label: 'Facebook' },
  mixed:    { bg: '#f3f4f6', text: '#374151', label: 'Mixed' },
}

// ─── Saved Items Context ──────────────────────────────────────────────────────

const LS_SAVED_PRODUCTS = 'action-saved-products'
const LS_SAVED_RESEARCH = 'action-saved-research'

function productKey(pred: ProductPrediction): string {
  return `${pred.searchTerm}__${pred.productName ?? pred.productType}`
}

interface SavedCtx {
  savedProducts: ProductPrediction[]
  savedResearch: Record<string, DeepResearchResult>
  isSaved: (pred: ProductPrediction) => boolean
  toggleSave: (pred: ProductPrediction) => void
  saveResearch: (pred: ProductPrediction, res: DeepResearchResult) => void
  removeProduct: (pred: ProductPrediction) => void
  clearAll: () => void
}

const SavedContext = createContext<SavedCtx>({
  savedProducts: [],
  savedResearch: {},
  isSaved: () => false,
  toggleSave: () => {},
  saveResearch: () => {},
  removeProduct: () => {},
  clearAll: () => {},
})

function useSaved() { return useContext(SavedContext) }

function SavedProvider({ children }: { children: React.ReactNode }) {
  const [savedProducts, setSavedProducts] = useState<ProductPrediction[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem(LS_SAVED_PRODUCTS) ?? '[]') } catch { return [] }
  })
  const [savedResearch, setSavedResearch] = useState<Record<string, DeepResearchResult>>(() => {
    if (typeof window === 'undefined') return {}
    try { return JSON.parse(localStorage.getItem(LS_SAVED_RESEARCH) ?? '{}') } catch { return {} }
  })

  useEffect(() => { localStorage.setItem(LS_SAVED_PRODUCTS, JSON.stringify(savedProducts)) }, [savedProducts])
  useEffect(() => { localStorage.setItem(LS_SAVED_RESEARCH, JSON.stringify(savedResearch)) }, [savedResearch])

  const isSaved = useCallback((pred: ProductPrediction) => {
    const key = productKey(pred)
    return savedProducts.some(p => productKey(p) === key)
  }, [savedProducts])

  const toggleSave = useCallback((pred: ProductPrediction) => {
    const key = productKey(pred)
    setSavedProducts(prev =>
      prev.some(p => productKey(p) === key)
        ? prev.filter(p => productKey(p) !== key)
        : [pred, ...prev]
    )
  }, [])

  const saveResearch = useCallback((pred: ProductPrediction, res: DeepResearchResult) => {
    setSavedResearch(prev => ({ ...prev, [productKey(pred)]: res }))
  }, [])

  const removeProduct = useCallback((pred: ProductPrediction) => {
    const key = productKey(pred)
    setSavedProducts(prev => prev.filter(p => productKey(p) !== key))
    setSavedResearch(prev => { const next = { ...prev }; delete next[key]; return next })
  }, [])

  const clearAll = useCallback(() => { setSavedProducts([]); setSavedResearch({}) }, [])

  return (
    <SavedContext.Provider value={{ savedProducts, savedResearch, isSaved, toggleSave, saveResearch, removeProduct, clearAll }}>
      {children}
    </SavedContext.Provider>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

type TabId = 'home' | 'saved' | 'trends' | 'social' | 'pains-gains' | 'tiktok-nl'
type SourceFilter = 'all' | 'reddit' | 'tiktok' | 'facebook' | 'pinterest'

export default function TrendPredictorPage() {
  return (
    <SavedProvider>
      <TrendPredictorInner />
    </SavedProvider>
  )
}

function TrendPredictorInner() {
  const { savedProducts } = useSaved()
  const [activeTab, setActiveTab] = useState<TabId>('home')

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
              Trend Predictor
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              AI-powered product predictions based on live trend signals
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {([
            { id: 'home', label: 'Home' },
            { id: 'saved', label: 'Opgeslagen', count: savedProducts.length },
            { id: 'trends', label: 'Trends' },
            { id: 'social', label: 'Social Data' },
            { id: 'pains-gains', label: 'Pains & Gains' },
            { id: 'tiktok-nl', label: 'TikTok NL' },
          ] as { id: TabId; label: string; count?: number }[]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
              style={
                activeTab === tab.id
                  ? { backgroundColor: 'var(--action-red)', color: '#fff' }
                  : { backgroundColor: 'transparent', color: '#6b7280' }
              }
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span
                  className="px-1.5 py-0.5 rounded-full text-xs font-bold leading-none"
                  style={{
                    backgroundColor: activeTab === tab.id ? 'rgba(255,255,255,0.3)' : 'var(--action-red)',
                    color: '#fff',
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'home' ? <HomeTab />
        : activeTab === 'saved' ? <SavedTab />
        : activeTab === 'trends' ? <TrendsTab />
        : activeTab === 'social' ? <SocialDataTab />
        : activeTab === 'pains-gains' ? <PainsGainsTab />
        : <TikTokNLTab />}
    </div>
  )
}

// ─── Home Tab ────────────────────────────────────────────────────────────────

function HomeTab() {
  const [predictions, setPredictions] = useState<ProductPrediction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cached, setCached] = useState(false)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [loadingStage, setLoadingStage] = useState('')
  const progressTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const seasonContext = getSeasonContext()
  const [selectedProduct, setSelectedProduct] = useState<ProductPrediction | null>(null)

  // Filters
  const [filterPlatform, setFilterPlatform] = useState<string>('all')
  const [filterScore, setFilterScore] = useState<string>('all')
  const [filterSeason, setFilterSeason] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')

  const availableCategories = useMemo(
    () => [...new Set(predictions.map(p => p.category).filter(Boolean))].sort() as string[],
    [predictions]
  )

  const filtered = useMemo(() => predictions.filter(p => {
    if (filterPlatform !== 'all' && p.platformBuzz !== filterPlatform) return false
    if (filterScore === 'high'   && p.trendScore < 80) return false
    if (filterScore === 'medium' && (p.trendScore < 60 || p.trendScore >= 80)) return false
    if (filterScore === 'low'    && p.trendScore >= 60) return false
    if (filterSeason !== 'all'   && !p.season?.includes(filterSeason)) return false
    if (filterCategory !== 'all' && p.category !== filterCategory) return false
    return true
  }), [predictions, filterPlatform, filterScore, filterSeason, filterCategory])

  const filtersActive = filterPlatform !== 'all' || filterScore !== 'all' || filterSeason !== 'all' || filterCategory !== 'all'

  const resetFilters = () => {
    setFilterPlatform('all')
    setFilterScore('all')
    setFilterSeason('all')
    setFilterCategory('all')
  }

  // Progress bar simulation
  useEffect(() => {
    progressTimersRef.current.forEach(clearTimeout)
    progressTimersRef.current = []

    if (!loading) {
      setLoadingProgress(0)
      setLoadingStage('')
      return
    }

    setLoadingProgress(0)
    setLoadingStage('Launching browser sessions…')

    const schedule: Array<[number, number, string]> = [
      [800,   8,  'Launching browser sessions…'],
      [2500,  16, 'Scraping Action.com categories…'],
      [10000, 30, 'Scraping Action.com categories…'],
      [20000, 44, 'Scraping Action.com categories…'],
      [30000, 57, 'Scraping Action.com categories…'],
      [38000, 65, 'Fetching trend signals from Supabase…'],
      [43000, 72, 'Analysing products with Gemini AI…'],
      [52000, 80, 'Analysing products with Gemini AI…'],
      [62000, 87, 'Building predictions…'],
      [72000, 93, 'Finalising…'],
    ]

    const timers = schedule.map(([delay, progress, stage]) =>
      setTimeout(() => {
        setLoadingProgress(progress)
        setLoadingStage(stage)
      }, delay)
    )

    progressTimersRef.current = timers
    return () => timers.forEach(clearTimeout)
  }, [loading])

  const load = useCallback((refresh = false) => {
    setLoading(true)
    setError(null)
    const url = refresh ? '/api/trends/predict?refresh=1' : '/api/trends/predict'
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000) // 10 min — pipeline takes ~5 min
    apiFetch(url, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        const preds = data.predictions ?? []
        setPredictions(preds)
        setCached(data.cached ?? false)
        setCachedAt(data.cachedAt ?? null)
        // Share with Rankings tab via localStorage
        if (preds.length > 0) {
          try { localStorage.setItem('predictions_cache_local', JSON.stringify(preds)) } catch { /* ignore */ }
        }
      })
      .catch((err: Error) => setError(err.name === 'AbortError' ? 'Request timed out after 10 minutes' : err.message))
      .finally(() => { clearTimeout(timeoutId); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="px-8 py-6 space-y-5">
      {/* Season context strip */}
      <div
        className="rounded-xl px-5 py-3 flex items-start gap-3"
        style={{ backgroundColor: '#fffbeb', borderLeft: '3px solid #f59e0b' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
        <p className="text-xs text-amber-800 leading-relaxed">
          <span className="font-semibold">{seasonContext.headline} — </span>
          {seasonContext.body}
        </p>
      </div>

      {/* Header row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-medium text-gray-700">
            {loading
              ? 'Analysing trends…'
              : filtersActive
                ? `${filtered.length} van ${predictions.length} producten`
                : `Top ${predictions.length} products this week · ranked by AI`}
          </p>
          {cachedAt && !loading && (
            <p className="text-xs text-gray-400 mt-0.5">
              {cached ? `Cached · analysed ${timeAgo(cachedAt)}` : 'Just analysed'}
            </p>
          )}
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-5 py-4">
          <p className="text-sm font-semibold text-red-800 mb-1">Prediction failed</p>
          <p className="text-xs text-red-700 font-mono">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {/* Progress card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800">Preparing your content briefing…</p>
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--action-red)' }}>{loadingProgress}%</span>
            </div>

            {/* Bar */}
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-[900ms] ease-out"
                style={{ width: `${loadingProgress}%`, backgroundColor: 'var(--action-red)' }}
              />
            </div>

            {/* Stage label */}
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border-2 rounded-full animate-spin flex-shrink-0" style={{ borderColor: 'var(--action-red)', borderTopColor: 'transparent' }} />
              <p className="text-xs text-gray-500">{loadingStage || 'Starting…'}</p>
            </div>

            {/* Stage pipeline */}
            <div className="flex items-center mt-1">
              {[
                { label: 'Scraping', active: loadingProgress >= 8 },
                { label: 'Trend signals', active: loadingProgress >= 65 },
                { label: 'Gemini AI', active: loadingProgress >= 72 },
                { label: 'Done', active: false },
              ].map((s, i, arr) => (
                <div key={s.label} className="flex items-center" style={{ flex: i < arr.length - 1 ? 1 : 0 }}>
                  <div className="flex flex-col items-center">
                    <div
                      className="w-2.5 h-2.5 rounded-full transition-colors duration-500"
                      style={{ backgroundColor: s.active ? 'var(--action-red)' : '#e5e7eb' }}
                    />
                    <span className="text-xs text-gray-400 mt-1 whitespace-nowrap">{s.label}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <div
                      className="flex-1 h-px mx-1 mb-3 transition-colors duration-500"
                      style={{ backgroundColor: s.active ? 'var(--action-red)' : '#e5e7eb' }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Skeleton list rows */}
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4 animate-pulse">
                <div className="w-8 flex-shrink-0 pt-1">
                  <div className="h-5 w-7 bg-gray-100 rounded" />
                </div>
                <div className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded-lg" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 w-2/3 bg-gray-100 rounded" />
                  <div className="h-3 w-1/3 bg-gray-100 rounded" />
                  <div className="h-3 w-full bg-gray-100 rounded" />
                  <div className="h-3 w-4/5 bg-gray-100 rounded" />
                </div>
                <div className="w-14 h-7 bg-gray-100 rounded-full flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar */}
      {!loading && !error && predictions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          {/* Score */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-500 w-16 flex-shrink-0">Score</span>
            {([
              { val: 'all', label: 'Alle' },
              { val: 'high', label: '80+' },
              { val: 'medium', label: '60–79' },
              { val: 'low', label: '<60' },
            ] as const).map(({ val, label }) => (
              <button
                key={val}
                onClick={() => setFilterScore(val)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                style={{
                  backgroundColor: filterScore === val ? 'var(--action-red)' : '#f1f5f9',
                  color: filterScore === val ? '#fff' : '#64748b',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Platform */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-500 w-16 flex-shrink-0">Platform</span>
            {([
              { val: 'all', label: 'Alle' },
              { val: 'tiktok', label: 'TikTok' },
              { val: 'reddit', label: 'Reddit' },
              { val: 'facebook', label: 'Facebook' },
              { val: 'mixed', label: 'Mixed' },
            ] as const).map(({ val, label }) => (
              <button
                key={val}
                onClick={() => setFilterPlatform(val)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                style={{
                  backgroundColor: filterPlatform === val ? 'var(--action-red)' : '#f1f5f9',
                  color: filterPlatform === val ? '#fff' : '#64748b',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Season */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-500 w-16 flex-shrink-0">Seizoen</span>
            {([
              { val: 'all', label: 'Alle' },
              { val: 'spring', label: 'Lente' },
              { val: 'summer', label: 'Zomer' },
              { val: 'autumn', label: 'Herfst' },
              { val: 'winter', label: 'Winter' },
            ] as const).map(({ val, label }) => (
              <button
                key={val}
                onClick={() => setFilterSeason(val)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                style={{
                  backgroundColor: filterSeason === val ? 'var(--action-red)' : '#f1f5f9',
                  color: filterSeason === val ? '#fff' : '#64748b',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Category (dynamic) */}
          {availableCategories.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-500 w-16 flex-shrink-0">Categorie</span>
              <button
                onClick={() => setFilterCategory('all')}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                style={{
                  backgroundColor: filterCategory === 'all' ? 'var(--action-red)' : '#f1f5f9',
                  color: filterCategory === 'all' ? '#fff' : '#64748b',
                }}
              >
                Alle
              </button>
              {availableCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: filterCategory === cat ? 'var(--action-red)' : '#f1f5f9',
                    color: filterCategory === cat ? '#fff' : '#64748b',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Reset */}
          {filtersActive && (
            <div className="flex justify-end">
              <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors">
                Filters resetten
              </button>
            </div>
          )}
        </div>
      )}

      {/* Ranked list */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((pred, i) => (
            <RankedProductRow key={`${pred.productName}-${i}`} prediction={pred} rank={i + 1} onSelect={() => setSelectedProduct(pred)} />
          ))}
        </div>
      )}

      {/* Filtered empty state */}
      {!loading && !error && predictions.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm font-medium text-gray-500">Geen producten gevonden met deze filters</p>
          <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-600 underline mt-2 transition-colors">
            Filters resetten
          </button>
        </div>
      )}

      {/* Product detail drawer */}
      {selectedProduct && (
        <ProductDetailDrawer prediction={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}

      {/* Empty state */}
      {!loading && !error && predictions.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm font-medium text-gray-500">No predictions available</p>
          <p className="text-xs text-gray-400 mt-1">Click Refresh to run the analysis</p>
        </div>
      )}
    </div>
  )
}

// ─── Ranked Product Row ───────────────────────────────────────────────────────

function RankedProductRow({ prediction, rank, onSelect }: { prediction: ProductPrediction; rank: number; onSelect: () => void }) {
  const [showConcept, setShowConcept] = useState(false)
  const { isSaved, toggleSave } = useSaved()
  const saved = isSaved(prediction)

  const scoreColor =
    prediction.trendScore >= 80 ? '#16a34a' :
    prediction.trendScore >= 60 ? '#d97706' : '#dc2626'

  const rankColor =
    rank === 1 ? '#ca8a04' :
    rank === 2 ? '#71717a' :
    rank === 3 ? '#b45309' :
    '#9ca3af'

  const platform = PLATFORM_STYLES[prediction.platformBuzz] ?? PLATFORM_STYLES.mixed
  const searchUrl = `https://www.action.com/nl-nl/search/?q=${encodeURIComponent(prediction.searchTerm)}`
  const linkUrl = prediction.productUrl || searchUrl

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer" onClick={onSelect}>
      {/* Rank */}
      <div className="w-8 flex-shrink-0 flex flex-col items-center pt-1.5">
        <span
          className="text-sm font-black tabular-nums leading-none"
          style={{ color: rankColor }}
        >
          #{rank}
        </span>
      </div>

      {/* Image */}
      <div className="w-20 h-20 flex-shrink-0 rounded-lg bg-gray-50 overflow-hidden border border-gray-100">
        {prediction.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={prediction.imageUrl}
              alt={prediction.productName ?? prediction.productType}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain p-1.5"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                const fallback = e.currentTarget.nextElementSibling as HTMLElement | null
                if (fallback) fallback.style.display = 'flex'
              }}
            />
            <div className="items-center justify-center h-full w-full bg-gray-50" style={{ display: 'none' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Name + price + score */}
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2 flex-1">
            {prediction.productName ?? prediction.productType}
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            {prediction.price != null && (
              <span className="text-sm font-bold" style={{ color: 'var(--action-red)' }}>
                €{prediction.price.toFixed(2)}
              </span>
            )}
            <span
              className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: scoreColor }}
            >
              {prediction.trendScore}/100
            </span>
          </div>
        </div>

        {/* Platform + video format + content angles */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{ backgroundColor: platform.bg, color: platform.text }}
          >
            {platform.label}
          </span>
          {prediction.videoFormat && (
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}
            >
              {prediction.videoFormat}
            </span>
          )}
          {Array.isArray(prediction.contentAngles) && prediction.contentAngles.slice(0, 2).map((angle) => (
            <span
              key={angle}
              className="px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}
            >
              {angle}
            </span>
          ))}
        </div>

        {/* Target audience chips */}
        {Array.isArray(prediction.targetAudience) && prediction.targetAudience.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {prediction.targetAudience.map((aud) => (
              <span
                key={aud}
                className="px-1.5 py-0.5 rounded text-xs"
                style={{ backgroundColor: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}
              >
                {aud.replace('_', ' ')}
              </span>
            ))}
          </div>
        )}

        {/* Hook */}
        {prediction.hook && (
          <div
            className="px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: '#eff6ff', borderLeft: '2px solid #3b82f6' }}
          >
            <p className="text-xs font-medium italic" style={{ color: '#1d4ed8' }}>
              &ldquo;{prediction.hook}&rdquo;
            </p>
          </div>
        )}

        {/* Reasoning */}
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
          {prediction.reasoning}
        </p>

        {/* All 6 criteria scores */}
        {(() => {
          const scores = [
            { label: 'Viral', val: prediction.viralPotential },
            { label: 'Prijs', val: prediction.priceQuality },
            { label: 'Cadeau', val: prediction.giftPotential },
            { label: 'Seizoen', val: prediction.seasonalRelevance },
            { label: 'Nut', val: prediction.practicalUtility },
            { label: 'Innovatie', val: prediction.innovation },
          ].filter((s): s is { label: string; val: number } => s.val != null && s.val > 0)
          if (scores.length === 0) return null
          return (
            <div className="flex flex-wrap gap-1.5">
              {scores.map((s) => (
                <span
                  key={s.label}
                  className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: s.val >= 8 ? '#dcfce7' : s.val >= 6 ? '#fef9c3' : '#fee2e2',
                    color: s.val >= 8 ? '#15803d' : s.val >= 6 ? '#a16207' : '#dc2626',
                  }}
                >
                  {s.label} {s.val}/10
                </span>
              ))}
            </div>
          )
        })()}

        {/* Signals + link + content idea toggle */}
        <div className="flex items-center justify-between gap-3">
          {Array.isArray(prediction.topSignals) && prediction.topSignals.length > 0 && (
            <div className="flex flex-wrap gap-x-3 min-w-0">
              {prediction.topSignals.slice(0, 2).map((signal, si) => (
                <span key={si} className="text-xs text-gray-400 flex items-center gap-1 min-w-0">
                  <span className="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0" />
                  <span className="line-clamp-1">{signal}</span>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 flex-shrink-0">
            {prediction.contentConcept && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowConcept((v) => !v) }}
                className="text-xs font-medium transition-colors"
                style={{ color: showConcept ? '#6b7280' : '#7c3aed' }}
              >
                {showConcept ? 'Hide idea' : 'Content idea ↓'}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); toggleSave(prediction) }}
              title={saved ? 'Verwijder uit opgeslagen' : 'Opslaan'}
              className="flex items-center justify-center transition-colors"
              style={{ color: saved ? 'var(--action-red)' : '#d1d5db' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
            <a
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs font-medium transition-colors"
              style={{ color: 'var(--action-red)' }}
            >
              View →
            </a>
          </div>
        </div>

        {/* Content concept (collapsible) */}
        {showConcept && prediction.contentConcept && (
          <div
            className="px-3 py-2.5 rounded-lg mt-1 space-y-1.5"
            style={{ backgroundColor: '#faf5ff', border: '1px solid #e9d5ff' }}
          >
            <p className="text-xs font-semibold" style={{ color: '#7c3aed' }}>
              Video concept{prediction.requiresPerson === false ? ' · geen creator nodig' : ''}
            </p>
            <p className="text-xs leading-relaxed" style={{ color: '#6b21a8' }}>
              {prediction.contentConcept}
            </p>
            {prediction.callToAction && (
              <p className="text-xs font-medium" style={{ color: '#7c3aed' }}>
                CTA: {prediction.callToAction}
              </p>
            )}
            {prediction.musicSuggestion && (
              <p className="text-xs" style={{ color: '#9333ea' }}>
                🎵 {prediction.musicSuggestion}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Product Detail Drawer ────────────────────────────────────────────────────

function ProductDetailDrawer({ prediction, onClose }: { prediction: ProductPrediction; onClose: () => void }) {
  const { isSaved, toggleSave } = useSaved()
  const saved = isSaved(prediction)
  const [pinterestMatches, setPinterestMatches] = useState<PinterestTrendRow[]>([])

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/trends/pinterest')
      .then((r) => r.json())
      .then((data) => {
        const trends: PinterestTrendRow[] = data.trends ?? []
        if (trends.length === 0 || cancelled) return
        return apiFetch('/api/trends/pinterest-match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product: prediction, trends }),
        })
          .then((r) => r.json())
          .then((res) => { if (!cancelled) setPinterestMatches(res.matches ?? []) })
      })
      .catch(() => { /* non-critical */ })
    return () => { cancelled = true }
  }, [prediction.searchTerm, prediction.productName, prediction.category])

  const platform = PLATFORM_STYLES[prediction.platformBuzz] ?? PLATFORM_STYLES.mixed
  const searchUrl = `https://www.action.com/nl-nl/search/?q=${encodeURIComponent(prediction.searchTerm)}`
  const linkUrl = prediction.productUrl || searchUrl

  const scoreColor = (val: number) => val >= 8 ? '#16a34a' : val >= 5 ? '#d97706' : '#dc2626'

  const overallColor =
    prediction.trendScore >= 80 ? '#16a34a' :
    prediction.trendScore >= 60 ? '#d97706' : '#dc2626'

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col h-full">
        {/* Sticky header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-start justify-between gap-3 z-10 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">
              {prediction.productName ?? prediction.productType}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {prediction.price != null && (
                <span className="text-xs font-bold" style={{ color: 'var(--action-red)' }}>
                  €{prediction.price.toFixed(2)}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: overallColor }}>
                {prediction.trendScore}/100
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: platform.bg, color: platform.text }}>
                {platform.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-300 transition-colors"
            >
              View →
            </a>
            <button
              onClick={() => toggleSave(prediction)}
              title={saved ? 'Verwijder uit opgeslagen' : 'Opslaan'}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: saved ? 'var(--action-red)' : '#9ca3af', backgroundColor: saved ? '#fff5f5' : 'transparent' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Product image */}
          {prediction.imageUrl && (
            <div className="flex justify-center">
              <div className="w-32 h-32 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={prediction.imageUrl}
                  alt={prediction.productName ?? prediction.productType}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain p-3"
                />
              </div>
            </div>
          )}

          {/* Score Breakdown */}
          <div>
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-3">Score Breakdown</h3>
            <div className="space-y-2.5">
              {([
                { label: 'Virale Potentie', val: prediction.viralPotential },
                { label: 'Prijs-Kwaliteit', val: prediction.priceQuality },
                { label: 'Cadeau Potentie', val: prediction.giftPotential },
                { label: 'Seizoen Relevantie', val: prediction.seasonalRelevance },
                { label: 'Praktisch Nut', val: prediction.practicalUtility },
                { label: 'Innovatie', val: prediction.innovation },
              ] as { label: string; val: number | null | undefined }[]).map(({ label, val }) =>
                val != null ? (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 flex-shrink-0" style={{ width: 140 }}>{label}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${val * 10}%`, backgroundColor: scoreColor(val) }}
                      />
                    </div>
                    <span className="text-xs font-bold w-8 text-right tabular-nums" style={{ color: scoreColor(val) }}>
                      {val}/10
                    </span>
                  </div>
                ) : null
              )}
            </div>
          </div>

          {/* Social Trend Signals */}
          <div>
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-3">Trending op Social Media</h3>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 mb-1">
                {Array.isArray(prediction.season) && prediction.season.map((s) => (
                  <span key={s} className="px-2 py-1 rounded-full text-xs font-medium"
                    style={{ backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                    {s}
                  </span>
                ))}
              </div>
              {Array.isArray(prediction.topSignals) && prediction.topSignals.map((signal, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg"
                  style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center"
                    style={{ backgroundColor: '#e0e7ff' }}>
                    <span className="text-xs font-bold" style={{ color: '#4338ca' }}>↑</span>
                  </div>
                  <p className="text-xs text-gray-700 leading-relaxed">{signal}</p>
                </div>
              ))}
              {Array.isArray(prediction.targetAudience) && prediction.targetAudience.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1 items-center">
                  <span className="text-xs text-gray-400">Doelgroep:</span>
                  {prediction.targetAudience.map((aud) => (
                    <span key={aud} className="px-2 py-0.5 rounded text-xs"
                      style={{ backgroundColor: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}>
                      {aud.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              )}
              {pinterestMatches.map((t, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg"
                  style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
                  <div className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center"
                    style={{ backgroundColor: '#e60023' }}>
                    <span className="text-[10px] font-bold text-white">P</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 leading-relaxed">{t.keyword}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{t.category} · {t.region === 'US' ? '🇺🇸 VS' : t.region === 'NL' ? '🇳🇱 NL' : t.region}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Content Strategy */}
          <div>
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-3">Content Strategie</h3>
            <div className="space-y-3">
              {prediction.hook && (
                <div className="px-3 py-2.5 rounded-lg" style={{ backgroundColor: '#eff6ff', borderLeft: '3px solid #3b82f6' }}>
                  <p className="text-xs font-medium text-gray-400 mb-1">Hook</p>
                  <p className="text-sm font-medium italic" style={{ color: '#1d4ed8' }}>
                    &ldquo;{prediction.hook}&rdquo;
                  </p>
                </div>
              )}
              {prediction.contentConcept && (
                <div className="px-3 py-2.5 rounded-lg space-y-1.5"
                  style={{ backgroundColor: '#faf5ff', border: '1px solid #e9d5ff' }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold" style={{ color: '#7c3aed' }}>Video Concept</p>
                    {prediction.videoFormat && (
                      <span className="px-1.5 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: '#ede9fe', color: '#5b21b6' }}>
                        {prediction.videoFormat}
                      </span>
                    )}
                    {prediction.requiresPerson === false && (
                      <span className="text-xs text-gray-400">· geen creator nodig</span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: '#6b21a8' }}>{prediction.contentConcept}</p>
                </div>
              )}
              {Array.isArray(prediction.contentAngles) && prediction.contentAngles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {prediction.contentAngles.map((angle) => (
                    <span key={angle} className="px-2 py-1 rounded-full text-xs font-medium"
                      style={{ backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                      {angle}
                    </span>
                  ))}
                </div>
              )}
              <div className="space-y-1.5">
                {prediction.callToAction && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-400">CTA:</span>
                    <span className="text-xs font-medium" style={{ color: '#7c3aed' }}>{prediction.callToAction}</span>
                  </div>
                )}
                {prediction.musicSuggestion && (
                  <div className="flex items-center gap-2">
                    <span className="text-base">🎵</span>
                    <span className="text-xs text-gray-700">{prediction.musicSuggestion}</span>
                  </div>
                )}
                {prediction.engagementEstimate != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Verwachte engagement:</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                      style={{
                        backgroundColor: prediction.engagementEstimate >= 8 ? '#dcfce7' : '#fef9c3',
                        color: prediction.engagementEstimate >= 8 ? '#15803d' : '#a16207',
                      }}>
                      {prediction.engagementEstimate}/10
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 3 Content Ideeën */}
          {Array.isArray(prediction.conceptIdeas) && prediction.conceptIdeas.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-3">3 Content Ideeën</h3>
              <div className="space-y-2">
                {prediction.conceptIdeas.map((idea, i) => {
                  const platformStyle =
                    idea.platform === 'TikTok'
                      ? { bg: '#000', text: '#fff' }
                      : idea.platform === 'Instagram'
                      ? { bg: '#ede9fe', text: '#5b21b6' }
                      : { bg: '#dbeafe', text: '#1d4ed8' }
                  return (
                    <div key={i} className="rounded-lg border border-gray-200 px-3 py-2.5">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-semibold text-gray-900">{idea.title}</span>
                        <span
                          className="px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0"
                          style={{ backgroundColor: platformStyle.bg, color: platformStyle.text }}
                        >
                          {idea.platform}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">{idea.description}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Reasoning */}
          <div>
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2">Analyse</h3>
            <p className="text-xs text-gray-600 leading-relaxed">{prediction.reasoning}</p>
          </div>

          {/* Deep Research */}
          <DeepResearchSection prediction={prediction} />
        </div>
      </div>
    </div>
  )
}

// ─── Deep Research Section ────────────────────────────────────────────────────

function DeepResearchSection({ prediction }: { prediction: ProductPrediction }) {
  const { savedResearch, saveResearch } = useSaved()
  const key = productKey(prediction)
  const [research, setResearch] = useState<DeepResearchResult | null>(() => savedResearch[key] ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(() => !!savedResearch[key])

  const handleSaveResearch = () => {
    if (research) {
      saveResearch(prediction, research)
      setJustSaved(true)
    }
  }

  const runResearch = async () => {
    setLoading(true)
    setError(null)
    setJustSaved(false)
    try {
      const r = await apiFetch('/api/trends/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prediction }),
      })
      const data = await r.json()
      if (data.error) throw new Error(data.error)
      setResearch(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border-t border-gray-200 pt-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Deep Research</h3>
        {!research && !loading && (
          <button
            onClick={runResearch}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--action-red)' }}
          >
            🔍 Start Deep Research
          </button>
        )}
      </div>

      {!research && !loading && !error && (
        <p className="text-xs text-gray-400 leading-relaxed">
          Claude genereert 3 volledige contentscripts, een marktanalyse, trend forecast en posting strategie specifiek voor dit product (~30s).
        </p>
      )}

      {loading && (
        <div className="flex items-center gap-3 py-4">
          <div className="w-5 h-5 border-2 rounded-full animate-spin flex-shrink-0"
            style={{ borderColor: 'var(--action-red)', borderTopColor: 'transparent' }} />
          <div>
            <p className="text-xs font-medium text-gray-700">Claude analyseert dit product…</p>
            <p className="text-xs text-gray-400 mt-0.5">Marktanalyse, scripts en hashtags worden gegenereerd</p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 space-y-1">
          <p className="text-xs text-red-700">{error}</p>
          <button onClick={runResearch} className="text-xs text-red-600 font-medium underline">
            Probeer opnieuw
          </button>
        </div>
      )}

      {research && (
        <div className="space-y-4">
          {/* Market Analysis */}
          <div className="px-3 py-3 rounded-lg" style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <p className="text-xs font-semibold text-green-800 mb-1.5">Marktanalyse</p>
            <p className="text-xs text-green-900 leading-relaxed">{research.marketAnalysis}</p>
          </div>

          {/* Competitor Context */}
          <div className="px-3 py-3 rounded-lg" style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <p className="text-xs font-semibold text-gray-800 mb-1.5">Concurrentiecontext</p>
            <p className="text-xs text-gray-600 leading-relaxed">{research.competitorContext}</p>
          </div>

          {/* Audience Insights */}
          <div className="px-3 py-3 rounded-lg" style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }}>
            <p className="text-xs font-semibold text-blue-800 mb-1.5">Doelgroepinzichten</p>
            <p className="text-xs text-blue-900 leading-relaxed">{research.audienceInsights}</p>
          </div>

          {/* Content Scripts */}
          <div>
            <p className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-3">Content Scripts (3)</p>
            <div className="space-y-3">
              {research.contentScripts.map((script, i) => (
                <div key={i} className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-gray-50 border-b border-gray-200">
                    <p className="text-xs font-semibold text-gray-900">{script.title}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: '#ede9fe', color: '#5b21b6' }}>
                        {script.format}
                      </span>
                      <span className="text-xs text-gray-400">{script.duration}</span>
                    </div>
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{script.script}</p>
                    {script.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {script.hashtags.map((tag) => (
                          <span key={tag} className="text-xs font-medium" style={{ color: '#3b82f6' }}>
                            {tag.startsWith('#') ? tag : `#${tag}`}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Trend Forecast + Posting Strategy */}
          <div className="grid grid-cols-2 gap-3">
            <div className="px-3 py-3 rounded-lg" style={{ backgroundColor: '#faf5ff', border: '1px solid #e9d5ff' }}>
              <p className="text-xs font-semibold mb-1.5" style={{ color: '#7c3aed' }}>Trend Forecast</p>
              <p className="text-xs leading-relaxed" style={{ color: '#6b21a8' }}>{research.trendForecast}</p>
            </div>
            <div className="px-3 py-3 rounded-lg" style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa' }}>
              <p className="text-xs font-semibold text-orange-800 mb-1.5">Posting Strategie</p>
              <p className="text-xs text-orange-900 leading-relaxed">{research.postingStrategy}</p>
            </div>
          </div>

          {/* Hashtags */}
          <div>
            <p className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2">Hashtags</p>
            <div className="flex flex-wrap gap-1.5">
              {research.hashtagSuggestions.map((tag) => (
                <button
                  key={tag}
                  onClick={() => navigator.clipboard.writeText(tag.startsWith('#') ? tag : `#${tag}`)}
                  className="px-2 py-1 rounded-full text-xs font-medium transition-colors hover:bg-blue-100"
                  style={{ backgroundColor: '#eff6ff', color: '#1d4ed8' }}
                  title="Klik om te kopiëren"
                >
                  {tag.startsWith('#') ? tag : `#${tag}`}
                </button>
              ))}
            </div>
          </div>

          {/* Risk Assessment */}
          <div className="px-3 py-3 rounded-lg" style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
            <p className="text-xs font-semibold text-red-800 mb-1.5">Risico&apos;s &amp; Aandachtspunten</p>
            <p className="text-xs text-red-700 leading-relaxed">{research.riskAssessment}</p>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button onClick={runResearch} className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline">
              Opnieuw analyseren
            </button>
            <button
              onClick={handleSaveResearch}
              disabled={justSaved}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: justSaved ? '#f0fdf4' : 'var(--action-red)',
                color: justSaved ? '#15803d' : '#fff',
                opacity: justSaved ? 1 : undefined,
              }}
            >
              {justSaved ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Opgeslagen
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                  Onderzoek opslaan
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Saved Tab ────────────────────────────────────────────────────────────────

function SavedTab() {
  const { savedProducts, savedResearch, removeProduct, clearAll } = useSaved()
  const [selectedProduct, setSelectedProduct] = useState<ProductPrediction | null>(null)

  if (savedProducts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        <p className="text-sm font-medium text-gray-500">Geen opgeslagen producten</p>
        <p className="text-xs text-gray-400 mt-1">Klik het bladwijzer-icoon op een product om het op te slaan</p>
      </div>
    )
  }

  return (
    <div className="px-8 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">{savedProducts.length} opgeslagen {savedProducts.length === 1 ? 'product' : 'producten'}</p>
        <button
          onClick={clearAll}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors underline"
        >
          Alles verwijderen
        </button>
      </div>

      {/* Saved product cards */}
      <div className="space-y-3">
        {savedProducts.map((pred) => {
          const key = productKey(pred)
          const hasResearch = !!savedResearch[key]
          const platform = PLATFORM_STYLES[pred.platformBuzz] ?? PLATFORM_STYLES.mixed
          const overallColor = pred.trendScore >= 80 ? '#16a34a' : pred.trendScore >= 60 ? '#d97706' : '#dc2626'

          return (
            <div
              key={key}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer"
              onClick={() => setSelectedProduct(pred)}
            >
              {/* Image */}
              {pred.imageUrl ? (
                <div className="w-14 h-14 rounded-lg bg-gray-50 border border-gray-100 overflow-hidden flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pred.imageUrl} alt={pred.productName ?? pred.productType} referrerPolicy="no-referrer" className="w-full h-full object-contain p-1.5" />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-gray-300 text-xs">📦</span>
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 line-clamp-1">{pred.productName ?? pred.productType}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {pred.price != null && (
                    <span className="text-xs font-bold" style={{ color: 'var(--action-red)' }}>€{pred.price.toFixed(2)}</span>
                  )}
                  <span className="px-1.5 py-0.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: overallColor }}>
                    {pred.trendScore}/100
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: platform.bg, color: platform.text }}>
                    {platform.label}
                  </span>
                  {hasResearch && (
                    <span className="px-1.5 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                      ✓ Research opgeslagen
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1.5 line-clamp-1">{pred.reasoning}</p>
              </div>

              {/* Actions */}
              <div className="flex flex-col items-end gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setSelectedProduct(pred)}
                  className="text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-300 transition-colors"
                >
                  Open →
                </button>
                <button
                  onClick={() => removeProduct(pred)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                  title="Verwijder uit opgeslagen"
                >
                  Verwijder
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Product detail drawer */}
      {selectedProduct && (
        <ProductDetailDrawer prediction={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
    </div>
  )
}

// ─── Trends Tab ───────────────────────────────────────────────────────────────

type UnifiedPost =
  | ({ source: 'reddit' } & TrendPost)
  | ({ source: 'tiktok' } & TikTokPost)
  | ({ source: 'facebook' } & FacebookPost)

function TrendsTab() {
  const [posts, setPosts] = useState<UnifiedPost[]>([])
  const [filtered, setFiltered] = useState<UnifiedPost[]>([])
  const [pinterestTrends, setPinterestTrends] = useState<PinterestTrendRow[]>([])
  const [source, setSource] = useState<SourceFilter>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    Promise.all([
      apiFetch('/api/trends').then((r) => r.json()),
      apiFetch('/api/trends/tiktok').then((r) => r.json()),
      apiFetch('/api/trends/facebook').then((r) => r.json()),
      apiFetch('/api/trends/pinterest').then((r) => r.json()).catch(() => ({ trends: [] })),
    ])
      .then(([reddit, tiktok, facebook, pinterest]) => {
        const redditPosts: UnifiedPost[] = (Array.isArray(reddit) ? reddit : []).map((p: TrendPost) => ({ source: 'reddit' as const, ...p }))
        const tiktokPosts: UnifiedPost[] = (Array.isArray(tiktok) ? tiktok : []).map((p: TikTokPost) => ({ source: 'tiktok' as const, ...p }))
        const fbPosts: UnifiedPost[] = (Array.isArray(facebook) ? facebook : []).map((p: FacebookPost) => ({ source: 'facebook' as const, ...p }))
        setPosts([...redditPosts, ...tiktokPosts, ...fbPosts].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ))
        setPinterestTrends(pinterest.trends ?? [])
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    let result = posts
    if (source !== 'all' && source !== 'pinterest') {
      result = result.filter((p) => p.source === source)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((p) => {
        if (p.source === 'reddit') return p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
        if (p.source === 'tiktok') return p.caption.toLowerCase().includes(q) || (p.searchTerm ?? '').toLowerCase().includes(q)
        if (p.source === 'facebook') return p.caption.toLowerCase().includes(q) || (p.groupName ?? '').toLowerCase().includes(q)
        return false
      })
    }
    setFiltered(result)
  }, [posts, source, search])

  const counts = posts.reduce<Record<string, number>>(
    (acc, p) => { acc[p.source] = (acc[p.source] ?? 0) + 1; return acc },
    {}
  )

  return (
    <div className="px-8 py-6 space-y-5">
      {/* Search + source filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-shrink-0 w-64">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search trends…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-400 focus:ring-0"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {([
            { id: 'all', label: 'All', count: posts.length },
            { id: 'reddit', label: 'Reddit', count: counts.reddit ?? 0 },
            { id: 'tiktok', label: 'TikTok', count: counts.tiktok ?? 0 },
            { id: 'facebook', label: 'Facebook', count: counts.facebook ?? 0 },
            { id: 'pinterest', label: 'Pinterest', count: pinterestTrends.length },
          ] as { id: SourceFilter; label: string; count: number }[]).map((item) => {
            const isActive = source === item.id
            return (
              <button
                key={item.id}
                onClick={() => setSource(item.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                style={
                  isActive
                    ? { backgroundColor: 'var(--action-red)', borderColor: 'var(--action-red)', color: '#fff' }
                    : { backgroundColor: '#fff', borderColor: '#e5e7eb', color: '#6b7280' }
                }
              >
                {item.label}
                <span
                  className="px-1.5 py-0.5 rounded-full text-xs font-semibold"
                  style={
                    isActive
                      ? { backgroundColor: 'rgba(255,255,255,0.25)', color: '#fff' }
                      : { backgroundColor: '#f3f4f6', color: '#6b7280' }
                  }
                >
                  {item.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-5 py-4">
          <p className="text-sm font-semibold text-red-800 mb-1">Failed to load trends</p>
          <p className="text-xs text-red-700 font-mono">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="h-5 w-20 bg-gray-100 rounded-full" />
                <div className="h-4 w-14 bg-gray-100 rounded" />
              </div>
              <div className="h-4 w-4/5 bg-gray-100 rounded" />
              <div className="h-4 w-full bg-gray-100 rounded" />
              <div className="h-4 w-3/4 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500">No trending posts found</p>
          {search && <p className="text-xs text-gray-400 mt-1">Try a different search term</p>}
        </div>
      )}

      {/* Pinterest cards */}
      {!loading && source === 'pinterest' && (
        pinterestTrends.length > 0
          ? <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pinterestTrends.map((t, i) => <PinterestCard key={i} trend={t} />)}
            </div>
          : <div className="py-12 text-center text-sm text-gray-400">Geen Pinterest trends beschikbaar.</div>
      )}

      {/* Cards */}
      {!loading && source !== 'pinterest' && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((post, i) => {
            if (post.source === 'reddit') return <RedditCard key={`r-${post.id}-${i}`} post={post} />
            if (post.source === 'tiktok') return <TikTokCard key={`t-${post.id}-${i}`} post={post} />
            return <FacebookCard key={`f-${post.id}-${i}`} post={post} />
          })}
        </div>
      )}
    </div>
  )
}

// ─── Reddit Card ─────────────────────────────────────────────────────────────

function RedditCard({ post }: { post: TrendPost & { source: 'reddit' } }) {
  const colors = REDDIT_CATEGORY_COLORS[post.category] ?? { bg: '#f3f4f6', text: '#374151' }
  const snippet = post.description.length > 160 ? post.description.slice(0, 160).trimEnd() + '…' : post.description

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 hover:border-gray-300 hover:shadow-sm transition-all">
      <div className="flex items-center justify-between gap-2">
        <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: colors.bg, color: colors.text }}>
          {post.category === 'HomeDecorating' ? 'Home Decorating' : post.category === 'InteriorDesign' ? 'Interior Design' : post.category}
        </span>
        <div className="flex items-center gap-2">
          <span style={{ backgroundColor: '#fff7ed', color: '#c2410c', padding: '2px 6px', borderRadius: 9999, fontSize: 10, fontWeight: 600 }}>Reddit</span>
          <span className="text-xs text-gray-400 flex-shrink-0" title={formatDate(post.createdAt)}>{timeAgo(post.createdAt)}</span>
        </div>
      </div>
      <h3 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{post.title}</h3>
      {snippet && <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 flex-1">{snippet}</p>}
      <a
        href={post.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 hover:text-orange-700 transition-colors mt-auto"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
        </svg>
        View on Reddit
      </a>
    </div>
  )
}

// ─── TikTok Card ──────────────────────────────────────────────────────────────

function TikTokCard({ post }: { post: TikTokPost & { source: 'tiktok' } }) {
  const snippet = post.caption.length > 160 ? post.caption.slice(0, 160).trimEnd() + '…' : post.caption

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 hover:border-gray-300 hover:shadow-sm transition-all">
      <div className="flex items-center justify-between gap-2">
        {post.searchTerm && (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: '#fdf4ff', color: '#7e22ce' }}>
            {post.searchTerm}
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <span style={{ backgroundColor: '#000', color: '#fff', padding: '2px 6px', borderRadius: 9999, fontSize: 10, fontWeight: 600 }}>TikTok</span>
          <span className="text-xs text-gray-400 flex-shrink-0" title={formatDate(post.createdAt)}>{timeAgo(post.createdAt)}</span>
        </div>
      </div>
      {snippet && <p className="text-xs text-gray-600 leading-relaxed line-clamp-3 flex-1">{snippet}</p>}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>👁 {formatNum(post.views)}</span>
        <span>❤️ {formatNum(post.likes)}</span>
        <span>🔁 {formatNum(post.shares)}</span>
        {post.comments > 0 && <span>💬 {formatNum(post.comments)}</span>}
      </div>
      {post.videoUrl && (
        <a
          href={post.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors mt-auto"
          style={{ color: '#000' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.27 8.27 0 0 0 4.84 1.55V6.79a4.85 4.85 0 0 1-1.07-.1z"/>
          </svg>
          View on TikTok
        </a>
      )}
    </div>
  )
}

// ─── Facebook Card ───────────────────────────────────────────────────────────

function FacebookCard({ post }: { post: FacebookPost & { source: 'facebook' } }) {
  const snippet = post.caption.length > 160 ? post.caption.slice(0, 160).trimEnd() + '…' : post.caption

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 hover:border-gray-300 hover:shadow-sm transition-all">
      <div className="flex items-center justify-between gap-2">
        {post.groupName && (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: '#eff6ff', color: '#1d4ed8' }}>
            {post.groupName}
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <span style={{ backgroundColor: '#1877f2', color: '#fff', padding: '2px 6px', borderRadius: 9999, fontSize: 10, fontWeight: 600 }}>Facebook</span>
          <span className="text-xs text-gray-400 flex-shrink-0" title={formatDate(post.createdAt)}>{timeAgo(post.createdAt)}</span>
        </div>
      </div>
      {snippet && <p className="text-xs text-gray-600 leading-relaxed line-clamp-3 flex-1">{snippet}</p>}
      {post.topComment && (
        <p className="text-xs text-gray-400 italic border-l-2 border-gray-100 pl-2 line-clamp-2">
          &ldquo;{post.topComment.slice(0, 120)}&rdquo;
        </p>
      )}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>👍 {formatNum(post.likes)}</span>
        <span>💬 {formatNum(post.comments)}</span>
        <span>🔁 {formatNum(post.shares)}</span>
      </div>
      {post.facebookUrl && (
        <a
          href={post.facebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors mt-auto"
          style={{ color: '#1877f2' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          View post
        </a>
      )}
    </div>
  )
}

// ─── Pinterest Card ───────────────────────────────────────────────────────────

function PinterestCard({ trend }: { trend: PinterestTrendRow }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 hover:border-gray-300 hover:shadow-sm transition-all">
      <div className="flex items-center justify-between gap-2">
        <span className="px-2.5 py-1 rounded-full text-xs font-semibold capitalize" style={{ backgroundColor: '#fef2f2', color: '#b91c1c' }}>
          {trend.category.replace(/-/g, ' ')}
        </span>
        <div className="flex items-center gap-2">
          <span style={{ backgroundColor: '#e60023', color: '#fff', padding: '2px 6px', borderRadius: 9999, fontSize: 10, fontWeight: 600 }}>Pinterest</span>
          <span className="text-xs text-gray-400">{trend.region === 'US' ? '🇺🇸 VS' : trend.region === 'NL' ? '🇳🇱 NL' : trend.region}</span>
        </div>
      </div>
      <h3 className="text-sm font-semibold text-gray-900 leading-snug">{trend.keyword}</h3>
      {trend.growth_raw && (
        <p className="text-xs text-gray-500">{trend.growth_raw}</p>
      )}
      <p className="text-xs text-gray-400 mt-auto">Week {trend.week}</p>
    </div>
  )
}


// ─── Social Data Tab ──────────────────────────────────────────────────────────

interface SocialPost { platform: string; caption: string; group: string; url: string; likes: number }
interface SocialResponse {
  items: SocialPost[]
  total: number
  page: number
  totalPages: number
  platformCounts: Record<string, number>
}

const PLATFORM_BADGE: Record<string, { bg: string; color: string }> = {
  TikTok:   { bg: '#000', color: '#fff' },
  Facebook: { bg: '#1877f2', color: '#fff' },
  Reddit:   { bg: '#ff4500', color: '#fff' },
}

const SOCIAL_CACHE_KEY = 'social_posts_cache'
const SOCIAL_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function SocialDataTab() {
  const [data, setData] = useState<SocialResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [platform, setPlatform] = useState('')
  const [page, setPage] = useState(1)
  const [pinterestTrends, setPinterestTrends] = useState<PinterestTrendRow[]>([])
  const [pinterestLoading, setPinterestLoading] = useState(false)

  useEffect(() => {
    if (platform === 'Pinterest') {
      if (pinterestTrends.length > 0) return
      setPinterestLoading(true)
      apiFetch('/api/trends/pinterest')
        .then((r) => r.json())
        .then((d) => setPinterestTrends(d.trends ?? []))
        .catch(() => { /* non-critical */ })
        .finally(() => setPinterestLoading(false))
      return
    }

    const cacheKey = `${SOCIAL_CACHE_KEY}_${platform}_${page}`
    try {
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) {
        const { data: d, ts } = JSON.parse(cached)
        if (Date.now() - ts < SOCIAL_CACHE_TTL) { setData(d); setLoading(false); return }
      }
    } catch { /* ignore */ }

    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (platform) params.set('platform', platform)
    apiFetch(`/api/social-posts?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setData(d)
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ data: d, ts: Date.now() })) } catch { /* ignore */ }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [platform, page, pinterestTrends.length])

  const changePlatform = (p: string) => { setPlatform(p); setPage(1) }

  return (
    <div className="px-8 py-6 space-y-4">
      {/* Platform filter */}
      <div className="flex gap-2 flex-wrap">
        {(['', 'TikTok', 'Facebook', 'Reddit', 'Pinterest'] as const).map((p) => {
          const label = p || 'All'
          const count = p === 'Pinterest' ? pinterestTrends.length || undefined : p && data ? data.platformCounts[p] : data?.total
          return (
            <button key={label} onClick={() => changePlatform(p)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={platform === p
                ? { backgroundColor: 'var(--action-red)', color: '#fff' }
                : { backgroundColor: '#f3f4f6', color: '#374151' }}>
              {label}{count != null ? ` (${count})` : ''}
            </button>
          )
        })}
      </div>

      {/* Pinterest view */}
      {platform === 'Pinterest' && (
        pinterestLoading
          ? <div className="py-12 text-center text-sm text-gray-400">Pinterest trends laden…</div>
          : pinterestTrends.length > 0
            ? <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {pinterestTrends.map((t, i) => <PinterestCard key={i} trend={t} />)}
              </div>
            : <div className="py-12 text-center text-sm text-gray-400">Geen Pinterest trends beschikbaar.</div>
      )}

      {platform !== 'Pinterest' && loading && <div className="py-12 text-center text-sm text-gray-400">Loading posts…</div>}
      {platform !== 'Pinterest' && error && <div className="text-sm text-red-600">{error}</div>}

      {platform !== 'Pinterest' && data && !loading && (
        <>
          <div className="space-y-2">
            {data.items.map((post, i) => {
              const badge = PLATFORM_BADGE[post.platform] ?? { bg: '#6b7280', color: '#fff' }
              return (
                <div key={i} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex gap-3 items-start">
                  <span className="flex-shrink-0 px-2 py-0.5 rounded text-xs font-bold mt-0.5"
                    style={{ backgroundColor: badge.bg, color: badge.color }}>
                    {post.platform}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 line-clamp-2">{post.caption || '—'}</p>
                    {post.group && <p className="text-xs text-gray-400 mt-0.5">{post.group}</p>}
                  </div>
                  {post.url && (
                    <a href={post.url} target="_blank" rel="noopener noreferrer"
                      className="flex-shrink-0 text-xs text-blue-500 hover:underline mt-0.5">
                      Open ↗
                    </a>
                  )}
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-40"
                style={{ backgroundColor: '#f3f4f6' }}>← Vorige</button>
              <span className="text-sm text-gray-500">{page} / {data.totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages}
                className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-40"
                style={{ backgroundColor: '#f3f4f6' }}>Volgende →</button>
            </div>
          )}
        </>
      )}

    </div>
  )
}

// ─── Pinterest Card / shared type ────────────────────────────────────────────

type PinterestTrendRow = { keyword: string; category: string; growth_raw: string | null; week: string; region: string }


// ─── Pains & Gains Tab ────────────────────────────────────────────────────────

interface SourcePost { platform: string; caption: string; url: string }
interface PainGainItem { keyword: string; score: number; count: number; postIndices: number[] }
interface PainsGainsData { gains: PainGainItem[]; pains: PainGainItem[]; posts: SourcePost[] }

// v3 suffix busts cache after prompt fix for strict sentiment matching
const PAINS_CACHE_KEY = 'pains_gains_cache_v3'
const PAINS_CACHE_TTL = 60 * 60 * 1000 // 1 hour

function PainsGainsTab() {
  const [data, setData] = useState<PainsGainsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedKeyword, setSelectedKeyword] = useState<{ keyword: string; type: 'gain' | 'pain'; posts: SourcePost[] } | null>(null)

  useEffect(() => {
    // Remove old cache keys
    try { localStorage.removeItem('pains_gains_cache') } catch { /* ignore */ }
    try { localStorage.removeItem('pains_gains_cache_v2') } catch { /* ignore */ }
    try {
      const cached = localStorage.getItem(PAINS_CACHE_KEY)
      if (cached) {
        const { data: d, ts } = JSON.parse(cached)
        // Only use cache if it has the posts field (new format)
        if (Date.now() - ts < PAINS_CACHE_TTL && Array.isArray(d?.posts)) { setData(d); setLoading(false); return }
      }
    } catch { /* ignore */ }

    apiFetch('/api/trends/pains-gains')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setData(d)
        try { localStorage.setItem(PAINS_CACHE_KEY, JSON.stringify({ data: d, ts: Date.now() })) } catch { /* ignore */ }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="px-8 py-12 text-center text-sm text-gray-400">Analysing social posts…</div>
  if (error) return <div className="px-8 py-6 text-sm text-red-600">{error}</div>
  if (!data) return null

  const maxScore = Math.max(...[...data.gains, ...data.pains].map((i) => i.score), 1)

  const renderItem = (item: PainGainItem, type: 'gain' | 'pain', rank: number) => {
    const barColor = type === 'gain' ? '#16a34a' : '#dc2626'
    const pct = (item.score / maxScore) * 100
    return (
      <button
        key={item.keyword}
        onClick={() => setSelectedKeyword({ keyword: item.keyword, type, posts: (item.postIndices ?? []).map((i) => (data!.posts ?? [])[i]).filter(Boolean) })}
        className="w-full flex items-center gap-3 py-2 border-b border-gray-100 last:border-0 text-left hover:bg-gray-50 rounded transition-colors px-1"
      >
        <span className="text-xs font-bold text-gray-300 w-5 text-right flex-shrink-0">{rank}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 capitalize">{item.keyword}</p>
          <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <span className="text-sm font-bold" style={{ color: barColor }}>
            {type === 'gain' ? '+' : '-'}{item.score.toFixed(1)}
          </span>
          <p className="text-xs text-gray-400">{item.count}×</p>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" className="flex-shrink-0">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    )
  }

  return (
    <>
      <div className="px-8 py-6">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Keywords', value: data.gains.length + data.pains.length, color: '#374151' },
            { label: 'Gains', value: data.gains.length, color: '#16a34a' },
            { label: 'Pains', value: data.pains.length, color: '#dc2626' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
              <p className="text-2xl font-bold" style={{ color }}>{value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Two columns */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-bold text-green-700 mb-3">Gains (Positief)</h3>
            {data.gains.length > 0
              ? data.gains.map((item, i) => renderItem(item, 'gain', i + 1))
              : <p className="text-sm text-gray-400">Geen gevonden</p>}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-bold text-red-700 mb-3">Pains (Negatief)</h3>
            {data.pains.length > 0
              ? data.pains.map((item, i) => renderItem(item, 'pain', i + 1))
              : <p className="text-sm text-gray-400">Geen gevonden</p>}
          </div>
        </div>
      </div>

      {/* Source posts modal */}
      {selectedKeyword && (
        <KeywordPostsModal
          keyword={selectedKeyword.keyword}
          type={selectedKeyword.type}
          posts={selectedKeyword.posts}
          onClose={() => setSelectedKeyword(null)}
        />
      )}
    </>
  )
}

// ─── Keyword Posts Modal ───────────────────────────────────────────────────────

const KW_PLATFORM_BADGE: Record<string, { bg: string; color: string }> = {
  TikTok:   { bg: '#000', color: '#fff' },
  Facebook: { bg: '#1877f2', color: '#fff' },
  Reddit:   { bg: '#ff4500', color: '#fff' },
}

function KeywordPostsModal({ keyword, type, posts, onClose }: { keyword: string; type: 'gain' | 'pain'; posts: SourcePost[]; onClose: () => void }) {
  const accentColor = type === 'gain' ? '#16a34a' : '#dc2626'

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">{type === 'gain' ? 'Gain' : 'Pain'} · Bron posts</p>
            <h3 className="text-sm font-bold mt-0.5 capitalize" style={{ color: accentColor }}>{keyword}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Posts list */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
          {posts.length === 0 && (
            <p className="text-sm text-gray-400 py-6 text-center">Geen posts gevonden voor &ldquo;{keyword}&rdquo;</p>
          )}
          {posts.map((post, i) => {
            const badge = KW_PLATFORM_BADGE[post.platform] ?? { bg: '#6b7280', color: '#fff' }
            return (
              <div key={i} className="flex gap-3 items-start bg-gray-50 rounded-xl px-3 py-2.5">
                <span className="flex-shrink-0 px-2 py-0.5 rounded text-xs font-bold mt-0.5"
                  style={{ backgroundColor: badge.bg, color: badge.color }}>
                  {post.platform}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-snug line-clamp-3">{post.caption}</p>
                </div>
                {post.url && (
                  <a href={post.url} target="_blank" rel="noopener noreferrer"
                    className="flex-shrink-0 text-xs text-blue-500 hover:underline mt-0.5">↗</a>
                )}
              </div>
            )
          })}
        </div>

        {posts.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
            {posts.length} post{posts.length !== 1 ? 's' : ''} gevonden
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TikTok NL Tab ───────────────────────────────────────────────────────────

type TikTokHashtagRow = {
  id: number
  rank: number | null
  hashtag_id: string | null
  hashtag_name: string
  publish_cnt: number | null
  video_views: number | null
  scraped_at: string
}

type TikTokDetail = {
  hashtag: string
  info: any
  related_hashtags: any[]
  audience_ages: any[]
  audience_interests: any[]
  audience_countries: any[]
  videos: any[]
  scraped_at: string
}

function TikTokNLTab() {
  const [rows, setRows] = useState<TikTokHashtagRow[]>([])
  const [scraping, setScraping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openHashtag, setOpenHashtag] = useState<string | null>(null)
  const [detail, setDetail] = useState<TikTokDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const handleScrape = async () => {
    setScraping(true)
    setError(null)
    try {
      const res = await apiFetch('/api/tiktok/scrape-hashtags', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scrape failed')
      setRows(
        (data.hashtags || []).map((h: any, i: number) => ({
          id: i,
          rank: h.rank,
          hashtag_id: h.hashtag_id,
          hashtag_name: h.hashtag_name,
          publish_cnt: h.publish_cnt,
          video_views: h.video_views,
          scraped_at: new Date().toISOString(),
        })),
      )
    } catch (e: any) {
      setError(e.message)
    } finally {
      setScraping(false)
    }
  }

  const scrapeDetail = async (hashtag: string) => {
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const res = await apiFetch('/api/tiktok/hashtag-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashtag }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Detail scrape failed')
      setDetail({
        hashtag: data.hashtag,
        info: data.info,
        related_hashtags: data.relatedHashtags || [],
        audience_ages: data.audienceAges || [],
        audience_interests: data.audienceInterests || [],
        audience_countries: data.audienceCountries || [],
        videos: data.videos || [],
        scraped_at: new Date().toISOString(),
      })
    } catch (e: any) {
      setDetailError(e.message)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleDetail = (hashtag: string) => {
    setOpenHashtag(hashtag)
    scrapeDetail(hashtag)
  }

  const handleRefreshDetail = (hashtag: string) => {
    scrapeDetail(hashtag)
  }

  return (
    <div className="px-8 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            Popular Hashtags — Netherlands (last 7 days)
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            TikTok Creative Center trending hashtags for NL. Click &quot;Load detail&quot; on any hashtag to
            scrape analytics + enriched videos.
          </p>
        </div>
        <button
          onClick={handleScrape}
          disabled={scraping}
          className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--action-red)' }}
        >
          {scraping ? 'Scraping…' : rows.length ? 'Refresh' : 'Load hashtags'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {!rows.length && !scraping && (
        <div className="p-10 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
          No hashtags loaded — click &quot;Load hashtags&quot; to scrape TikTok NL trends.
        </div>
      )}

      {rows.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left w-12">#</th>
                <th className="px-4 py-2 text-left">Hashtag</th>
                <th className="px-4 py-2 text-right">Posts</th>
                <th className="px-4 py-2 text-right">Views</th>
                <th className="px-4 py-2 text-right w-32">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-400 tabular-nums">{h.rank ?? '—'}</td>
                  <td className="px-4 py-2 font-medium">#{h.hashtag_name}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                    {h.publish_cnt != null ? formatNum(h.publish_cnt) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                    {h.video_views != null ? formatNum(h.video_views) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleDetail(h.hashtag_name)}
                      className="px-3 py-1 text-xs font-medium rounded-md border border-gray-200 hover:border-gray-400"
                    >
                      Load detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openHashtag && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setOpenHashtag(null)}
        >
          <div
            className="bg-white rounded-xl max-w-6xl w-full max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                  #{openHashtag}
                </h3>
                {detail?.info && (
                  <p className="text-xs text-gray-500 mt-1">
                    {detail.info.publishCnt?.toLocaleString() || '?'} posts ·{' '}
                    {detail.info.videoViews?.toLocaleString() || '?'} views
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleRefreshDetail(openHashtag)}
                  disabled={detailLoading}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 hover:border-gray-400 disabled:opacity-50"
                >
                  {detailLoading ? 'Refreshing…' : 'Re-scrape'}
                </button>
                <button
                  onClick={() => setOpenHashtag(null)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 hover:border-gray-400"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-6">
              {detailLoading && (
                <div className="py-12 text-center text-sm text-gray-500">
                  Scraping detail + enriching videos… (can take 30–60s)
                </div>
              )}
              {detailError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {detailError}
                </div>
              )}
              {detail && !detailLoading && <TikTokDetailView detail={detail} hashtag={openHashtag} />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TikTok Detail View ──────────────────────────────────────────────────────

function TikTokDetailView({ detail, hashtag: _hashtag }: { detail: TikTokDetail; hashtag: string | null }) {
  const trend: { time?: number; value?: number }[] = detail.info?.trend || []
  const enrichedCount = detail.videos.filter((v: any) => v.metaFetched).length

  return (
    <div className="space-y-6">
      {/* Overview stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Posts (7d)"
          value={detail.info?.publishCnt?.toLocaleString() || '—'}
          subLabel={
            detail.info?.publishCntAll
              ? `${detail.info.publishCntAll.toLocaleString()} all-time`
              : undefined
          }
        />
        <StatCard
          label="Views (7d)"
          value={detail.info?.videoViews?.toLocaleString() || '—'}
          subLabel={
            detail.info?.videoViewsAll
              ? `${detail.info.videoViewsAll.toLocaleString()} all-time`
              : undefined
          }
        />
        <StatCard label="Videos" value={String(detail.videos.length)} subLabel={`${enrichedCount} enriched`} />
        <StatCard
          label="Country"
          value={detail.info?.countryInfo?.label || 'Netherlands'}
          subLabel={detail.info?.isPromoted ? 'Promoted' : 'Organic'}
        />
      </div>

      {/* Trend chart */}
      {trend.length > 1 && <TrendChart data={trend} />}

      {/* Related hashtags */}
      {detail.related_hashtags.length > 0 && (
        <Section title="Related hashtags">
          <div className="flex flex-wrap gap-2">
            {detail.related_hashtags.map((r: any, i: number) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-700 font-medium"
                title={r.publishCnt ? `${r.publishCnt.toLocaleString()} posts` : undefined}
              >
                #{r.label}
                {r.publishCnt != null && (
                  <span className="ml-1 text-gray-400">({formatNum(r.publishCnt)})</span>
                )}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Audience breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {detail.audience_ages.length > 0 && (
          <Section title="Audience age">
            <BarList items={detail.audience_ages} isPercent />
          </Section>
        )}
        {detail.audience_interests.length > 0 && (
          <Section title="Audience interests">
            <BarList items={detail.audience_interests.slice(0, 8)} isPercent />
          </Section>
        )}
        {detail.audience_countries.length > 0 && (
          <Section title="Audience countries">
            <BarList items={detail.audience_countries.slice(0, 8)} isPercent />
          </Section>
        )}
      </div>

      {/* Videos */}
      {detail.videos.length > 0 && (
        <Section title={`Top videos (${detail.videos.length})`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {detail.videos.map((v: any, i: number) => (
              <VideoCard key={v.itemId || i} video={v} />
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function StatCard({ label, value, subLabel }: { label: string; value: string; subLabel?: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold mt-1 tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
        {value}
      </p>
      {subLabel && <p className="text-xs text-gray-400 mt-0.5">{subLabel}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4
        className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {title}
      </h4>
      {children}
    </div>
  )
}

function BarList({
  items,
  isPercent,
}: {
  items: { label: string; value: number }[]
  isPercent?: boolean
}) {
  const max = Math.max(...items.map((i) => i.value), 0.0001)
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="text-xs">
          <div className="flex justify-between mb-0.5">
            <span className="text-gray-700 truncate pr-2">{it.label}</span>
            <span className="text-gray-500 tabular-nums flex-shrink-0">
              {isPercent ? `${(it.value * 100).toFixed(1)}%` : formatNum(it.value)}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(it.value / max) * 100}%`, backgroundColor: 'var(--action-red)' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function TrendChart({ data }: { data: { time?: number; value?: number }[] }) {
  const W = 800
  const H = 160
  const pad = { l: 40, r: 12, t: 10, b: 24 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b
  const points = data.filter((d) => d.value != null)
  if (points.length < 2) return null
  const vals = points.map((p) => p.value!)
  const maxV = Math.max(...vals)
  const minV = Math.min(...vals)
  const range = maxV - minV || 1
  const xAt = (i: number) => pad.l + (i / (points.length - 1)) * innerW
  const yAt = (v: number) => pad.t + innerH - ((v - minV) / range) * innerH
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.value!)}`)
    .join(' ')
  const areaPath = `${linePath} L ${xAt(points.length - 1)} ${pad.t + innerH} L ${xAt(0)} ${
    pad.t + innerH
  } Z`

  const firstLabel = points[0]?.time
    ? new Date(points[0].time! * 1000).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      })
    : ''
  const lastLabel = points[points.length - 1]?.time
    ? new Date(points[points.length - 1].time! * 1000).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      })
    : ''

  return (
    <Section title="Popularity trend">
      <div className="border border-gray-200 rounded-lg p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--action-red)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--action-red)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={pad.l}
              x2={W - pad.r}
              y1={pad.t + innerH * f}
              y2={pad.t + innerH * f}
              stroke="#f3f4f6"
              strokeWidth="1"
            />
          ))}
          <text x={pad.l - 6} y={pad.t + 4} fontSize="10" fill="#9ca3af" textAnchor="end">
            {formatNum(maxV)}
          </text>
          <text x={pad.l - 6} y={pad.t + innerH} fontSize="10" fill="#9ca3af" textAnchor="end">
            {formatNum(minV)}
          </text>
          <text x={pad.l} y={H - 6} fontSize="10" fill="#9ca3af">
            {firstLabel}
          </text>
          <text x={W - pad.r} y={H - 6} fontSize="10" fill="#9ca3af" textAnchor="end">
            {lastLabel}
          </text>
          <path d={areaPath} fill="url(#trendGradient)" />
          <path d={linePath} fill="none" stroke="var(--action-red)" strokeWidth="2" />
          {points.map((p, i) => (
            <circle key={i} cx={xAt(i)} cy={yAt(p.value!)} r="2.5" fill="var(--action-red)" />
          ))}
        </svg>
      </div>
    </Section>
  )
}

function VideoCard({ video }: { video: any }) {
  const [embed, setEmbed] = useState(false)
  const [imgError, setImgError] = useState(false)
  const itemId = video.itemId || video.id
  const embedUrl = itemId ? `https://www.tiktok.com/embed/v2/${itemId}` : null
  const thumb =
    video.thumbnail || video.coverUri || video.cover || video.dynamicCover || video.originCover || ''

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-col bg-white">
      <div className="relative aspect-[9/16] bg-gray-100">
        {embed && embedUrl ? (
          <iframe
            src={embedUrl}
            className="absolute inset-0 w-full h-full"
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
        ) : (
          <>
            {thumb && !imgError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-xs">
                No thumbnail
              </div>
            )}
            {embedUrl && (
              <button
                onClick={() => setEmbed(true)}
                className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition group"
                aria-label="Preview video"
              >
                <span className="w-14 h-14 rounded-full bg-white/90 group-hover:bg-white flex items-center justify-center shadow-lg">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="black">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </button>
            )}
          </>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1.5 text-xs">
        {video.uploader && (
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-gray-900 hover:underline truncate"
          >
            @{video.uploader}
          </a>
        )}
        {video.description && (
          <p className="text-gray-600 line-clamp-2 leading-snug">{video.description}</p>
        )}
        {(video.track || video.artist) && (
          <p className="text-gray-400 truncate">
            {video.track}
            {video.artist && ` — ${video.artist}`}
          </p>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-auto pt-1 text-gray-500 tabular-nums">
          {video.viewCount != null && <span>{formatNum(video.viewCount)} views</span>}
          {video.likeCount != null && <span>{formatNum(video.likeCount)} likes</span>}
          {video.commentCount != null && <span>{formatNum(video.commentCount)} comments</span>}
          {video.shareCount != null && <span>{formatNum(video.shareCount)} shares</span>}
        </div>
      </div>
    </div>
  )
}
