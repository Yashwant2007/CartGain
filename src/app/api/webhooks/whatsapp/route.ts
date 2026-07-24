import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode')
  const token = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN

  // Debug log for troubleshooting
  console.log('[WhatsApp Webhook] mode:', mode, 'received_token:', token, 'expected_token:', expectedToken ? 'SET' : 'NOT_SET', 'challenge:', challenge)

  if (mode === 'subscribe' && token && expectedToken && token === expectedToken) {
    return new NextResponse(challenge, { status: 200 })
  }

  if (!expectedToken) {
    return new NextResponse('WHATSAPP_VERIFY_TOKEN not configured on server', { status: 500 })
  }

  return new NextResponse('Forbidden — token mismatch', { status: 403 })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  console.log('WhatsApp webhook received:', JSON.stringify(body, null, 2))
  return NextResponse.json({ status: 'ok' })
}
