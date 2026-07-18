import BargainWidget from '@/components/bargain/BargainWidget'

export const dynamic = 'force-static'

// Public embed page — iframe-able on Shopify product pages.
// Query params: storeId, shopifyProductId, variantId, originalPrice, currency, cartToken, customerEmail, customerPhone, productTitle
export default function EmbedPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>
}) {
  const sp = searchParams
  const storeId = sp.storeId
  const shopifyProductId = sp.shopifyProductId
  const originalPriceRaw = sp.originalPrice
  const originalPrice = originalPriceRaw ? parseFloat(originalPriceRaw) : NaN

  const missing = !storeId || !shopifyProductId || !originalPrice || originalPrice <= 0

  if (missing) {
    return (
      <div
        style={{
          fontFamily: 'system-ui, sans-serif',
          padding: 24,
          color: '#9ca3af',
          background: '#0b1220',
          minHeight: 200,
          borderRadius: 12,
          fontSize: 14,
        }}
      >
        Bargain widget requires <code>storeId</code>, <code>shopifyProductId</code> and <code>originalPrice</code> query params.
      </div>
    )
  }

  return (
    <>
      <BargainWidget
        storeId={storeId as string}
        shopifyProductId={shopifyProductId as string}
        variantId={sp.variantId}
        originalPrice={originalPrice}
        currency={sp.currency ?? 'INR'}
        cartToken={sp.cartToken}
        customerEmail={sp.customerEmail}
        customerPhone={sp.customerPhone}
        productTitle={sp.productTitle}
      />
    </>
  )
}
