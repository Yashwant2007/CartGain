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
              const req = { ...params, model }
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
    timeout: 20000,
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
      if (!primaryClient) primaryClient = new OpenAI({ apiKey: key, timeout: 10000 })
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
      if (!primaryClient) primaryClient = new OpenAI({ apiKey: key, timeout: 10000 })
      return { client: primaryClient, tier: 'primary' }
    }
  }

  return null
}

export function handleAiFailure(err: any, context: string, userKey: string | undefined, tier: AiTier): void {
  if (isInsufficientQuotaError(err) || err?.status === 401) {
    tripTierBreaker(tier)
    if (shouldLogQuota()) {
      const reason = isInsufficientQuotaError(err)
        ? 'credits exhausted'
        : err?.status === 401
        ? 'authentication failed (401)'
        : 'unexpected failure'
      console.warn(
        `[AI] ${context}: ${tier} tier ${reason} — ${
          tier === 'primary' ? 'switching to fallback provider' : 'falling back to heuristics'
        }`
      )
    }
    if (tier === 'fallback' && userKey) applyUserCooldown(userKey, MAX_COOLDOWN_MS)
  } else if (err?.status === 429) {
    if (userKey) applyUserCooldown(userKey, MAX_COOLDOWN_MS)
  } else {
    console.error(`[AI] ${context}:`, err)
  }
}

export function getAiHealth() {
  const primaryConfigured = Boolean(process.env.OPENAI_API_KEY)
  const fallbackConfigured = Boolean(envTrimmed('AI_FALLBACK_API_KEY'))
  const primaryTripped = isTierTripped('primary')
  const fallbackTripped = isTierTripped('fallback')
  return {
    primary: { configured: primaryConfigured, tripped: primaryTripped },
    fallback: {
      configured: fallbackConfigured,
      tripped: fallbackTripped,
      baseUrl: fallbackBaseUrl(),
      model: fallbackModel(),
    },
    activeTier:
      primaryConfigured && !primaryTripped
        ? 'primary'
        : fallbackConfigured && !fallbackTripped
        ? 'fallback'
        : 'none',
  } as const
}

export function resetAiClientsForTests(): void {
  primaryClient = null
  fallbackClient = null
  userCooldowns.clear()
}