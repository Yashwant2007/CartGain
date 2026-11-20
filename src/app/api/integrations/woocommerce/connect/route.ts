import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireWooMerchantStore } from '@/lib/woocommerce/auth'
import { createConnectionIntent, WooServiceError } from '@/lib/woocommerce/service'

export const dynamic = 'force-dynamic'

const schema = z.object({
  installId: z.string().trim().min(3).max(120).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const merchant = await requireWooMerchantStore(req)
    if (!merchant.ok) return merchant.response

    if (merchant.store.platform === 'shopify') {
      return NextResponse.json({ error: 'Disconnect Shopify before connecting WooCommerce' }, { status: 409 })
    }

    const parsed = schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Invalid input' }, { status: 400 })
    }

    const intent = await createConnectionIntent(merchant.storeId, parsed.data.installId)
    return NextResponse.json({
      code: intent.code,
      storeId: merchant.storeId,
      expiresAt: intent.expiresAt.toISOString(),
    })
  } catch (error) {
    if (error instanceof WooServiceError) {
      return NextResponse.json({ error: error.code }, { status: error.status })
    }
    return NextResponse.json({ error: 'Could not start connection' }, { status: 500 })
  }
}
