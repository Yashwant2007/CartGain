import { NextRequest, NextResponse } from 'next/server'
import { requireWooMerchantStore } from '@/lib/woocommerce/auth'
import { syncSchema } from '@/lib/woocommerce/schemas'
import { syncWooOrders, WooServiceError } from '@/lib/woocommerce/service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const merchant = await requireWooMerchantStore(req)
  if (!merchant.ok) return merchant.response

  const parsed = syncSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Invalid input' }, { status: 400 })
  }

  try {
    const result = await syncWooOrders(merchant.storeId, parsed.data)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof WooServiceError) {
      return NextResponse.json({ error: error.code }, { status: error.status })
    }
    return NextResponse.json({ error: 'Order sync failed' }, { status: 500 })
  }
}
