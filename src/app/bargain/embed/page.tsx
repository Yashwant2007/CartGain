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
// Query params: shop, product, variant, price, currency, title, image, mode,
// linkout, view. The store is resolved server-side by the Shopify shop domain,
// and the widget is driven by the merchant's saved BargainConfig (persona,
// language, enabled).
export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const sp = (key: string): string | undefined => {
    const v = searchParams[key]
    return typeof v === 'string' ? v : undefined
  }

  const safeDecode = (value: string): string => {
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  const shop = sp('shop')
  const shopifyProductId = sp('product')
  const variantId = sp('variant')
  const price = parseFloat(sp('price') ?? '')
  const currency = sp('currency') || 'INR'
  const title = sp('title')
  const image = sp('image')
  const mode = sp('mode') === 'cart' ? 'cart' : 'item'
  // Drawer mode: the theme controller hosts the iframe in a fixed right-side
  // drawer / full-screen mobile sheet and owns open/close + variant sync.
  const view = sp('view') === 'drawer' ? 'drawer' : 'inline'

  // Shopify themes url_encode these params when they build the embed src —
  // decode once here so the widget never renders percent-encoded text/URLs.
  const decodedTitle = title ? safeDecode(title) : title
  const decodedImage = image ? safeDecode(image) : image

  let storeId: string | null = null
  let storeFound = false
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
      // Bargaining is ON for any connected, active store. The `enabled` master
      // toggle is preserved in the dashboard as the merchant's preference, but a
      // widget added in the theme editor always renders here — previously a
      // stale `enabled=false` default silently hid the whole widget
      // ("added it in the theme editor but it's not showing").
      const config = await prisma.bargainConfig.findUnique({ where: { storeId: store.id } })
      persona = config?.aiPersona ?? 'friendly_shopkeeper'
      language = config?.language ?? 'auto'
    }
  }

  const valid = storeId && shopifyProductId && Number.isFinite(price) && price > 0

  // The store/product/price params are invalid (or no active store was found) —
  // this is a customer-facing iframe, so we show NOTHING. Rendering an error
  // card here would put a branded block on the store's product page, breaking
  // the theme. Instead we emit an empty, transparent frame and tell the
  // storefront controller (bargain.js / bargain-embed.js) to hide the whole
  // widget via the cg_empty postMessage.
  if (!storeFound || !valid) {
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
      productTitle={decodedTitle || 'this item'}
      image={decodedImage}
      language={language}
      persona={persona}
      mode={mode}
      linkout={sp('linkout')}
      view={view}
      embedded
    />
  )
}