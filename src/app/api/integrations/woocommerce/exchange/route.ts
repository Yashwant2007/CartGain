import { NextRequest, NextResponse } from 'next/server'
import { getAppBaseUrl } from '@/lib/app-base-url'
import { checkRateLimit } from '@/lib/rate-limit'
import { exchangeSchema } from '@/lib/woocommerce/schemas'
import { connectWooCommerce, WooServiceError } from '@/lib/woocommerce/service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const limit = await checkRateLimit('woocommerce_exchange', { maxAttempts: 10, windowMs: 5 * 60 * 1000 })
  if (!limit.success) {
    return NextResponse.json(
      { error: 'Too many connection attempts' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  try {
    const parsed = exchangeSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Invalid input' }, { status: 400 })
    }

    const result = await connectWooCommerce({
      ...parsed.data,
      webhookUrl: `${getAppBaseUrl(req)}/api/webhooks/woocommerce`,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof WooServiceError) {
      return NextResponse.json({ error: error.code }, { status: error.status })
    }
    return NextResponse.json({ error: 'Connection failed' }, { status: 500 })
  }
}
