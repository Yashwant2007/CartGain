import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

function verifyShopifyHmac(rawBody: string, hmacHeader: string | null): boolean {
  const secret = process.env.SHOPIFY_API_SECRET
  if (!secret || !hmacHeader) return false
  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const hmac = req.headers.get('x-shopify-hmac-sha256')
  const topic = req.headers.get('x-shopify-topic') || ''

  if (!verifyShopifyHmac(rawBody, hmac)) {
    return NextResponse.json({ error: 'Invalid HMAC' }, { status: 401 })
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    if (topic === 'customers/data_request') {
      const shopDomain = req.headers.get('x-shopify-shop-domain')
      if (shopDomain) {
        const store = await prisma.store.findFirst({ where: { domain: { contains: shopDomain.replace('.myshopify.com','') } } })
        if (store) {
          const customerId = body?.customer?.id?.toString()
          const email = body?.customer?.email?.toLowerCase()
          const identities = await prisma.customerIdentity.findMany({
            where: {
              storeId: store.id,
              OR: [
                ...(customerId ? [{ shopifyCustomerId: customerId }] : []),
                ...(email ? [{ email }] : []),
              ],
            },
            take: 10,
          })
          console.log(`[privacy] data_request store=${store.id} found=${identities.length}`)
        }
      }
      return NextResponse.json({ success: true })
    }

    if (topic === 'customers/redact' || topic === 'customers/erase') {
      const shopDomain = req.headers.get('x-shopify-shop-domain')
      if (shopDomain) {
        const store = await prisma.store.findFirst({ where: { domain: { contains: shopDomain.replace('.myshopify.com','') } } })
        if (store) {
          const customerId = body?.customer?.id?.toString()
          const email = body?.customer?.email?.toLowerCase()
          const phone = body?.customer?.phone

          const ors: any[] = []
          if (customerId) ors.push({ shopifyCustomerId: customerId })
          if (email) ors.push({ email })
          if (phone) ors.push({ phone })
          if (ors.length === 0) return NextResponse.json({ success: true })

          const identities = await prisma.customerIdentity.findMany({ where: { storeId: store.id, OR: ors } })
          for (const id of identities) {
            await prisma.customerIdentity.update({
              where: { id: id.id },
              data: { email: null, phone: null, suppressed: true, optedOutAt: new Date() },
            })
          }
          const updateWhere: any = { storeId: store.id }
          if (email) updateWhere.email = email
          else if (customerId) updateWhere.customerId = customerId
          await prisma.behavioralEvent.updateMany({ where: updateWhere, data: { email: null, phone: null } })
          console.log(`[privacy] redact store=${store.id} identities=${identities.length}`)
        }
      }
      return NextResponse.json({ success: true })
    }

    if (topic === 'shop/redact') {
      console.log('[privacy] shop/redact received')
      return NextResponse.json({ success: true })
    }
  } catch (err) {
    console.error('privacy webhook error:', err)
  }

  return NextResponse.json({ success: true })
}
