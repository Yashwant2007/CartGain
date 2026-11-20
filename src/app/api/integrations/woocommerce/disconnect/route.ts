import { NextRequest, NextResponse } from 'next/server'
import { requireWooMerchantStore } from '@/lib/woocommerce/auth'
import { disconnectWooCommerce, WooServiceError } from '@/lib/woocommerce/service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const merchant = await requireWooMerchantStore(req)
  if (!merchant.ok) return merchant.response

  try {
    const result = await disconnectWooCommerce(merchant.storeId)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof WooServiceError) {
      return NextResponse.json({ error: error.code }, { status: error.status })
    }
    return NextResponse.json({ error: 'Could not disconnect WooCommerce' }, { status: 500 })
  }
}
