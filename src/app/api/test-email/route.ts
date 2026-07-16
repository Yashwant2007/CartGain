import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, EmailTemplates } from '@/lib/services/email'
import { isTestEndpointAllowed } from '@/lib/job-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!isTestEndpointAllowed()) {
    return NextResponse.json({ message: 'Not available' }, { status: 403 })
  }

  try {
    const { email } = await request.json()
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

    const html = EmailTemplates.abandoned(
      'Test User',
      [
        { name: 'Vitamin C Serum', price: 499, quantity: 1, image: 'https://via.placeholder.com/80' },
        { name: 'Sunscreen SPF 50', price: 349, quantity: 2, image: 'https://via.placeholder.com/80' },
      ],
      1197,
      'https://example.com/cart/test',
      'CartGain',
      '₹'
    )

    const result = await sendEmail({
      to: email,
      subject: 'CartGain Email Test',
      html,
      text: 'This is a test email from CartGain to verify email delivery.',
    })

    return NextResponse.json({ success: result.success })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to send test email' },
      { status: 500 }
    )
  }
}
