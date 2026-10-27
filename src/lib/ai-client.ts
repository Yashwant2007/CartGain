import OpenAI from 'openai'
import { AiTier, isTierTripped, tripTierBreaker, shouldLogQuota, isInsufficientQuotaError } from '@/lib/ai-quota'

export type { AiTier }

const userCooldowns = new Map<string, number>()
const MAX_COOLDOWN_MS = 300_000
const BASE_COOLDOWN_MS = 5_000

function isUserOnCooldown(userKey: string): boolean {
  const until = userCooldowns.get(userKey)
  if (!until) return false
  if (Date.now() < until) return true
  userCooldowns.delete(userKey)
  return false
}

function applyUserCooldown(userKey: string, durationMs = BASE_COOLDOWN_MS): void {
  const existing = userCooldowns.get(userKey) || 0
  const next = Date.now() + durationMs
  userCooldowns.set(userKey, Math.max(existing, next))
  if (userCooldowns.size > 10000) {
    const now = Date.now()
    const toDelete: string[] = []
    userCooldowns.forEach((v, k) => { if (now >= v) toDelete.push(k) })
    toDelete.forEach(k => userCooldowns.delete(k))
  }
}

let primaryClient: OpenAI | null = null
let fallbackClient: OpenAI | null = null

const DEFAULT_FALLBACK_BASE_URL = 'https://api.groq.com/openai/v1'
const DEFAULT_PRIMARY_TIMEOUT_MS = 10_000
const DEFAULT_FALLBACK_TIMEOUT_MS = 20_000
// openai/gpt-oss-120b: 131K context (handles the large bargain system prompt),
// JSON Object Mode (matches our response_format: json_object), strong reasoning
// (best for negotiation depth), available on Groq free tier. NOTE: the previous
// default llama-3.3-70b-versatile was deprecated by Groq (shutdown 08/16/26).
const DEFAULT_FALLBACK_MODEL = 'openai/gpt-oss-120b'

/**
 * Provider config is typed by hand into the Vercel dashboard, so a stray
 * leading/trailing space is a routine accident. We shipped exactly that:
 * `AI_FALLBACK_BASE_URL=" https://api.groq.com/openai/v1"`. The OpenAI SDK
 * builds request URLs by concatenation, so a leading space makes every
 * fallback call throw on URL parse — which trips the tier breaker and drops
 * the whole storefront back onto hard-coded templates, silently. Trim every
 * provider value and treat an empty-after-trim value as unset.
 */
function envTrimmed(name: string): string | undefined {
  const raw = process.env[name]
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function fallbackBaseUrl(): string {
  return envTrimmed('AI_FALLBACK_BASE_URL') ?? DEFAULT_FALLBACK_BASE_URL
}

function fallbackModel(): string {
  return envTrimmed('AI_FALLBACK_MODEL') ?? DEFAULT_FALLBACK_MODEL
}

function timeoutFromEnv(name: string, fallback: number): number {
  const raw = envTrimmed(name)
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(60_000, Math.max(1_000, Math.round(parsed)))
}

export function primaryTimeoutMs(): number {
  return timeoutFromEnv('AI_PRIMARY_TIMEOUT_MS', DEFAULT_PRIMARY_TIMEOUT_MS)
}

export function fallbackTimeoutMs(): number {
  return timeoutFromEnv('AI_FALLBACK_TIMEOUT_MS', DEFAULT_FALLBACK_TIMEOUT_MS)
}

export function fallbackModelName(): string {
  return fallbackModel()
}

export function fallbackProviderName(): string {
  try {
    return new URL(fallbackBaseUrl()).hostname
  } catch {
    return 'invalid-config'
  }
}

function isFormatUnsupported(err: any): boolean {
  const msg = `${err?.error?.message ?? err?.message ?? ''}`.toLowerCase()
  return Boolean(msg && /(response_format|json|structured|format|parameter)/i.test(msg))
}

export function decorateForFallback(client: any, requestedModel: string): OpenAI {
  const model = requestedModel || fallbackModel()
  const rawCreate = client.chat.completions.create.bind(client.chat.completions)

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'chat') {
        return {
          completions: {
            create: async (params: any) => {
              const req: any = { ...params, model }
              // Groq's gpt-oss models are reasoning models: at the default
              // effort the hidden reasoning can eat the whole completion
              // budget, leaving `content` empty and dropping the shopper onto
              // template replies. Cap the effort so the negotiation JSON always
              // makes it out. Only applies to gpt-oss (other fallback models
              // would reject the parameter).
              if (/gpt-oss/i.test(model) && req.reasoning_effort == null) {
                req.reasoning_effort = 'low'
              }
              try {
                return await rawCreate(req)
              } catch (err: any) {
                if (req.response_format && err?.status === 400 && isFormatUnsupported(err)) {
                  const { response_format, ...rest } = req
                  return await rawCreate(rest)
                }
                throw err
              }
            },
          },
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  })
}

function makeFallbackClient(): OpenAI | null {
  if (fallbackClient) return fallbackClient
  const fallbackKey = envTrimmed('AI_FALLBACK_API_KEY')
  if (!fallbackKey) return null
  const client = new OpenAI({
    apiKey: fallbackKey,
    baseURL: fallbackBaseUrl(),
    timeout: fallbackTimeoutMs(),
  })
  fallbackClient = decorateForFallback(client, fallbackModel())
  return fallbackClient
}

export type AiResolved = { client: OpenAI; tier: AiTier }

export function getAiClient(userKey?: string): AiResolved | null {
  if (userKey && isUserOnCooldown(userKey)) return null

  const forceFallback = envTrimmed('AI_FORCE_FALLBACK') === 'true' || envTrimmed('AI_FORCE_FALLBACK') === '1'

  if (!forceFallback && !isTierTripped('primary')) {
    const key = envTrimmed('OPENAI_API_KEY')
    if (key) {
      if (!primaryClient) primaryClient = new OpenAI({ apiKey: key, timeout: primaryTimeoutMs() })
      return { client: primaryClient, tier: 'primary' }
    }
  }

  if (!isTierTripped('fallback')) {
    const fbClient = makeFallbackClient()
    if (fbClient) return { client: fbClient, tier: 'fallback' }
  }

  if (!forceFallback && !isTierTripped('primary')) {
    const key = envTrimmed('OPENAI_API_KEY')
    if (key) {
      if (!primaryClient) primaryClient = new OpenAI({ apiKey: key, timeout: primaryTimeoutMs() })
      return { client: primaryClient, tier: 'primary' }
    }
  }

  return null
}

/**
 * Resolve ONLY the fallback tier. Used when the primary failed with a
 * non-tripping error (for example a timeout) but the request can still be
 * completed inside the overall latency budget.
 */
export function getFallbackAiClient(): AiResolved | null {
  if (isTierTripped('fallback')) return null
  const fbClient = makeFallbackClient()
  return fbClient ? { client: fbClient, tier: 'fallback' } : null
}

export type AiFailureCategory =
  | 'timeout'
  | 'rate_limit'
  | 'quota_exhausted'
  | 'invalid_credentials'
  | 'request_too_large'
  | 'provider_unavailable'
  | 'malformed_output'
  | 'unknown'

export interface AiFailureClassification {
  category: AiFailureCategory
  status?: number
  /** Safe to try the other provider tier for this same request. */
  fallbackEligible: boolean
  /** The failed tier should be temporarily removed from rotation. */
  tripBreaker: boolean
}

export function classifyAiFailure(err: any): AiFailureClassification {
  const status: number | undefined = err?.status ?? err?.statusCode
  const name: string | undefined = err?.name
  const code: string | undefined = err?.code
  const quota = isInsufficientQuotaError(err)
  const timeout =
    name === 'APIConnectionTimeoutError' ||
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    code === 'ETIMEDOUT'
  const connection =
    name === 'APIConnectionError' ||
    ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH'].includes(
      code ?? '',
    )

  if (status === 413) {
    return { category: 'request_too_large', status, fallbackEligible: true, tripBreaker: false }
  }
  if (timeout) {
    return { category: 'timeout', status, fallbackEligible: true, tripBreaker: false }
  }
  if (quota) {
    return { category: 'quota_exhausted', status, fallbackEligible: true, tripBreaker: true }
  }
  if (status === 429) {
    return { category: 'rate_limit', status, fallbackEligible: true, tripBreaker: true }
  }
  if (status === 401 || status === 403) {
    return { category: 'invalid_credentials', status, fallbackEligible: true, tripBreaker: true }
  }
  if (connection || (typeof status === 'number' && status >= 500)) {
    return { category: 'provider_unavailable', status, fallbackEligible: true, tripBreaker: true }
  }
  if (typeof status === 'number' && status >= 400) {
    return { category: 'unknown', status, fallbackEligible: true, tripBreaker: true }
  }
  return { category: 'unknown', status, fallbackEligible: true, tripBreaker: false }
}

export function handleAiFailure(
  err: any,
  context: string,
  userKey: string | undefined,
  tier: AiTier,
): AiFailureClassification {
  const classification = classifyAiFailure(err)
  const status = classification.status
  // A slow reply is NOT an outage: tripping a tier for 15 minutes because of one
  // timeout would push every shopper onto the fallback, so timeouts stay local.
  if (classification.tripBreaker) {
    tripTierBreaker(tier)
    if (tier === 'fallback' && userKey) applyUserCooldown(userKey, MAX_COOLDOWN_MS)
    if (shouldLogQuota()) {
      const reason =
        classification.category === 'quota_exhausted'
          ? 'credits exhausted'
          : classification.category === 'rate_limit'
            ? 'HTTP 429'
            : classification.category === 'invalid_credentials'
              ? `HTTP ${status ?? 401}`
              : classification.category === 'provider_unavailable'
                ? status
                  ? `HTTP ${status}`
                  : 'provider unreachable'
                : status
                  ? `HTTP ${status}`
                  : classification.category
      console.warn(
        `[AI] ${context}: ${tier} tier failing (${reason}) — ${
          tier === 'primary' ? 'switching to fallback provider' : 'falling back to heuristics'
        }`
      )
    }
  } else {
    console.error(`[AI] ${context}: ${classification.category}`, err)
  }
  return classification
}

export function getAiHealth() {
  const primaryConfigured = Boolean(process.env.OPENAI_API_KEY)
  const fallbackConfigured = Boolean(envTrimmed('AI_FALLBACK_API_KEY'))
  const primaryTripped = isTierTripped('primary')
  const fallbackTripped = isTierTripped('fallback')
  const forceFallback = envTrimmed('AI_FORCE_FALLBACK') === 'true' || envTrimmed('AI_FORCE_FALLBACK') === '1'
  const activeTier =
    !forceFallback && primaryConfigured && !primaryTripped
      ? 'primary'
      : fallbackConfigured && !fallbackTripped
      ? 'fallback'
      : 'none'
  return {
    primary: { configured: primaryConfigured, tripped: primaryTripped, timeoutMs: primaryTimeoutMs() },
    fallback: {
      configured: fallbackConfigured,
      tripped: fallbackTripped,
      baseUrl: fallbackBaseUrl(),
      model: fallbackModel(),
      provider: fallbackProviderName(),
      timeoutMs: fallbackTimeoutMs(),
    },
    forceFallback,
    activeTier,
  } as const
}

export function resetAiClientsForTests(): void {
  primaryClient = null
  fallbackClient = null
  userCooldowns.clear()
}