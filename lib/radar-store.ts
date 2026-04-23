import type { RadarStore, UploadRecord } from '@/types/promo'
import { weekKey } from './product-extractor'

const STORAGE_KEY = 'promo-radar-store'
// Bumped when extraction logic changes; older stores are auto-reset on load.
// v2: product numbers only read from "Article number" column.
const STORE_VERSION = 2

export function emptyStore(): RadarStore {
  return { version: STORE_VERSION, products: {}, productNames: {}, uploads: [] }
}

export function loadStore(): RadarStore {
  if (typeof window === 'undefined') return emptyStore()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as RadarStore
    // Auto-reset old stores that were built with the pre-Article-number extractor
    if ((parsed.version ?? 1) < STORE_VERSION) {
      const fresh = emptyStore()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
      return fresh
    }
    return parsed
  } catch {
    return emptyStore()
  }
}

function saveStore(store: RadarStore): void {
  const withVersion: RadarStore = { ...store, version: STORE_VERSION }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(withVersion))
}

/**
 * Add a new week's products to the store.
 * Returns the updated store.
 */
export function addWeekToStore(
  store: RadarStore,
  products: string[],
  week: number,
  year: number,
  filename: string,
  productNames: Record<string, string> = {},
): RadarStore {
  const key = weekKey(week, year)

  // Check for duplicate upload (same week+year already exists)
  const alreadyUploaded = store.uploads.some((u) => u.week === week && u.year === year)

  // Build updated products map
  const updatedProducts = { ...store.products }

  if (!alreadyUploaded) {
    for (const pn of products) {
      if (!updatedProducts[pn]) {
        updatedProducts[pn] = [key]
      } else if (!updatedProducts[pn].includes(key)) {
        updatedProducts[pn] = [...updatedProducts[pn], key].sort()
      }
    }
  } else {
    // Re-upload: remove old week data first, then re-add
    for (const pn of Object.keys(updatedProducts)) {
      updatedProducts[pn] = updatedProducts[pn].filter((k) => k !== key)
      if (updatedProducts[pn].length === 0) {
        delete updatedProducts[pn]
      }
    }
    for (const pn of products) {
      if (!updatedProducts[pn]) {
        updatedProducts[pn] = [key]
      } else {
        updatedProducts[pn] = [...updatedProducts[pn], key].sort()
      }
    }
  }

  const newUpload: UploadRecord = {
    id: `${year}-${week}-${Date.now()}`,
    filename,
    week,
    year,
    uploadedAt: new Date().toISOString(),
    productCount: products.length,
  }

  const updatedUploads = alreadyUploaded
    ? store.uploads
        .filter((u) => !(u.week === week && u.year === year))
        .concat(newUpload)
        .sort((a, b) => weekKey(b.week, b.year).localeCompare(weekKey(a.week, a.year)))
    : [...store.uploads, newUpload].sort((a, b) =>
        weekKey(b.week, b.year).localeCompare(weekKey(a.week, a.year)),
      )

  // Merge product names — keep existing, add new ones from this upload
  const mergedNames: Record<string, string> = { ...(store.productNames ?? {}) }
  for (const [pn, name] of Object.entries(productNames)) {
    if (name && name.trim()) mergedNames[pn] = name.trim()
  }

  const updated: RadarStore = { products: updatedProducts, productNames: mergedNames, uploads: updatedUploads }
  saveStore(updated)
  return updated
}

/**
 * Delete a week from the store (removes its contributions from all products).
 */
export function deleteWeekFromStore(store: RadarStore, week: number, year: number): RadarStore {
  const key = weekKey(week, year)
  const updatedProducts = { ...store.products }

  for (const pn of Object.keys(updatedProducts)) {
    updatedProducts[pn] = updatedProducts[pn].filter((k) => k !== key)
    if (updatedProducts[pn].length === 0) {
      delete updatedProducts[pn]
    }
  }

  const updatedUploads = store.uploads.filter((u) => !(u.week === week && u.year === year))

  // Drop names for products that no longer appear in any week
  const remainingNames: Record<string, string> = {}
  const names = store.productNames ?? {}
  for (const pn of Object.keys(updatedProducts)) {
    if (names[pn]) remainingNames[pn] = names[pn]
  }

  const updated: RadarStore = { products: updatedProducts, productNames: remainingNames, uploads: updatedUploads }
  saveStore(updated)
  return updated
}

/** Wipe everything. */
export function clearStore(): RadarStore {
  const empty = emptyStore()
  saveStore(empty)
  return empty
}
