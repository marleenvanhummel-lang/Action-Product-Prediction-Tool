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
      // Country tokens
      'nl', 'netherlands', 'dutch', 'holland', 'nederland', 'nederlandse', 'nederlands',
      // Cities
      'amsterdam', 'rotterdam', 'utrecht', 'den haag', 'the hague', 'eindhoven',
      'groningen', 'maastricht', 'leeuwarden', 'tilburg', 'breda', 'nijmegen',
      'arnhem', 'haarlem', 'zwolle', 'almere', 'apeldoorn', 'enschede',
      // Cultural / iconic places
      'zandvoort', 'volendam', 'giethoorn', 'keukenhof', 'kinderdijk', 'marken',
      'efteling', 'walibi', 'duinrell',
      // Holidays / traditions
      'koningsdag', 'sinterklaas', 'oranje', 'pakjesavond', 'pepernoten',
      'oliebollen', 'speculaas', 'vrijmarkt', 'koningsnacht',
      'dodenherdenking', 'bevrijdingsdag', 'prinsjesdag', 'kinderboekenweek',
      'carnaval brabant', 'limburg', 'brabant',
      // Food / cultural items
      'hagelslag', 'stamppot', 'kapsalon', 'frikandel', 'bitterballen',
      'stroopwafel', 'stroopwafels', 'vla', 'kibbeling', 'patatje oorlog',
      'bossche bol', 'haring', 'poffertjes', 'speculaaspasta',
      // Major retailers / brands
      'albert heijn', 'jumbo supermarkt', 'hema', 'kruidvat', 'etos',
      'bol.com', 'coolblue', 'bijenkorf', 'wehkamp', 'blokker',
      'praxis', 'karwei', 'gamma nl', 'welkoop', 'anwb',
      'rituals cosmetics', 'wibra', 'dille & kamille', 'douglas nl',
      // Media / TV
      'rtl boulevard', 'rtl 4', 'rtl 5', 'rtl 7', 'npo 1', 'npo 2', 'npo 3',
      'talpa', 'sbs6', 'eo', 'avrotros', 'kro-ncrv',
      // TV shows / formats
      'wie is de mol', 'de verraders', 'boer zoekt vrouw', 'b&b vol liefde',
      'heel holland bakt', 'expeditie robinson', 'gtst',
      'goede tijden slechte tijden', 'ik hou van holland', 'de slimste mens',
      'op1', 'jinek', 'beau van erven dorens',
      // Public figures / BN'ers
      'andré hazes', 'frans bauer', 'jan smit', 'linda de mol',
      'wendy van dijk', 'chantal janzen', 'humberto tan', 'eva jinek',
      'matthijs van nieuwkerk', 'john de mol', 'famke louise', 'ronnie flex',
      'snelle', 'tiësto', 'martin garrix', 'hardwell', 'sara geurts',
      'doutzen kroes', 'yolanthe cabau', 'sylvie meis', 'anouk',
      'max verstappen', 'memphis depay', 'virgil van dijk',
      'frenkie de jong', 'wesley sneijder', 'sven kramer',
      'erik ten hag', 'ten hag', 'patrick kluivert',
      // Football
      'eredivisie', 'ajax', 'feyenoord', 'psv', 'az alkmaar',
      'fc utrecht', 'vitesse', 'fc twente', 'knvb',
      // Sources spotted earlier
      'ns_online', 'ikeanederland', 'albert heijn', 'jumbo',
      // Dutch slang
      'lekker', 'gezellig', 'tikkie', 'bakfiets', 'kakker',
    ],
  },
  {
    country: 'BE',
    signals: [
      // Tokens
      'belgium', 'belgian', 'belgië', 'belgique', 'flemish', 'flanders',
      'wallonian', 'wallon', 'wallonia', 'vlaams', 'vlaamse',
      // Cities
      'brussels', 'brussel', 'antwerp', 'antwerpen', 'ghent', 'gent',
      'liège', 'bruges', 'brugge', 'leuven', 'mechelen', 'mons', 'namur',
      'charleroi', 'ostend', 'oostende',
      // Cultural
      'tomorrowland boom', 'rock werchter', 'pukkelpop',
      'sint-niklaas', 'koningsdag belgië', 'fête nationale belge',
      // Brands
      'colruyt', 'delhaize', 'carrefour belgium', 'kruidvat belgië',
      'duvel', 'leffe', 'jupiler', 'stella artois',
      // Media / TV
      'vtm', 'één', 'canvas', 'play4', 'sporza',
      // Public figures
      'stromae', 'angèle', 'k3', 'marc coucke', 'damso',
      'eden hazard', 'kevin de bruyne', 'romelu lukaku',
      // Food
      'frieten', 'frietjes', 'speculoos', 'belgian chocolate',
      'belgian waffle', 'gauffre', 'wafel',
    ],
  },
  {
    country: 'FR',
    signals: [
      // Tokens
      'france', 'french', 'française', 'francais', 'française',
      // Cities
      'paris', 'parisian', 'lyon', 'marseille', 'toulouse', 'bordeaux',
      'nice', 'nantes', 'strasbourg', 'montpellier', 'lille', 'rennes',
      // Iconic
      'bastille', 'champs-élysées', 'eiffel', 'louvre', 'versailles',
      'cannes', 'côte d\'azur', 'provence', 'normandie',
      // Events
      'tour de france', 'roland-garros', 'le mans 24',
      'fête de la musique', 'fête des mères', 'fête des pères',
      'fête nationale', '14 juillet', 'quatorze juillet',
      // Brands
      'carrefour', 'leclerc', 'auchan', 'monoprix', 'fnac', 'darty',
      'l\'oréal', 'sephora france', 'lvmh', 'kenzo', 'chanel',
      // Media / TV
      'tf1', 'france 2', 'france 3', 'canal+', 'm6', 'arte',
      'le figaro', 'le monde', 'libération',
      // Public figures
      'macron', 'mbappé', 'griezmann', 'pogba',
      'aya nakamura', 'stromae', 'angèle',
      // Food
      'croissant', 'baguette', 'fromage', 'wine', 'crêpe',
      'macaron', 'pain au chocolat',
    ],
  },
  {
    country: 'DE',
    signals: [
      // Tokens
      'germany', 'german', 'deutsche', 'deutsch', 'deutschland', 'deutscher',
      // Cities
      'berlin', 'münchen', 'munich', 'hamburg', 'frankfurt', 'köln', 'cologne',
      'düsseldorf', 'stuttgart', 'dresden', 'leipzig', 'hannover', 'nürnberg',
      'bremen', 'dortmund', 'essen',
      // Events
      'oktoberfest', 'karneval', 'christkindlmarkt', 'weihnachtsmarkt',
      'christi himmelfahrt', 'muttertag', 'vatertag', 'pfingsten',
      // Sport
      'bundesliga', 'bayern münchen', 'borussia dortmund', 'rb leipzig',
      'schalke', 'eintracht frankfurt',
      // Brands
      'rewe', 'edeka', 'aldi', 'lidl deutschland', 'kaufland', 'dm drogerie',
      'rossmann', 'mediamarkt', 'saturn', 'otto.de', 'zalando',
      'bmw', 'mercedes', 'audi', 'volkswagen', 'porsche',
      // Media
      'ard', 'zdf', 'rtl', 'pro7', 'sat.1',
      'bild', 'spiegel', 'zeit',
      // Public figures
      'scholz', 'merkel', 'helene fischer', 'cro', 'shirin david',
      'capital bra', 'apache 207',
      // Food
      'bratwurst', 'currywurst', 'sauerkraut', 'pretzel', 'brezel',
      'schnitzel', 'döner kebab',
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
      'spain', 'spanish', 'españa', 'española', 'español',
      'madrid', 'barcelona', 'valencia', 'seville', 'sevilla',
      'málaga', 'bilbao', 'zaragoza', 'palma', 'mallorca', 'ibiza',
      'la liga', 'real madrid', 'fc barcelona', 'atlético madrid',
      'sevilla fc', 'valencia cf',
      'día de la madre', 'día del padre', 'reyes magos', 'día de los reyes',
      'feria de abril', 'la tomatina', 'san fermín',
      'corrida', 'flamenco', 'tapas', 'paella',
      'mercadona', 'el corte inglés', 'carrefour españa',
      'rosalía', 'aitana', 'penélope cruz', 'pedro almodóvar',
      'rafa nadal', 'sergio ramos', 'iniesta', 'gerard piqué',
    ],
  },
  {
    country: 'IT',
    signals: [
      'italy', 'italian', 'italia', 'italiana', 'italiano',
      'milan', 'milano', 'rome', 'roma', 'naples', 'napoli',
      'venice', 'venezia', 'florence', 'firenze', 'turin', 'torino',
      'bologna', 'palermo', 'genova', 'verona', 'sicilia', 'sardegna',
      'serie a italy', 'juventus', 'inter milan', 'ac milan',
      'as roma', 'napoli calcio',
      'ferragosto', 'festa della donna', 'santo stefano',
      'epifania befana', 'carnevale venezia',
      'pasta italiana', 'pizza italiana', 'gelato', 'aperol spritz',
      'parmigiano', 'prosciutto', 'tiramisù', 'cannoli',
      'esselunga', 'coop italia', 'conad', 'eataly',
      'måneskin', 'damiano david', 'sanremo',
      'chiara ferragni', 'fedez',
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
