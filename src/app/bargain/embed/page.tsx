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
    const normalizedShop = shop.trim().toLowerCase().replace(/^www\./, '')
    let store = await prisma.store.findFirst({
      where: {
        isActive: true,
        OR: [{ domain: normalizedShop }, { domain: { contains: normalizedShop } }],
      },
      select: { id: true },
    })
    if (!store && normalizedShop.endsWith('.myshopify.com')) {
      // A store's domain might be stored as a bare handle (e.g. "my-store")
      // while the embed passes the full permanent domain. Match on the handle
      // so the widget still resolves for auto-created/legacy store rows.
      const handle = normalizedShop.slice(0, -'.myshopify.com'.length)
      store = await prisma.store.findFirst({
        where: { isActive: true, OR: [{ domain: handle }, { domain: { endsWith: handle } }] },
        select: { id: true },
      })
    }
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

  // Bargaining is off (or the store/product/price params are invalid) — this is
  // a customer-facing iframe, so we show NOTHING. Rendering an error card here
  // would put a "Bargaining is paused" branded block on the store's product
  // page, breaking the theme. Instead we emit an empty, transparent frame and
  // tell the storefront controller (bargain.js / bargain-embed.js) to hide the
  // whole widget via the cg_empty postMessage.
  if (!storeFound || !valid || !enabled) {
    return (
      <>
        <div aria-hidden style={{ width: 0, height: 0 }} />
        {/* Runs at parse time: kill the app layout's dark gradient so there is
            never a visible block on the merchant's theme, and ask the parent
            controller to hide the embed entirely. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var b=document.body;if(b){b.style.background='transparent';b.style.margin='0';b.style.padding='0';b.style.minHeight='0';}var r=document.documentElement;if(r){r.style.background='transparent';r.style.minHeight='0';}}catch(e){}try{if(window.parent){window.parent.postMessage({type:'cg_empty'},'*');window.parent.postMessage({type:'cg_resize',height:0},'*');}}catch(e){}})();`,
          }}
        />
      </>
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