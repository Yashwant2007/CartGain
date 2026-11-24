import crypto from 'crypto'
import prisma from '@/lib/db'
import { generateSecureToken, verifySecureToken } from '@/lib/links'

export const BUNDLE_QUOTE_TTL_MS = 24 * 60 * 60 * 1000
const TOKEN_PREFIX = 'bbundle:'

export interface StoredBundleQuoteItem {
  productId: string
  variantId: string | null
  title: string
  price: number
  floor: number
  quantity: number
}

export interface CreateBundleQuoteInput {
  storeId: string
  sessionId: string
  cartToken?: string | null
  items: StoredBundleQuoteItem[]
  listTotal: number
  floorTotal: number
  offerTotal: number
  discountPercent: number
  currency: string
  expiresAt: Date
}

function signBundleQuoteToken(quoteId: string): string {
  return `${TOKEN_PREFIX}${generateSecureToken(quoteId)}`
}

export function verifyBundleQuoteToken(quoteId: string, token: string): boolean {
  if (!token.startsWith(TOKEN_PREFIX)) return false
  return verifySecureToken(token.slice(TOKEN_PREFIX.length), BUNDLE_QUOTE_TTL_MS) === quoteId
}

export async function createBundleQuote(input: CreateBundleQuoteInput): Promise<string | null> {
  try {
    const id = crypto.randomUUID()
    const token = signBundleQuoteToken(id)
    await prisma.bargainBundleQuote.create({
      data: {
        id,
        storeId: input.storeId,
        sessionId: input.sessionId,
        cartToken: input.cartToken ?? null,
        token,
        items: input.items as any,
        listTotal: input.listTotal,
        floorTotal: input.floorTotal,
        offerTotal: input.offerTotal,
        discountPercent: input.discountPercent,
        currency: input.currency,
        status: 'CREATED',
        expiresAt: input.expiresAt,
      },
    })
    return token
  } catch {
    return null
  }
}

export async function findBundleQuoteByToken(token: string): Promise<any | null> {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null
  try {
    const quote = await prisma.bargainBundleQuote.findUnique({ where: { token } })
    if (!quote || !verifyBundleQuoteToken(quote.id, token)) return null
    return quote
  } catch {
    return null
  }
}

export async function acceptBundleQuote(id: string, discountCode: string): Promise<boolean> {
  const result = await prisma.bargainBundleQuote.updateMany({
    where: { id, status: 'CREATED' },
    data: { status: 'ACCEPTED', discountCode, acceptedAt: new Date() },
  })
  return result.count === 1
}
