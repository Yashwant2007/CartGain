import { NextRequest, NextResponse } from 'next/server'
import { verifySecureToken } from '@/lib/links'
import { markPaymentRecovered } from '@/lib/payments/recovery'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const data = verifySecureToken(token)
  if (!data) {
    return NextResponse.redirect(new URL('/?status=invalid_link', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'))
  }

  await markPaymentRecovered(token)

  const checkoutUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/checkout?resume=1&token=${token}`
  return NextResponse.redirect(new URL(checkoutUrl))
}
