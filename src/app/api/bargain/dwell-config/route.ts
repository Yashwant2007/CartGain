import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { resolveActiveStoreIdByShopDomain } from '@/lib/stores/resolve-by-domain'
import { publicDwellConfig } from '@/lib/bargain/engagement'

export const dynamic = 'force-dynamic'

// The controller fetches this once per product page from the merchant's own
// storefront origin, so the response is explicitly CORS-open (public, read-only,
// non-sensitive). Cache at the edge so a busy storefront does not hit the DB per
// view; stale-while-revalidate keeps it responsive while a merchant's setting
// change propagates.
const CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
const HEADERS = { 'Cache-Control': CACHE, 'Access-Control-Allow-Origin': '*' }

function deny() {
  return NextResponse.json({ enabled: false }, { headers: HEADERS })
}

// GET /api/bargain/dwell-config?shop=<permanent_domain>
//
// Public, non-sensitive engagement settings for the storefront theme
// controller (extensions/storefront-bargain/assets/bargain.js). Keyed by the
// shop's permanent domain — the only identifier the theme block can safely
// expose. Returns the customer-safe shape only (see publicDwellConfig) and
// always `{ enabled: false }` for an unknown/inactive shop so nothing nudges on
// a page we do not own.
export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get('shop')?.trim()
  if (!shop) return deny()

  try {
    const storeId = await resolveActiveStoreIdByShopDomain(prisma, shop)
    if (!storeId) return deny()

    const config = await prisma.bargainConfig.findUnique({
      where: { storeId },
      select: { dwellNudgeEnabled: true, dwellSeconds: true, dwellReminderSeconds: true },
    })

    return NextResponse.json(publicDwellConfig(config), { headers: HEADERS })
  } catch (error) {
    console.error('[BARGAIN_DWELL_CONFIG]', error)
    return NextResponse.json({ enabled: false }, { status: 500, headers: HEADERS })
  }
}
