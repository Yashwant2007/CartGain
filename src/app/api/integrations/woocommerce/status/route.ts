import { NextRequest, NextResponse } from 'next/server'
import { requireWooMerchantStore } from '@/lib/woocommerce/auth'
import { getWooStatus, WooServiceError } from '@/lib/woocommerce/service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const merchant = await requireWooMerchantStore(req)
  if (!merchant.ok) return merchant.response

  try {
    const status = await getWooStatus(merchant.storeId)
    return NextResponse.json(status)
  } catch (error) {
    if (error instanceof WooServiceError) {
      return NextResponse.json({ error: error.code }, { status: error.status })
    }
    return NextResponse.json({ error: 'Could not read connection status' }, { status: 500 })
  }
}
