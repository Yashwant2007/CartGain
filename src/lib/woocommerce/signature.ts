import crypto from 'crypto'
import { normalizeStoreUrl } from './url'

export const WEBHOOK_SIGNATURE_HEADER = 'x-cartgain-signature'
export const WEBHOOK_TIMESTAMP_HEADER = 'x-cartgain-timestamp'
export const WEBHOOK_CONNECTION_HEADER = 'x-cartgain-connection-id'
export const PLUGIN_STORE_HEADER = 'x-cartgain-store-id'
export const DEFAULT_WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000

function canonical(timestamp: string, rawBody: string): string {
  return `${timestamp}.${rawBody}`
}

function canonicalPath(path: string): string {
  const trimmed = path.trim()
  const leading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return leading.length > 1 ? leading.replace(/\/+$/, '') : leading
}

export function signWebhookPayload(secret: string, timestamp: string, rawBody: string): string {
  return crypto.createHmac('sha256', secret).update(canonical(timestamp, rawBody), 'utf8').digest('hex')
}

export function signPluginRequest(secret: string, timestamp: string, storeId: string, path: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${storeId}.${canonicalPath(path)}`, 'utf8')
    .digest('hex')
}

export function verifyWebhookSignature(input: {
  rawBody: string
  signature: string | null
  timestamp: string | null
  secret: string
  now?: number
  toleranceMs?: number
}): boolean {
  const { rawBody, signature, timestamp, secret } = input
  if (!signature || !timestamp || !secret) return false
  if (!/^\d{10,16}$/.test(timestamp)) return false

  const now = input.now ?? Date.now()
  const timestampMs = Number(timestamp) < 1e12 ? Number(timestamp) * 1000 : Number(timestamp)
  if (!Number.isFinite(timestampMs)) return false
  const tolerance = input.toleranceMs ?? DEFAULT_WEBHOOK_TOLERANCE_MS
  if (Math.abs(now - timestampMs) > tolerance) return false

  const normalized = signature.trim().replace(/^sha256=/i, '').toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(normalized)) return false
  const expected = signWebhookPayload(secret, timestamp, rawBody)
  const a = Buffer.from(normalized, 'hex')
  const b = Buffer.from(expected, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function verifyPluginRequest(input: {
  path: string
  signature: string | null
  timestamp: string | null
  storeId: string | null
  secret: string
  now?: number
  toleranceMs?: number
}): boolean {
  const { path, signature, timestamp, storeId, secret } = input
  if (!signature || !timestamp || !storeId || !secret) return false
  if (!/^\d{10,16}$/.test(timestamp)) return false

  const now = input.now ?? Date.now()
  const timestampMs = Number(timestamp) < 1e12 ? Number(timestamp) * 1000 : Number(timestamp)
  if (!Number.isFinite(timestampMs)) return false
  const tolerance = input.toleranceMs ?? DEFAULT_WEBHOOK_TOLERANCE_MS
  if (Math.abs(now - timestampMs) > tolerance) return false

  const normalized = signature.trim().replace(/^sha256=/i, '').toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(normalized)) return false
  const expected = signPluginRequest(secret, timestamp, storeId, path)
  const a = Buffer.from(normalized, 'hex')
  const b = Buffer.from(expected, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function buildConnectionProof(input: {
  code: string
  installId: string
  storeUrl: string
}): string {
  const storeUrl = normalizeStoreUrl(input.storeUrl)
  return crypto
    .createHash('sha256')
    .update(`${input.code}|${input.installId}|${storeUrl}`, 'utf8')
    .digest('hex')
}

export function deriveWebhookSecret(input: {
  code: string
  installId: string
  storeUrl: string
  consumerSecret: string
}): string {
  const storeUrl = normalizeStoreUrl(input.storeUrl)
  return crypto
    .createHmac('sha256', input.consumerSecret)
    .update(`cartgain|${input.code}|${input.installId}|${storeUrl}`, 'utf8')
    .digest('hex')
}

export function credentialFingerprint(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16)
}
