import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { verifyShopifyWebhook } from '@/lib/shopify'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const headers = request.headers

    // Verify webhook signature (in production)
    // const verified = verifyShopifyWebhook(body, headers)
    // if (!verified) {
    //   return NextResponse.json({ message: 'Invalid signature' }, { status: 401 })
    // }

    const topic = headers.get('x-shopify-topic')
    const data = JSON.parse(body)

    console.log('Shopify webhook received:', topic)

    switch (topic) {
      case 'carts/update':
        await handleCartUpdate(data)
        break
      case 'checkouts/create':
      case 'checkouts/update':
        await handleCheckout(data)
        break
      case 'orders/create':
        await handleOrderCreate(data)
        break
      default:
        console.log('Unhandled webhook topic:', topic)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ message: 'Webhook processed' })
  }
}

async function handleCartUpdate(data: any) {
  if (!data.id || !data.token) return

  // Check if cart is abandoned (no customer email or updated long ago)
  const cart = data

  // Find or create store
  // This is simplified - in production you'd look up by shopify_domain
  const store = await prisma.store.findFirst({
    where: { platform: 'shopify' },
  })

  if (!store) return

  // Upsert cart
  await prisma.cart.upsert({
    where: {
      storeId_cartId: {
        storeId: store.id,
        cartId: cart.token,
      },
    },
    update: {
      items: JSON.stringify(cart.items || []),
      totalValue: cart.total_price ? parseFloat(cart.total_price) / 100 : 0,
      customerEmail: cart.email,
      customerPhone: cart.phone,
      customerName: cart.customer?.name,
      updatedAt: new Date(),
    },
    create: {
      storeId: store.id,
      cartId: cart.token,
      items: JSON.stringify(cart.items || []),
      totalValue: cart.total_price ? parseFloat(cart.total_price) / 100 : 0,
      customerEmail: cart.email,
      customerPhone: cart.phone,
      customerName: cart.customer?.name,
      currency: cart.currency || 'USD',
    },
  })
}

async function handleCheckout(data: any) {
  // Similar to cart update but with more customer data
  await handleCartUpdate(data)
}

async function handleOrderCreate(data: any) {
  // Mark cart as recovered when order is created
  const cartToken = data.token || data.cart_token

  if (!cartToken) return

  const store = await prisma.store.findFirst({
    where: { platform: 'shopify' },
  })

  if (!store) return

  // Find the cart
  const cart = await prisma.cart.findUnique({
    where: {
      storeId_cartId: {
        storeId: store.id,
        cartId: cartToken,
      },
    },
  })

  if (cart) {
    // Update cart as recovered
    await prisma.cart.update({
      where: { id: cart.id },
      data: {
        isRecovered: true,
        recoveredAt: new Date(),
        recoveredVia: 'shopify_order',
      },
    })

    // Create recovered cart record
    const orderTotal = parseFloat(data.total_price || '0')
    await prisma.recoveredCart.upsert({
      where: {
        cartId: cart.id,
      },
      update: {
        recoveredValue: orderTotal,
        recoveredAt: new Date(),
      },
      create: {
        storeId: store.id,
        cartId: cart.id,
        recoveredValue: orderTotal,
        channel: 'shopify_order',
        netRevenue: orderTotal,
      },
    })

    // Update analytics
    await prisma.analytics.upsert({
      where: {
        userId_date: {
          userId: store.userId,
          date: new Date(new Date().toDateString()),
        },
      },
      update: {
        cartsRecovered: { increment: 1 },
        revenueRecovered: { increment: orderTotal },
      },
      create: {
        userId: store.userId,
        cartsRecovered: 1,
        revenueRecovered: orderTotal,
      },
    })
  }
}
