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
  storeDomain: z.string().url().or(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Invalid domain')),
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
