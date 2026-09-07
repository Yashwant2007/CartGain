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
const DEFAULT_FALLBACK_MODEL = 'llama-3.3-70b-versatile'

function fallbackModel(): string {
  return process.env.AI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL
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
  const fallbackKey = process.env.AI_FALLBACK_API_KEY
  if (!fallbackKey) return null
  const client = new OpenAI({
    apiKey: fallbackKey,
    baseURL: process.env.AI_FALLBACK_BASE_URL || DEFAULT_FALLBACK_BASE_URL,
    timeout: 20000,
  })
  fallbackClient = decorateForFallback(client, fallbackModel())
  return fallbackClient
}

export type AiResolved = { client: OpenAI; tier: AiTier }

export function getAiClient(userKey?: string): AiResolved | null {
  if (userKey && isUserOnCooldown(userKey)) return null

  if (!isTierTripped('primary')) {
    const key = process.env.OPENAI_API_KEY
    if (key) {
      if (!primaryClient) primaryClient = new OpenAI({ apiKey: key, timeout: 10000 })
      return { client: primaryClient, tier: 'primary' }
    }
  }

  if (!isTierTripped('fallback')) {
    const fbClient = makeFallbackClient()
    if (fbClient) return { client: fbClient, tier: 'fallback' }
  }

  return null
}

export function handleAiFailure(err: any, context: string, userKey: string | undefined, tier: AiTier): void {
  if (isInsufficientQuotaError(err)) {
    tripTierBreaker(tier)
    if (userKey) applyUserCooldown(userKey, MAX_COOLDOWN_MS)
    if (shouldLogQuota()) {
      console.warn(
        `[AI] ${context}: ${tier} tier quota exhausted — ${
          tier === 'primary' ? 'switching to fallback provider' : 'falling back to heuristics'
        }`
      )
    }
  } else if (err?.status === 429) {
    if (userKey) applyUserCooldown(userKey, MAX_COOLDOWN_MS)
  } else {
    console.error(`[AI] ${context}:`, err)
  }
}

export function resetAiClientsForTests(): void {
  primaryClient = null
  fallbackClient = null
  userCooldowns.clear()
}