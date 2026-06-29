import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

const verifySchema = z.object({
  platform: z.enum(['woocommerce', 'magento', 'bigcommerce', 'custom']),
  domain: z.string().min(1, 'Store URL is required'),
  apiKey: z.string().min(1, 'API key is required'),
  apiSecret: z.string().min(1, 'API secret is required'),
})

export const dynamic = 'force-dynamic'

async function verifyWooCommerce(domain: string, consumerKey: string, consumerSecret: string) {
  const baseUrl = domain.replace(/\/+$/, '')
  const url = `${baseUrl}/wp-json/wc/v3/system_status`
  const encoded = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

  const res = await fetch(url, {
    headers: { Authorization: `Basic ${encoded}` },
    signal: AbortSignal.timeout(10000),
  })

  if (res.status === 401) throw new Error('Invalid WooCommerce credentials')
  if (res.status === 404) throw new Error('WooCommerce REST API not found at this URL. Make sure it is a valid WooCommerce store.')
  if (!res.ok) throw new Error(`WooCommerce returned status ${res.status}`)

  const data = await res.json()
  return { storeName: (data as any)?.site?.title || domain }
}

async function verifyMagento(domain: string, apiKey: string, _apiSecret: string) {
  const baseUrl = domain.replace(/\/+$/, '')
  const url = `${baseUrl}/rest/default/V1/store/websites`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  })

  if (res.status === 401) throw new Error('Invalid Magento access token')
  if (!res.ok) throw new Error(`Magento returned status ${res.status}`)

  const data = await res.json()
  const name = Array.isArray(data) ? (data[0] as any)?.name || domain : domain
  return { storeName: name }
}

async function verifyBigCommerce(domain: string, apiKey: string, apiSecret: string) {
  const match = domain.match(/store[_-]?([a-z0-9]+)/i)
  if (!match) throw new Error('BigCommerce store hash not found in the URL. Enter your store URL like: https://store-abc123.mybigcommerce.com')

  const storeHash = match[1]
  const url = `https://api.bigcommerce.com/stores/${storeHash}/v2/store`

  const res = await fetch(url, {
    headers: {
      'X-Auth-Token': apiSecret,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  })

  if (res.status === 401) throw new Error('Invalid BigCommerce API credentials')
  if (res.status === 404) throw new Error('BigCommerce store not found. Check your store hash.')
  if (!res.ok) throw new Error(`BigCommerce returned status ${res.status}`)

  const data = await res.json()
  return { storeName: (data as any)?.name || domain }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = verifySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Invalid input' }, { status: 400 })
    }

    const { platform, domain, apiKey, apiSecret } = parsed.data
    let result: { storeName: string }

    switch (platform) {
      case 'woocommerce':
        result = await verifyWooCommerce(domain, apiKey, apiSecret)
        break
      case 'magento':
        result = await verifyMagento(domain, apiKey, apiSecret)
        break
      case 'bigcommerce':
        result = await verifyBigCommerce(domain, apiKey, apiSecret)
        break
      case 'custom':
        result = { storeName: domain }
        break
      default:
        return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 })
    }

    return NextResponse.json({ verified: true, storeName: result.storeName })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed'
    return NextResponse.json({ verified: false, error: message }, { status: 400 })
  }
}
