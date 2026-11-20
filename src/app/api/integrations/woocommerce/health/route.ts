import { NextRequest, NextResponse } from 'next/server'
import { requireWooMerchantStore } from '@/lib/woocommerce/auth'
import { checkWooHealth, WooServiceError } from '@/lib/woocommerce/service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const merchant = await requireWooMerchantStore(req)
  if (!merchant.ok) return merchant.response

  try {
    const health = await checkWooHealth(merchant.storeId)
    return NextResponse.json(health, { status: health.ok ? 200 : 502 })
  } catch (error) {
    if (error instanceof WooServiceError) {
      return NextResponse.json({ error: error.code }, { status: error.status })
    }
    return NextResponse.json({ error: 'Health check failed' }, { status: 500 })
  }
}
