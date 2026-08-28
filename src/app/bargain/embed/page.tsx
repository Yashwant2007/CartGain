import type { Metadata } from 'next'
import prisma from '@/lib/db'
import BargainWidget from '@/components/bargain/BargainWidget'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Bargain | CartGain',
  description: 'Real-time price negotiation for your cart.',
  robots: { index: false, follow: false },
}

// Public storefront embed — iframed on Shopify product + cart pages (no auth).
// Query params: shop, product, variant, price, currency, title, image, mode, linkout
// The store is resolved server-side by the Shopify shop domain, and the widget
// is driven by the merchant's saved BargainConfig (persona, language, enabled).
export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const sp = (key: string): string | undefined => {
    const v = searchParams[key]
    return typeof v === 'string' ? v : undefined
  }

  const shop = sp('shop')
  const shopifyProductId = sp('product')
  const variantId = sp('variant')
  const price = parseFloat(sp('price') ?? '')
  const currency = sp('currency') || 'INR'
  const title = sp('title')
  const image = sp('image')
  const mode = sp('mode') === 'cart' ? 'cart' : 'item'

  let storeId: string | null = null
  let storeFound = false
  let enabled = false
  let persona: string | undefined
  let language: string | undefined

  if (shop) {
    const store = await prisma.store.findFirst({
      where: {
        isActive: true,
        OR: [{ domain: shop }, { domain: { contains: shop } }],
      },
      select: { id: true },
    })
    if (store) {
      storeFound = true
      storeId = store.id
      const config = await prisma.bargainConfig.findUnique({ where: { storeId: store.id } })
      enabled = config?.enabled ?? false
      persona = config?.aiPersona ?? 'friendly_shopkeeper'
      language = config?.language ?? 'auto'
    }
  }

  const valid = storeId && shopifyProductId && Number.isFinite(price) && price > 0

  if (!storeFound || !valid) {
    return (
      <div
        style={{
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 16,
          padding: '20px 24px',
          color: '#64748b',
          fontSize: 13,
          lineHeight: 1.5,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 22, marginBottom: 6 }}>🤝</div>
        <div style={{ fontWeight: 600, color: '#334155', marginBottom: 2 }}>Price negotiation is not available for this store.</div>
        Please continue with the regular checkout.
      </div>
    )
  }

  if (!enabled) {
    return (
      <div
        style={{
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 16,
          padding: '20px 24px',
          color: '#64748b',
          fontSize: 13,
          lineHeight: 1.5,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 22, marginBottom: 6 }}>🔒</div>
        <div style={{ fontWeight: 600, color: '#334155', marginBottom: 2 }}>Bargaining is temporarily paused by this store.</div>
        Please continue with the regular checkout.
      </div>
    )
  }

  return (
    <BargainWidget
      storeId={storeId as string}
      shopifyProductId={shopifyProductId as string}
      variantId={variantId}
      originalPrice={price}
      currency={currency}
      productTitle={title || 'this item'}
      image={image}
      language={language}
      persona={persona}
      mode={mode}
      linkout={sp('linkout')}
      embedded
    />
  )
}