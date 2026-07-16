import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { isTestEndpointAllowed } from '@/lib/job-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!isTestEndpointAllowed()) {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  try {
    let user = await prisma.user.findUnique({
      where: { email: 'test@example.com' },
    })

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          password: 'test123',
        },
      })
    }

    let store = await prisma.store.findFirst({
      where: { userId: user.id },
    })

    if (!store) {
      store = await prisma.store.create({
        data: {
          userId: user.id,
          name: 'Test Store',
          domain: 'test-store.local',
          platform: 'shopify',
          currency: 'USD',
        },
      })
    }

    let campaign = await prisma.campaign.findFirst({
      where: { storeId: store.id, isActive: true },
    })

    if (!campaign) {
      campaign = await prisma.campaign.create({
        data: {
          storeId: store.id,
          userId: user.id,
          name: 'Test Recovery Campaign',
          isActive: true,
          channels: ['whatsapp', 'sms', 'email'],
          sendDelay: 15,
        },
      })
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

    const carts = await Promise.all([
      prisma.cart.upsert({
        where: { storeId_cartId: { storeId: store.id, cartId: 'test-cart-1' } },
        update: {},
        create: {
          storeId: store.id,
          cartId: 'test-cart-1',
          customerId: 'cust-1',
          customerEmail: 'customer1@example.com',
          customerPhone: '+1234567890',
          customerName: 'John Doe',
          items: [
            { id: '1', name: 'Product 1', price: 29.99, quantity: 2 },
            { id: '2', name: 'Product 2', price: 49.99, quantity: 1 },
          ],
          totalValue: 109.97,
          abandonedAt: fiveMinutesAgo,
        },
      }),
      prisma.cart.upsert({
        where: { storeId_cartId: { storeId: store.id, cartId: 'test-cart-2' } },
        update: {},
        create: {
          storeId: store.id,
          cartId: 'test-cart-2',
          customerId: 'cust-2',
          customerEmail: 'customer2@example.com',
          customerPhone: '+9876543210',
          customerName: 'Jane Smith',
          items: [
            { id: '3', name: 'Premium Item', price: 199.99, quantity: 1 },
          ],
          totalValue: 199.99,
          abandonedAt: new Date(Date.now() - 10 * 60 * 1000),
        },
      }),
    ])

    return NextResponse.json({
      success: true,
      message: 'Test data created successfully',
      data: {
        store: store.id,
        campaign: campaign.id,
        carts: carts.map((c) => ({
          id: c.id,
          customer: c.customerName,
          total: c.totalValue,
        })),
      },
    })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to create test data' },
      { status: 500 }
    )
  }
}
