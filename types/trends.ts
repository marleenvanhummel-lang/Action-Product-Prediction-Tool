export interface TrendPost {
  id: string
  createdAt: string
  title: string
  description: string
  url: string
  category: string
}

export interface TikTokPost {
  id: string
  createdAt: string
  caption: string
  videoUrl: string
  views: number
  likes: number
  shares: number
  comments: number
  searchTerm: string
  tags: string | null
  isAd: boolean
}

export interface FacebookPost {
  id: string
  createdAt: string
  caption: string
  facebookUrl: string
  likes: number
  comments: number
  shares: number
  topComment: string | null
  groupName: string
}

export interface ProductPrediction {
  productType: string
  searchTerm: string
  trendScore: number
  reasoning: string
  topSignals: string[]
  productName: string | null
  imageUrl: string | null
  productUrl: string | null
  price: number | null
  category: string
  season: string[]        // e.g. ["winter", "spring"]
  contentAngles: string[] // e.g. ["Room tour", "Haul", "Before/After"]
  platformBuzz: string    // "tiktok" | "reddit" | "facebook" | "mixed"
  hook?: string | null           // e.g. "POV: je koopt dit voor €2 bij Action"
  contentConcept?: string | null // e.g. "Film jezelf terwijl je dit product uitpakt..."
  // 6-criteria scores (1–10, from Lovable pipeline)
  priceQuality?: number | null
  innovation?: number | null
  practicalUtility?: number | null
  giftPotential?: number | null
  seasonalRelevance?: number | null
  viralPotential?: number | null
  // Richer content concept fields
  targetAudience?: string[] | null
  videoFormat?: string | null
  requiresPerson?: boolean | null
  callToAction?: string | null
  musicSuggestion?: string | null
  engagementEstimate?: number | null
  conceptIdeas?: ConceptIdea[] | null
}

export interface ConceptIdea {
  title: string
  description: string
  platform: string
}

export interface ContentScript {
  title: string
  format: string
  script: string
  duration: string
  hashtags: string[]
}

export interface DeepResearchResult {
  marketAnalysis: string
  competitorContext: string
  contentScripts: ContentScript[]
  trendForecast: string
  postingStrategy: string
  hashtagSuggestions: string[]
  riskAssessment: string
  audienceInsights: string
}
