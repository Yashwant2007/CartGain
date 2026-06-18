import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, EmailTemplates } from '@/lib/services/email'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
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

    return NextResponse.json({ ...result })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
