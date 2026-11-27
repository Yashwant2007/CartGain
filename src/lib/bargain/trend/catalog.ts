import { TREND_REGION_VALUES, type TrendMerchantConfig, type TrendProductInput, type TrendTopic } from './types'

export interface SanitizedTrendConfig {
  enabled: boolean
  region: (typeof TREND_REGION_VALUES)[number]
  topics: string[]
  excludedTopics: string[]
  humorEnabled: boolean
}

export const TREND_TOPIC_CATALOG: TrendTopic[] = [
  { id: 'fitness', label: 'fitness', article: 'Physical_fitness', keywords: ['fitness', 'workout', 'gym', 'exercise', 'training', 'dumbbell', 'yoga'] },
  { id: 'skincare', label: 'skincare', article: 'Skin_care', keywords: ['skincare', 'skin care', 'serum', 'moisturizer', 'moisturiser', 'sunscreen', 'beauty'] },
  { id: 'fashion', label: 'fashion', article: 'Fashion', keywords: ['fashion', 'apparel', 'clothing', 'shirt', 'dress', 'jeans', 'jacket'] },
  { id: 'sneakers', label: 'sneakers', article: 'Sneakers', keywords: ['sneaker', 'shoe', 'trainer', 'footwear', 'running'] },
  { id: 'electronics', label: 'consumer electronics', article: 'Consumer_electronics', keywords: ['electronics', 'gadget', 'headphone', 'speaker', 'camera', 'phone', 'laptop', 'charger'] },
  { id: 'gaming', label: 'gaming', article: 'Video_game', keywords: ['gaming', 'game', 'console', 'playstation', 'xbox', 'nintendo'] },
  { id: 'travel', label: 'travel', article: 'Tourism', keywords: ['travel', 'trip', 'backpack', 'luggage', 'suitcase', 'tourism'] },
  { id: 'home_decor', label: 'home decor', article: 'Interior_design', keywords: ['home decor', 'decor', 'furniture', 'lamp', 'cushion', 'interior', 'kitchen'] },
  { id: 'coffee', label: 'coffee', article: 'Coffee', keywords: ['coffee', 'espresso', 'latte', 'cafe', 'brewer', 'grinder'] },
  { id: 'tea', label: 'tea', article: 'Tea', keywords: ['tea', 'chai', 'green tea', 'kettle', 'teapot'] },
  { id: 'cycling', label: 'cycling', article: 'Cycling', keywords: ['cycle', 'cycling', 'bicycle', 'bike', 'helmet'] },
  { id: 'camping', label: 'camping', article: 'Camping', keywords: ['camping', 'camp', 'tent', 'hiking', 'outdoor', 'trekking'] },
  { id: 'photography', label: 'photography', article: 'Photography', keywords: ['photography', 'camera', 'lens', 'tripod', 'photo'] },
  { id: 'books', label: 'books', article: 'Book', keywords: ['book', 'novel', 'reader', 'reading', 'literature'] },
  { id: 'music', label: 'music', article: 'Music', keywords: ['music', 'guitar', 'piano', 'headphones', 'speaker', 'album'] },
  { id: 'pets', label: 'pets', article: 'Pet', keywords: ['pet', 'dog', 'cat', 'puppy', 'kitten', 'aquarium'] },
  { id: 'gardening', label: 'gardening', article: 'Gardening', keywords: ['garden', 'gardening', 'plant', 'seed', 'planter', 'pot'] },
  { id: 'wellness', label: 'wellness', article: 'Wellness', keywords: ['wellness', 'meditation', 'mindfulness', 'supplement'], sensitive: true },
  { id: 'internet_culture', label: 'internet culture', article: 'Internet_culture', keywords: ['internet culture', 'online culture', 'creator', 'influencer', 'short video', 'reels', 'tiktok', 'streamer'] },
  { id: 'memes', label: 'internet memes', article: 'Internet_meme', keywords: ['meme', 'memes', 'meme format', 'internet joke', 'viral joke'] },
  { id: 'bollywood', label: 'Bollywood', article: 'Bollywood', keywords: ['bollywood', 'hindi film', 'indian cinema', 'movie star', 'film soundtrack'] },
  { id: 'gen_z', label: 'Gen Z culture', article: 'Generation_Z', keywords: ['gen z', 'gen-z', 'generation z', 'zoomer', 'gen z slang'] },
  { id: 'millennials', label: 'millennial culture', article: 'Millennials', keywords: ['millennial', 'millennials', '90s nostalgia', '2000s nostalgia'] },
  { id: 'festivals', label: 'festivals', article: 'Festival', keywords: ['festival', 'festive', 'diwali', 'holi', 'eid', 'christmas', 'new year', 'wedding season'] },
  { id: 'seasonal', label: 'seasonal interests', article: 'Season', keywords: ['season', 'summer', 'winter', 'monsoon', 'rainy season', 'holiday season'] },
  { id: 'public_events', label: 'public events', article: 'Current_events', keywords: ['public event', 'current event', 'event', 'expo', 'concert', 'sports event'] },
]

export const TREND_TOPIC_IDS = TREND_TOPIC_CATALOG.map((topic) => topic.id)

const TOPIC_BY_ID = new Map(TREND_TOPIC_CATALOG.map((topic) => [topic.id, topic]))
const VALID_REGIONS = new Set<string>(TREND_REGION_VALUES)
const DEFAULT_REGION: SanitizedTrendConfig['region'] = 'US'

function cleanTopicIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const id = entry.trim().toLowerCase().replace(/[\s-]+/g, '_')
    if (!TOPIC_BY_ID.has(id) || out.includes(id)) continue
    out.push(id)
    if (out.length >= 8) break
  }
  return out
}

export function sanitizeTrendConfig(config: TrendMerchantConfig | null | undefined): SanitizedTrendConfig {
  const rawRegion = config?.region ?? config?.trendRegion
  const region = typeof rawRegion === 'string' ? rawRegion.trim().toUpperCase() : DEFAULT_REGION
  return {
    enabled: config?.enabled === true || config?.trendIntelligenceEnabled === true,
    region: VALID_REGIONS.has(region) ? region as SanitizedTrendConfig['region'] : DEFAULT_REGION,
    topics: cleanTopicIds(config?.topics ?? config?.trendTopics),
    excludedTopics: cleanTopicIds(config?.excludedTopics ?? config?.trendExcludedTopics),
    humorEnabled: config?.humorEnabled === true || config?.trendHumorEnabled === true,
  }
}

export function inferTrendTopics(product: TrendProductInput | null | undefined): string[] {
  const haystack = [
    product?.title,
    product?.productType,
    ...(Array.isArray(product?.tags) ? product.tags : []),
  ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
    .toLowerCase()

  if (!haystack) return []

  const matches: Array<{ id: string; score: number }> = []
  for (const topic of TREND_TOPIC_CATALOG) {
    if (topic.sensitive) continue
    let score = 0
    for (const keyword of topic.keywords) {
      if (haystack.includes(keyword)) score += keyword.length
    }
    if (score > 0) matches.push({ id: topic.id, score })
  }
  matches.sort((a, b) => b.score - a.score)
  return matches.slice(0, 4).map((match) => match.id)
}

export function resolveTrendTopics(
  config: SanitizedTrendConfig,
  product: TrendProductInput | null | undefined,
): string[] {
  const excluded = new Set(config.excludedTopics)
  const candidates = config.topics.length > 0 ? config.topics : inferTrendTopics(product)
  return candidates.filter((id) => !excluded.has(id) && TOPIC_BY_ID.get(id)?.sensitive !== true).slice(0, 4)
}

export function trendTopicById(id: string): TrendTopic | undefined {
  return TOPIC_BY_ID.get(id)
}
