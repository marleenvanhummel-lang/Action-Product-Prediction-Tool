import type { CountryCode } from '@/types/scanner'

export const BATCH_SIZE = 10
export const MAX_FILES = 700
export const MAX_FILE_SIZE_MB = 20
export const SCRAPER_TIMEOUT_MS = 8000
export const GEMINI_MODEL = 'gemini-2.5-flash'
export const SESSION_POLL_INTERVAL_MS = 500

export const ACTION_BRAND = {
  primaryRed: '#E3000F',
  white: '#FFFFFF',
  darkGray: '#1A1A1A',
  lightGray: '#F5F5F5',
}

export const COUNTRY_LABELS: Record<CountryCode, string> = {
  nl: 'Netherlands (NL)',
  fr: 'France (FR)',
  de: 'Germany (DE)',
  be: 'Belgium (BE)',
  es: 'Spain (ES)',
  it: 'Italy (IT)',
  pl: 'Poland (PL)',
  cz: 'Czech Republic (CZ)',
  sk: 'Slovakia (SK)',
  hu: 'Hungary (HU)',
  at: 'Austria (AT)',
  ch: 'Switzerland (CH)',
  ro: 'Romania (RO)',
  pt: 'Portugal (PT)',
}

export const COUNTRY_LANGUAGES: Record<CountryCode, string[]> = {
  nl: ['Dutch'],
  fr: ['French'],
  de: ['German'],
  be: ['Dutch', 'French'],
  es: ['Spanish'],
  it: ['Italian'],
  pl: ['Polish'],
  cz: ['Czech'],
  sk: ['Slovak'],
  hu: ['Hungarian'],
  at: ['German'],
  ch: ['German', 'French', 'Italian'],
  ro: ['Romanian'],
  pt: ['Portuguese'],
}

export const ACTION_COUNTRY_URLS: Record<string, string> = {
  nl: 'https://www.action.com/nl-nl',
  fr: 'https://www.action.com/fr-fr',
  de: 'https://www.action.com/de-de',
  be: 'https://www.action.com/nl-be',
  es: 'https://www.action.com/es-es',
  it: 'https://www.action.com/it-it',
  pl: 'https://www.action.com/pl-pl',
  cz: 'https://www.action.com/cs-cz',
  sk: 'https://www.action.com/sk-sk',
  hu: 'https://www.action.com/hu-hu',
  at: 'https://www.action.com/de-at',
  ch: 'https://www.action.com/de-ch',
  ro: 'https://www.action.com/ro-ro',
  pt: 'https://www.action.com/pt-pt',
}

export const ALL_COUNTRIES: CountryCode[] = [
  'nl', 'fr', 'de', 'be', 'es', 'it', 'pl', 'cz', 'sk', 'hu', 'at', 'ch', 'ro', 'pt',
]

export const ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]
