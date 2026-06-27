import { z } from 'zod'
import { NextResponse } from 'next/server'

// ── Common helpers ──

export const nonEmptyString = (field: string) =>
  z.string().min(1, `${field} is required`).max(500, `${field} must be under 500 characters`)

export const urlOrDomain = z
  .string()
  .url('Must be a valid URL')
  .or(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Must be a valid domain'))

// ── Auth schemas (extend auth-utils) ──

export { signupSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from './auth-utils'
export type { SignupInput, LoginInput, ForgotPasswordInput, ResetPasswordInput } from './auth-utils'

// ── Campaign schemas ──

export const campaignChannelSchema = z.enum(['email', 'whatsapp', 'sms'])

export const campaignCreateSchema = z.object({
  storeId: nonEmptyString('storeId'),
  name: nonEmptyString('Campaign name').min(2, 'Campaign name must be at least 2 characters').max(100),
  channels: z.array(campaignChannelSchema).min(1, 'Select at least one channel'),
  aiOptimized: z.boolean().optional().default(true),
  sendDelay: z.number().int('Must be a whole number').min(1, 'Delay must be at least 1 minute').max(1440, 'Delay cannot exceed 24 hours').optional().default(15),
  followUpDelay: z.number().int().min(1).max(10080).optional().default(180),
  maxFollowUps: z.number().int().min(0).max(10).optional().default(2),
  discountEnabled: z.boolean().optional().default(false),
  discountType: z.enum(['percentage', 'fixed', 'free_shipping']).optional(),
  discountValue: z.number().positive('Discount value must be positive').optional(),
  discountCode: z.string().max(50).optional(),
  isActive: z.boolean().optional().default(true),
})

export const campaignUpdateSchema = campaignCreateSchema.partial()

export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>
export type CampaignUpdateInput = z.infer<typeof campaignUpdateSchema>

// ── A/B Test schemas ──

export const abTestVariantSchema = z.object({
  subjectLine: z.string().min(1, 'Subject line is required').max(200),
  channels: z.array(campaignChannelSchema).min(1, 'Select at least one channel'),
  sendDelay: z.number().int().min(1).max(1440),
  followUps: z.number().int().min(0).max(5),
  discount: z.number().int().min(0).max(100).optional(),
})

export const abTestCreateSchema = z.object({
  name: nonEmptyString('Test name').min(2).max(100),
  variantA: abTestVariantSchema,
  variantB: abTestVariantSchema,
})

export type ABTestCreateInput = z.infer<typeof abTestCreateSchema>

// ── Store settings schemas ──

export const storeUpdateSchema = z.object({
  name: nonEmptyString('Store name').min(2).max(100).optional(),
  domain: z.string().max(200).optional(),
  timezone: z.string().max(50).optional(),
  currency: z.enum(['INR', 'USD']).optional(),
  platform: z.enum(['shopify', 'woocommerce', 'magento', 'bigcommerce', 'custom']).optional(),
  webhookUrl: z.string().url('Invalid webhook URL').optional().or(z.literal('')),
  apiKey: z.string().max(500).optional(),
  apiSecret: z.string().max(500).optional(),
})

export type StoreUpdateInput = z.infer<typeof storeUpdateSchema>

// ── Cart schemas ──

export const cartItemSchema = z.object({
  id: z.string().optional(),
  title: nonEmptyString('Item title'),
  quantity: z.number().int().positive('Quantity must be at least 1'),
  price: z.number().positive('Price must be positive'),
  image: z.string().url().optional().or(z.literal('')),
})

export const cartCreateSchema = z.object({
  storeId: nonEmptyString('storeId'),
  cartId: nonEmptyString('cartId'),
  customerId: z.string().max(100).optional(),
  customerEmail: z.string().email('Invalid customer email').optional().or(z.literal('')),
  customerPhone: z.string().max(20).optional().or(z.literal('')),
  customerName: z.string().max(200).optional().or(z.literal('')),
  items: z.array(cartItemSchema).min(1, 'At least one item is required'),
  totalValue: z.number().positive('Total value must be positive'),
  currency: z.string().length(3, 'Currency must be a 3-letter code').optional().default('INR'),
})

export type CartCreateInput = z.infer<typeof cartCreateSchema>

// ── Integration credentials schema ──

export const integrationCredentialsSchema = z.object({
  platform: z.enum(['shopify', 'woocommerce', 'magento', 'bigcommerce', 'custom']),
  apiKey: z.string().min(1, 'API key is required').max(500),
  apiSecret: z.string().min(1, 'API secret is required').max(500),
  webhookUrl: z.string().url('Invalid webhook URL').optional().or(z.literal('')),
})

export type IntegrationCredentialsInput = z.infer<typeof integrationCredentialsSchema>

// ── Shopify connect schema ──

export const shopifyConnectSchema = z.object({
  shop: z
    .string()
    .min(1, 'Shop domain is required')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/, 'Must be a valid .myshopify.com domain'),
  storeId: nonEmptyString('storeId'),
})

export type ShopifyConnectInput = z.infer<typeof shopifyConnectSchema>

// ── Validation helper for API routes ──

export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const firstError = result.error.errors[0]
    throw new ValidationError(firstError?.message || 'Validation failed', result.error.errors)
  }
  return result.data
}

export class ValidationError extends Error {
  public details: z.ZodIssue[]
  constructor(message: string, details: z.ZodIssue[]) {
    super(message)
    this.name = 'ValidationError'
    this.details = details
  }
}

export function handleValidationError(error: unknown) {
  if (error instanceof ValidationError) {
    return NextResponse.json(
      { message: error.message, errors: error.details.map(d => ({ field: d.path.join('.'), message: d.message })) },
      { status: 400 }
    )
  }
  return null
}
