// Stored in localStorage under key 'promo-radar-store'
export interface RadarStore {
  products: Record<string, string[]> // productNumber → ["2025-W08", "2025-W09", ...]
  productNames?: Record<string, string> // productNumber → Translations NL
  uploads: UploadRecord[]
}

export interface UploadRecord {
  id: string
  filename: string
  week: number
  year: number
  uploadedAt: string   // ISO date string
  productCount: number // distinct 7-digit codes found
}

export interface ParsedWeekFile {
  products: string[]   // deduplicated 7-digit product numbers
  productNames: Record<string, string> // productNumber → Translations NL
  week: number | null  // null if not detected from filename
  year: number
  filename: string
}
