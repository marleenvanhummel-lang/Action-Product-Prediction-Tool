/**
 * Trend visual generator.
 *
 * Either an actual thumbnail image (from TikTok oEmbed), or — when no image
 * is available — a generated SVG poster with category color + the trend
 * name in Archivo Black.
 *
 * The poster is what differentiates this from a generic "no image"
 * placeholder — it still feels intentional, editorial, on-brand.
 */

import type { CultureTrend } from '@/types/culture'

const CATEGORY_PALETTE: Record<string, { bg: string; fg: string; accent: string }> = {
  food:      { bg: '#FFE3CC', fg: '#1a1a1a', accent: '#FF1300' },
  beauty:    { bg: '#FFD9E9', fg: '#1a1a1a', accent: '#FF1300' },
  fashion:   { bg: '#E6D9FF', fg: '#1a1a1a', accent: '#FF1300' },
  home:      { bg: '#CCEEFF', fg: '#1a1a1a', accent: '#FF1300' },
  lifestyle: { bg: '#FFF1B3', fg: '#1a1a1a', accent: '#FF1300' },
  tech:      { bg: '#D9E6FF', fg: '#1a1a1a', accent: '#FF1300' },
  meme:      { bg: '#FFCCCC', fg: '#1a1a1a', accent: '#FF1300' },
  culture:   { bg: '#E6CCFF', fg: '#1a1a1a', accent: '#FF1300' },
  platform:  { bg: '#CCFFCC', fg: '#1a1a1a', accent: '#FF1300' },
  sound:     { bg: '#CCE6FF', fg: '#1a1a1a', accent: '#FF1300' },
}

export function paletteFor(category: string) {
  return CATEGORY_PALETTE[category] ?? { bg: '#FFFDF3', fg: '#1a1a1a', accent: '#FF1300' }
}

export function TrendVisual({
  trend,
  size = 'medium',
}: {
  trend: Pick<CultureTrend, 'name' | 'category' | 'thumbnailUrl' | 'hashtags'>
  size?: 'hero' | 'medium' | 'compact'
}) {
  const pal = paletteFor(trend.category)
  // If we have a real thumbnail use generous dims, otherwise stay thin
  // so the SVG poster doesn't dominate the card.
  const hasThumb = !!trend.thumbnailUrl
  const dims = size === 'hero'
    ? { width: '100%', height: hasThumb ? 280 : 120 }
    : size === 'medium'
      ? { width: '100%', height: hasThumb ? 180 : 90 }
      : { width: 80, height: 80 }

  if (trend.thumbnailUrl) {
    return (
      <div
        style={{
          ...dims,
          backgroundImage: `url(${trend.thumbnailUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: '#000',
          position: 'relative',
        }}
      />
    )
  }

  // SVG poster — thin typographic placeholder. The trend headline lives
  // in the card body, so the poster stays decorative + lightweight.
  const isLarge = size === 'hero' || size === 'medium'
  return (
    <div
      style={{
        ...dims,
        backgroundColor: pal.bg,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative diagonal stripe */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '-20%',
          right: '-30%',
          width: '80%',
          height: '140%',
          background: pal.accent,
          opacity: 0.1,
          transform: 'rotate(15deg)',
        }}
      />
      {/* Category tag top-left */}
      {isLarge && (
        <span
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            fontFamily: 'var(--font-jai-display)',
            fontSize: 10,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#FFFDF3',
            background: '#000',
            padding: '3px 8px',
          }}
        >
          {trend.category}
        </span>
      )}
      {/* Bold # mark — anchors the poster visually without a headline */}
      <span
        style={{
          position: 'absolute',
          right: isLarge ? 20 : 4,
          bottom: isLarge ? 8 : 2,
          fontFamily: 'var(--font-jai-display)',
          fontSize: size === 'hero' ? 80 : size === 'medium' ? 56 : 28,
          color: pal.accent,
          lineHeight: 0.85,
          opacity: 0.85,
        }}
      >
        #
      </span>
    </div>
  )
}
