import { z } from 'zod'

// Re-export helpers from root validation module so bargain routes can import
// everything they need from `@/lib/validation/bargain`.
export {
  validateOrThrow,
  handleValidationError,
  ValidationError,
} from '@/lib/validation'

// ── Bargain config (merchant) ──

export const bargainConfigUpsertSchema = z.object({
  enabled: z.boolean().optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  aiModel: z.enum(['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1']).optional(),
  aiPersona: z.enum(['friendly_shopkeeper', 'strict_negotiator', 'playful_friend']).optional(),
  minProfitPercent: z.number().min(0).max(100).optional(),
  sessionTimeout: z.number().int().min(30).max(3600).optional(),
})

export type BargainConfigUpsertInput = z.infer<typeof bargainConfigUpsertSchema>

// ── Bargain product override (merchant) ──

export const bargainProductUpsertSchema = z.object({
  shopifyProductId: z.string().min(1, 'shopifyProductId is required').max(100),
  variantId: z.string().max(100).optional(),
  productTitle: z.string().max(300).optional(),
  minPrice: z.number().positive().optional(),
  minProfitPercent: z.number().min(0).max(100).optional(),
  maxDiscountPercent: z.number().int().min(0).max(100).optional(),
  isBargainable: z.boolean().optional(),
})

export type BargainProductUpsertInput = z.infer<typeof bargainProductUpsertSchema>

export const bargainProductBulkUpsertSchema = z.object({
  products: z.array(bargainProductUpsertSchema).min(1).max(500),
})

export type BargainProductBulkUpsertInput = z.infer<typeof bargainProductBulkUpsertSchema>

// ── Customer-facing bargain APIs ──

export const bargainStartSchema = z.object({
  storeId: z.string().min(1, 'storeId is required').max(100),
  shopifyProductId: z.string().min(1, 'shopifyProductId is required').max(100),
  variantId: z.string().max(100).optional(),
  originalPrice: z.number().positive('originalPrice must be positive'),
  currency: z.string().length(3).optional().default('INR'),
  cartToken: z.string().max(200).optional(),
  customerEmail: z.string().email().optional().or(z.literal('')),
  customerPhone: z.string().max(20).optional().or(z.literal('')),
})

export type BargainStartInput = z.infer<typeof bargainStartSchema>

export const bargainOfferSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required').max(100),
  offer: z.number().positive('Offer must be a positive number'),
})

export type BargainOfferInput = z.infer<typeof bargainOfferSchema>

export const bargainAcceptSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required').max(100),
})

export type BargainAcceptInput = z.infer<typeof bargainAcceptSchema>

// ── Analytics query params ──

export const bargainSessionQuerySchema = z.object({
  storeId: z.string().min(1).max(100),
  status: z.enum(['active', 'accepted', 'rejected', 'expired', 'abandoned']).optional(),
  cursor: z.string().max(100).optional(),
  take: z.coerce.number().int().min(1).max(200).optional().default(50),
})

export type BargainSessionQueryInput = z.infer<typeof bargainSessionQuerySchema>
