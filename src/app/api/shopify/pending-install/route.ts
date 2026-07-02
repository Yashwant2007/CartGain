import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Called by the integrations page on mount to check if this session came from
// a Shopify install flow. Returns the pending shop domain and clears the cookie.
export async function GET(req: NextRequest) {
  const shop = req.cookies.get('shopify_install_shop')?.value || null

  const res = NextResponse.json({ shop })

  if (shop) {
    res.cookies.delete('shopify_install_shop')
  }

  return res
}
