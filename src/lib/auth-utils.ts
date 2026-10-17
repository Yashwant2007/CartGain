import { z } from 'zod'

// Validation schemas
export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must include an uppercase letter')
    .regex(/[0-9]/, 'Password must include a number'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  storeName: z.string().min(2, 'Store name must be at least 2 characters'),
  // A store domain is optional — a merchant signing up directly (not via a
  // platform OAuth install) usually has not connected a storefront yet. When
  // absent we derive a neutral placeholder, and platform is inferred rather
  // than assumed (see the register route).
  storeDomain: z.string().url().or(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Invalid domain')).optional(),
  platform: z.enum(['shopify', 'woocommerce', 'magento', 'bigcommerce', 'custom']).optional(),
})

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must include an uppercase letter')
    .regex(/[0-9]/, 'Password must include a number'),
})

// ── Store platform inference at signup ────────────────────────────────────────
// A direct (email/password) signup has NOT connected a storefront, so the app
// must not claim the store runs on Shopify. Previously registration hardcoded
// platform: 'shopify', which mislabels non-Shopify merchants and makes
// platform-gated features behave incorrectly. Infer the platform from the
// domain when one is given, otherwise 'custom' (unconnected).
export type StorePlatform = 'shopify' | 'woocommerce' | 'magento' | 'bigcommerce' | 'custom'

export function deriveStorePlatform(storeDomain?: string | null, explicit?: string | null): StorePlatform {
  if (explicit) return explicit as StorePlatform
  const domain = (storeDomain || '').trim().toLowerCase()
  if (domain.endsWith('.myshopify.com')) return 'shopify'
  return 'custom'
}

// Store.domain is NOT NULL, so a direct signup needs a placeholder until a real
// storefront is connected. Prefer the merchant-supplied domain; otherwise use a
// slug of the store name (never a fabricated *.myshopify.com domain, which would
// falsely assert the store is on Shopify).
export function deriveSignupDomain(storeName: string, email: string, storeDomain?: string | null): string {
  const explicit = storeDomain?.trim().toLowerCase()
  if (explicit) return explicit
  const slug = storeName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || email.trim().toLowerCase().split('@')[0] || 'store'
}

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

// Shared password policy (staff accounts): min 8 chars, uppercase + number.
export const passwordPolicy = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number')

export function validatePasswordStrength(password: string): string | null {
  const result = passwordPolicy.safeParse(password)
  if (!result.success) {
    return result.error.errors[0]?.message ?? 'Password does not meet requirements'
  }
  return null
}

// Email verification token utilities
export const VERIFICATION_EXPIRES_IN = 24 * 60 * 60 * 1000 // 24 hours
export const PASSWORD_RESET_EXPIRES_IN = 60 * 60 * 1000 // 1 hour

export function generateRandomToken(length = 32): string {
  const { randomBytes } = require('crypto') as typeof import('crypto')
  return randomBytes(length).toString('hex')
}

// Verification/reset tokens are only ever compared server-side, so we persist
// their SHA-256 digest instead of the raw value. A leaked database snapshot then
// yields no usable token: the raw value exists only in the email that was sent.
// Lookups must hash the incoming token with the same function.
export function hashToken(token: string): string {
  const { createHash } = require('crypto') as typeof import('crypto')
  return createHash('sha256').update(token).digest('hex')
}

// Tokens live in the shared VerificationToken table keyed by `identifier`.
// Namespacing the identifier by purpose means an email-verification token can
// never be replayed to reset a password (and vice-versa) — the two flows can no
// longer be confused for each other.
export const EMAIL_VERIFY_PREFIX = 'email-verify:'
export const PASSWORD_RESET_PREFIX = 'password-reset:'

export function emailVerifyIdentifier(email: string): string {
  return `${EMAIL_VERIFY_PREFIX}${email.trim().toLowerCase()}`
}

export function passwordResetIdentifier(email: string): string {
  return `${PASSWORD_RESET_PREFIX}${email.trim().toLowerCase()}`
}

// Error response builder with proper status codes
export function createErrorResponse(code: string, message: string, status: number = 400) {
  return {
    error: true,
    code,
    message,
    status,
  }
}

// Success response builder
export function createSuccessResponse(data: any, message?: string) {
  return {
    error: false,
    message,
    data,
  }
}

// Error codes for better API client handling
export const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USER_EXISTS: 'USER_EXISTS',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
}
