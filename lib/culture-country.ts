/**
 * Culture Radar — country-relevance detection.
 *
 * Tags trends with the Action countries where they are specifically relevant.
 * Empty array = global (shown on every country filter). Used by the country
 * filter chips on the dashboard.
 *
 * Detection is pattern-based, conservative: only set a country tag when there
 * is a clear textual signal. We default to "global" rather than guessing.
 */

import type { ActionCountry } from '@/types/culture'

interface CountrySignals {
  country: ActionCountry
  // Strings that, when found in trend text, indicate the trend is about this country.
  // Word-boundary regex applied at runtime; keep entries lowercase.
  signals: string[]
}

const COUNTRY_SIGNALS: CountrySignals[] = [
  {
    country: 'NL',
    signals: [
      'nl', 'netherlands', 'dutch', 'holland', 'nederland', 'nederlandse',
      'amsterdam', 'rotterdam', 'utrecht', 'den haag', 'the hague', 'eindhoven',
      'koningsdag', 'sinterklaas', 'oranje', 'pakjesavond', 'hagelslag',
      'eredivisie', 'ajax', 'feyenoord', 'psv',
      'ns_online', 'ikeanederland', 'albert heijn', 'jumbo',
      'erik ten hag', 'ten hag',
    ],
  },
  {
    country: 'BE',
    signals: [
      'belgium', 'belgian', 'belgië', 'flemish', 'wallonian', 'wallon',
      'brussels', 'brussel', 'antwerp', 'antwerpen', 'ghent', 'gent', 'liège',
      'tomorrowland boom', 'rock werchter',
      'koningsdag belgië',
    ],
  },
  {
    country: 'FR',
    signals: [
      'france', 'french', 'française', 'francais', 'paris', 'parisian',
      'bastille', 'champs-élysées', 'eiffel', 'cannes',
      'tour de france', 'roland-garros',
      'fête de la musique', 'fête des mères', 'fête des pères',
    ],
  },
  {
    country: 'DE',
    signals: [
      'germany', 'german', 'deutsche', 'deutschland',
      'berlin', 'münchen', 'munich', 'hamburg', 'frankfurt', 'köln', 'cologne',
      'oktoberfest', 'bundesliga',
      'christi himmelfahrt', 'muttertag', 'vatertag',
    ],
  },
  {
    country: 'AT',
    signals: [
      'austria', 'austrian', 'österreich', 'wien', 'vienna', 'salzburg', 'graz',
      'fronleichnam', 'stefanitag', 'mariä himmelfahrt',
    ],
  },
  {
    country: 'CH',
    signals: [
      'switzerland', 'swiss', 'schweiz', 'suisse', 'svizzera',
      'zurich', 'zürich', 'geneva', 'genève', 'basel', 'bern',
      'auffahrt', 'bundesfeier',
    ],
  },
  {
    country: 'ES',
    signals: [
      'spain', 'spanish', 'españa', 'española',
      'madrid', 'barcelona', 'valencia', 'seville', 'sevilla',
      'la liga', 'real madrid', 'fc barcelona',
      'día de la madre', 'día del padre', 'reyes magos', 'día de los reyes',
      'corrida', 'flamenco',
    ],
  },
  {
    country: 'IT',
    signals: [
      'italy', 'italian', 'italia', 'italiana',
      'milan', 'milano', 'rome', 'roma', 'naples', 'napoli', 'venice', 'venezia',
      'serie a', 'juventus', 'inter', 'milan ac',
      'ferragosto', 'festa della donna', 'santo stefano',
      'pasta', 'pizza italiana',
    ],
  },
  {
    country: 'PL',
    signals: [
      'poland', 'polish', 'polska', 'polskie',
      'warsaw', 'warszawa', 'krakow', 'kraków', 'gdansk',
      'dzień matki', 'dzień ojca', 'trzech króli', 'wniebowstąpienie',
      'święto konstytucji',
    ],
  },
  {
    country: 'CZ',
    signals: [
      'czech', 'czechia', 'česko', 'české', 'prague', 'praha', 'brno',
      'den matek', 'svátek vánoční', 'svatý václav',
    ],
  },
  {
    country: 'SK',
    signals: [
      'slovak', 'slovakia', 'slovenská', 'bratislava', 'košice',
      'deň matiek', 'tri kráľovia',
    ],
  },
  {
    country: 'HU',
    signals: [
      'hungary', 'hungarian', 'magyar', 'magyarország',
      'budapest', 'sziget',
      'anyák napja', 'szent istván',
    ],
  },
  {
    country: 'RO',
    signals: [
      'romania', 'romanian', 'românia', 'românească',
      'bucharest', 'bucurești', 'cluj',
      'ziua mamei', 'ziua națională',
    ],
  },
  {
    country: 'PT',
    signals: [
      'portugal', 'portuguese', 'portuguesa',
      'lisbon', 'lisboa', 'porto',
      'dia da mãe', 'dia do pai', 'dia de portugal', 'santos populares',
    ],
  },
]

/**
 * Returns the set of Action countries where the trend is specifically
 * relevant. Empty array means global (shown on every country filter).
 */
export function detectTrendCountries(input: {
  name: string
  description: string
  hashtags?: string[]
  sourceNames?: string[]
  reasoning?: string | null
}): ActionCountry[] {
  const text = [
    input.name,
    input.description,
    (input.hashtags ?? []).join(' '),
    (input.sourceNames ?? []).join(' '),
    input.reasoning ?? '',
  ]
    .join(' ')
    .toLowerCase()

  const found = new Set<ActionCountry>()

  for (const cs of COUNTRY_SIGNALS) {
    for (const signal of cs.signals) {
      // Word-boundary safe — escape regex specials, accept "fr" only as
      // standalone word, accept "nederlands" as substring (it's a
      // distinctive Dutch token even inside compounds).
      if (signal.length <= 2) {
        // Short codes (NL, FR, BE, etc.) — require word boundary
        const re = new RegExp(`(^|[\\s#,()\\[\\]:.!?])${escapeRegex(signal)}([\\s#,()\\[\\]:.!?]|$)`, 'i')
        if (re.test(text)) {
          found.add(cs.country)
          break
        }
      } else {
        if (text.includes(signal)) {
          found.add(cs.country)
          break
        }
      }
    }
  }

  return Array.from(found)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
