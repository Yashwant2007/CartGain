import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAuthContext, unauthorizedResponse } from '@/lib/embedded-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req)

    if (!auth?.user?.id) {
      return unauthorizedResponse()
    }
    const userId = auth.user.id

    const store = await prisma.store.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    })

    if (!store) {
      return NextResponse.json({ message: 'No store found for this account' }, { status: 404 })
    }

    const wooConnection = await prisma.platformConnection.findUnique({
      where: { storeId_platform: { storeId: store.id, platform: 'woocommerce' } },
      select: {
        status: true,
        webhookUrl: true,
        webhookSecret: true,
        lastHealthStatus: true,
        lastHealthCheckAt: true,
        lastHealthDetail: true,
        updatedAt: true,
        credentials: {
          where: { status: 'active' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { keyFingerprint: true, status: true },
        },
        _count: { select: { products: true, orders: true } },
      },
    })
    const wooConnected = Boolean(wooConnection && wooConnection.status === 'active' && wooConnection.credentials.length > 0)

    const response = {
      store: {
        id: store.id,
        name: store.name,
        domain: store.domain,
        platform: store.platform,
        connected: Boolean(store.apiKey || store.apiSecret || store.webhookUrl),
        lastSync: store.updatedAt.toISOString(),
      },
      integrations: [
        {
          id: 'shopify',
          name: 'Shopify',
          description: 'Connect your Shopify store for automatic cart tracking',
          icon: '🛒',
          connected: store.platform === 'shopify',
          status: store.platform === 'shopify' ? 'active' : 'disconnected',
          storeName: store.name,
          lastSync: store.updatedAt.toISOString(),
        },
        {
          id: 'woocommerce',
          name: 'WooCommerce',
          description: 'Sync carts from your WooCommerce store',
          icon: '📦',
          connected: wooConnected,
          status: wooConnected ? 'active' : store.platform === 'woocommerce' ? 'attention' : 'disconnected',
          webhookConfigured: Boolean(wooConnection?.webhookSecret),
          healthStatus: wooConnection?.lastHealthStatus ?? null,
          healthDetail: wooConnection?.lastHealthDetail ?? null,
          lastHealthCheckAt: wooConnection?.lastHealthCheckAt?.toISOString() ?? null,
          lastSync: wooConnection?.updatedAt.toISOString() ?? null,
          credentialFingerprint: wooConnection?.credentials[0]?.keyFingerprint ?? null,
          counts: wooConnection?._count ?? { products: 0, orders: 0 },
        },
        {
          id: 'magento',
          name: 'Magento',
          description: 'Enterprise e-commerce integration',
          icon: '🔷',
          connected: store.platform === 'magento',
          status: store.platform === 'magento' ? 'active' : 'disconnected',
        },
        {
          id: 'bigcommerce',
          name: 'BigCommerce',
          description: 'Connect BigCommerce for cart recovery',
          icon: '🏪',
          connected: store.platform === 'bigcommerce',
          status: store.platform === 'bigcommerce' ? 'active' : 'disconnected',
        },
        {
          id: 'custom',
          name: 'Custom API',
          description: 'Use our REST API for custom integrations',
          icon: '⚡',
          connected: Boolean(store.apiKey || store.apiSecret || store.webhookUrl),
          status: Boolean(store.apiKey || store.apiSecret || store.webhookUrl) ? 'active' : 'available',
        },
      ],
      messagingServices: [
        {
          id: 'whatsapp',
          name: 'WhatsApp Business',
          description: 'WhatsApp messages via Meta Business API',
          icon: '📱',
          connected: Boolean(process.env.WHATSAPP_BUSINESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
          status: process.env.WHATSAPP_BUSINESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID ? 'active' : 'disconnected',
        },
        {
          id: 'resend',
          name: 'Resend',
          description: 'Email delivery via Resend',
          icon: '📧',
          connected: Boolean(process.env.RESEND_API_KEY),
          status: process.env.RESEND_API_KEY ? 'active' : 'disconnected',
        },
        {
          id: 'onesignal',
          name: 'OneSignal',
          description: 'Push notifications',
          icon: '🔔',
          connected: false,
          status: 'disconnected',
          credits: 0,
        },
      ],
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Integration status error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
