import { z } from 'zod'

export const connectIntentSchema = z.object({
  installId: z.string().trim().min(3).max(120).optional(),
})

export const exchangeSchema = z.object({
  code: z.string().trim().min(20).max(200),
  storeUrl: z.string().trim().min(1).max(500),
  storeName: z.string().trim().min(1).max(200).optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
  installId: z.string().trim().min(3).max(120),
  proof: z.string().trim().length(64).regex(/^[0-9a-fA-F]+$/),
  consumerKey: z.string().trim().min(10).max(500),
  consumerSecret: z.string().trim().min(10).max(500),
})

export const syncSchema = z.object({
  products: z.array(z.record(z.unknown())).min(1).max(200).optional(),
  page: z.number().int().min(1).max(100_000).optional(),
  perPage: z.number().int().min(1).max(100).optional(),
  maxPages: z.number().int().min(1).max(50).optional(),
  since: z.string().datetime().optional(),
})

export const webhookEventSchema = z.object({
  eventId: z.string().trim().min(8).max(200),
  type: z.enum([
    'cart_created',
    'cart_item_added',
    'cart_item_updated',
    'cart_item_removed',
    'checkout_started',
    'customer_identified',
    'cart_abandoned',
    'order_created',
    'order_paid',
    'order_cancelled',
    'order_refunded',
  ]),
  occurredAt: z.string().datetime().optional(),
  connectionId: z.string().trim().min(1).max(200).optional(),
  data: z.record(z.unknown()),
})

export type WebhookEvent = z.infer<typeof webhookEventSchema>
