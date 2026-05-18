import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Create test abandoned carts for testing cart recovery
 * GET http://localhost:3000/api/test/create-carts
 */
export async function GET(request: NextRequest) {
  try {
    console.log('Creating test data...')

    // Get or create a test user
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
      console.log('✅ Created test user')
    }

    // Get or create a test store
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
      console.log('✅ Created test store')
    }

    // Create an active campaign
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
          channels: ['email'],
          sendDelay: 15,
        },
      })
      console.log('✅ Created test campaign')
    }

    // Create test carts (abandoned at least 5 minutes ago)
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

    console.log(`✅ Created ${carts.length} test carts`)

    return NextResponse.json({
      success: true,
      message: `✅ Created test data successfully`,
      data: {
        user: user.id,
        store: store.id,
        campaign: campaign.id,
        carts: carts.map((c) => ({
          id: c.id,
          customer: c.customerName,
          email: c.customerEmail,
          total: c.totalValue,
        })),
      },
    })
  } catch (error: any) {
    console.error('Error creating test data:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    )
  }
}
