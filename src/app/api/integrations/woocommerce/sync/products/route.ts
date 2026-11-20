import { NextRequest, NextResponse } from 'next/server'
import { requireWooMerchantStore } from '@/lib/woocommerce/auth'
import { syncSchema } from '@/lib/woocommerce/schemas'
import { syncWooProductPayloads, syncWooProducts, WooServiceError } from '@/lib/woocommerce/service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const merchant = await requireWooMerchantStore(req)
  if (!merchant.ok) return merchant.response

  const body = await req.json().catch(() => ({}))
  const parsed = syncSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Invalid input' }, { status: 400 })
  }

  try {
    const result = parsed.data.products?.length
      ? await syncWooProductPayloads(merchant.storeId, parsed.data.products)
      : await syncWooProducts(merchant.storeId, parsed.data)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof WooServiceError) {
      return NextResponse.json({ error: error.code }, { status: error.status })
    }
    return NextResponse.json({ error: 'Product sync failed' }, { status: 500 })
  }
}
