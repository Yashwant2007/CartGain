import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { resolveActiveStoreIdByShopDomain } from '@/lib/stores/resolve-by-domain'
import { fromDb } from '@/lib/bargain/experience/config'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const shop = request.nextUrl.searchParams.get('shop')
    const storeId = request.nextUrl.searchParams.get('storeId')
    let resolvedStoreId: string | null = null
    if (shop) {
      resolvedStoreId = await resolveActiveStoreIdByShopDomain(prisma, shop)
    } else if (storeId) {
      resolvedStoreId = storeId
    }
    if (!resolvedStoreId) return NextResponse.json({ experience: fromDb({}, 'published') })
    const config = await prisma.bargainConfig.findUnique({ where: { storeId: resolvedStoreId } })
    return NextResponse.json({ experience: fromDb(config, 'published') })
  } catch (error) {
    console.error('[BARGAIN_EXPERIENCE_PUBLIC_GET]', error)
    return NextResponse.json({ experience: fromDb({}, 'published') })
  }
}
