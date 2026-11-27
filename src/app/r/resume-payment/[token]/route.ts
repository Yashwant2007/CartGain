import { NextRequest, NextResponse } from 'next/server'
import { verifySecureToken } from '@/lib/links'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const data = verifySecureToken(token)
  if (!data) {
    return NextResponse.redirect(new URL('/?status=invalid_link', process.env.NEXT_PUBLIC_APP_URL || 'https://cart-gain.com'))
  }

  const checkoutUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://cart-gain.com'}/checkout?resume=1&token=${token}`
  return NextResponse.redirect(new URL(checkoutUrl))
}
