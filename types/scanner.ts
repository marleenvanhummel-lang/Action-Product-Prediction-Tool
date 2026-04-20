export type CountryCode =
  | 'nl' | 'fr' | 'de' | 'be' | 'es' | 'it' | 'pl' | 'cz' | 'sk' | 'hu' | 'at' | 'ch' | 'ro' | 'pt'

export interface ScanConfig {
  targetCountries: CountryCode[]
  enableLanguageCheck: boolean
  enablePriceCheck: boolean
  enableBrandCheck: boolean
}

export interface ProcessableFile {
  id: string
  filename: string
  mimeType: string
  base64: string
  objectUrl: string
  sizeBytes: number
  file?: File
}

export interface LanguageCheckResult {
  enabled: boolean
  detected_languages: string[]
  text_found: boolean
  language_correct: boolean | null
  language_issues: string[]
  confidence: 'high' | 'medium' | 'low'
}

export interface PriceCheckResult {
  enabled: boolean
  price_visible: boolean
  price_in_image: string | null
  currency_symbol: string | null
  price_format_correct: boolean | null
  website_prices: { country: string; price: number; match: boolean }[] | null
  notes: string
}

export interface BrandCheckResult {
  enabled: boolean
  action_logo_present: boolean
  logo_usage_correct: boolean | null
  brand_colors_present: boolean
  brand_colors_correct: boolean | null
  text_readable: boolean
  offensive_content: boolean
  quality_issues: string[]
  overall_quality: 'good' | 'acceptable' | 'poor'
}

export interface ImageResult {
  id: string
  filename: string
  objectUrl: string
  status: 'pass' | 'fail' | 'warning' | 'error' | 'pending'
  processedAt: string
  languageCheck: LanguageCheckResult | null
  priceCheck: PriceCheckResult | null
  brandCheck: BrandCheckResult | null
  summary: string
  error?: string
}

export interface ScanSession {
  id: string
  status: 'running' | 'complete' | 'cancelled' | 'error'
  total: number
  processed: number
  results: ImageResult[]
  config: ScanConfig
  createdAt: number
}

export interface ScanSummary {
  total: number
  passed: number
  failed: number
  warnings: number
  errors: number
  durationMs: number
}

export type ScanStreamEvent =
  | { type: 'progress'; processed: number; total: number; currentFile: string }
  | { type: 'result'; result: ImageResult }
  | { type: 'complete'; summary: ScanSummary }
  | { type: 'error'; message: string }

export interface PriceLookupRequest {
  productName: string
  priceInImage: string
  countries: CountryCode[]
}

export interface PriceLookupResult {
  success: boolean
  results: { country: string; found: boolean; price: number; url: string; match: boolean }[]
  error: string | null
}
