import { trendTopicById } from './catalog'
import type { TrendSignal, TrendTopic } from './types'

const DEFAULT_USER_AGENT = 'CartGainTrendIntelligence/1.0 (https://cart-gain.com; support@cart-gain.com)'
const API_BASE = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article'
const MIN_TOTAL_VIEWS = 100
const SIGNIFICANT_CHANGE_PERCENT = 15

interface PageviewItem {
  timestamp?: unknown
  views?: unknown
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime())
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

function dayStamp(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function sumViews(items: PageviewItem[], start: Date, end: Date): number {
  const startStamp = dayStamp(start)
  const endStamp = dayStamp(end)
  let total = 0
  for (const item of items) {
    const stamp = typeof item.timestamp === 'string' ? item.timestamp.slice(0, 8) : ''
    if (stamp < startStamp || stamp > endStamp) continue
    if (typeof item.views === 'number' && Number.isFinite(item.views) && item.views >= 0) {
      total += item.views
    }
  }
  return Math.round(total)
}

function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': process.env.WIKIMEDIA_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
    },
    signal: controller.signal,
    cache: 'no-store',
  }).finally(() => clearTimeout(timer))
}

export async function fetchTrendSignals(
  topicIds: string[],
  region: string,
  now: Date = new Date(),
): Promise<TrendSignal[]> {
  const topics = topicIds
    .map((id) => trendTopicById(id))
    .filter((topic): topic is TrendTopic => Boolean(topic))
    .slice(0, 4)
  if (topics.length === 0) return []

  const end = addDays(now, -1)
  const recentStart = addDays(end, -6)
  const previousStart = addDays(end, -13)
  const refreshedAt = now.toISOString()

  const settled = await Promise.allSettled(topics.map(async (topic): Promise<TrendSignal> => {
    const article = topic.article.replace(/ /g, '_')
    const url = `${API_BASE}/en.wikipedia/all-access/user/${encodeURIComponent(article)}/daily/${dayStamp(previousStart)}/${dayStamp(end)}`
    const response = await fetchWithTimeout(url, 8000)
    if (!response.ok) throw new Error(`Wikimedia pageviews returned ${response.status}`)
    const payload: unknown = await response.json()
    const items = payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: PageviewItem[] }).items
      : []
    const recentViews = sumViews(items, recentStart, end)
    const previousViews = sumViews(items, previousStart, addDays(recentStart, -1))
    const usable = recentViews >= MIN_TOTAL_VIEWS && previousViews > 0
    const rawChange = usable ? ((recentViews - previousViews) / previousViews) * 100 : null
    const changePercent = rawChange == null ? null : Math.round(rawChange)
    const direction = rawChange == null
      ? 'insufficient'
      : rawChange >= SIGNIFICANT_CHANGE_PERCENT
        ? 'up'
        : rawChange <= -SIGNIFICANT_CHANGE_PERCENT
          ? 'down'
          : 'flat'

    return {
      topicId: topic.id,
      label: topic.label,
      source: 'wikimedia_pageviews',
      sourceUrl: url,
      article,
      windowStart: isoDay(previousStart),
      windowEnd: isoDay(end),
      recentViews,
      previousViews,
      changePercent,
      direction,
      refreshedAt,
    }
  }))

  const signals: TrendSignal[] = []
  for (const result of settled) {
    if (result.status === 'fulfilled') signals.push(result.value)
  }
  signals.sort((a, b) => {
    const rank = { up: 0, down: 1, flat: 2, insufficient: 3 }
    return rank[a.direction] - rank[b.direction] || Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0)
  })
  return signals
}
