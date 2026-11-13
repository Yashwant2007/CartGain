import { NextRequest, NextResponse } from 'next/server'
import { loadQuoteByToken, toPublicQuote } from '@/lib/bargain/quote'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

// GET /api/bargain/quote/[token] — read/validate a quote by its signed token.
// Public: the token is the credential and it is unguessable + tamper-proof. The
// response is always the PUBLIC projection (no floor, no buyer handles).
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  if (!isFeatureEnabled('BARGAIN_QUOTE')) {
    return NextResponse.json({ message: 'Not available' }, { status: 404 })
  }
  const rate = await checkSimpleRateLimit(`bargain_quote_read_${clientIp(request.headers)}`)
  if (!rate.allowed) {
    return NextResponse.json({ message: 'Too many requests. Please try again later.' }, {
      status: 429,
      headers: { 'Retry-After': String(rate.retryAfter) },
    })
  }

  const quote = await loadQuoteByToken(params.token)
  if (!quote) {
    return NextResponse.json({ message: 'Quote not found' }, { status: 404 })
  }
  return NextResponse.json({ quote: toPublicQuote(quote) })
}
