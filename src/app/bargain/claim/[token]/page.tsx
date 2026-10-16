import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowRight, CheckCircle2, ShieldCheck, Tag } from 'lucide-react'
import prisma from '@/lib/db'
import { fetchShopifyProductDetail } from '@/lib/shopify'
import { buildBargainCheckoutUrl } from '@/lib/bargain/purchase'
import CopyCodeButton from './CopyCodeButton'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your negotiated price | CartGain',
  description: 'Complete your purchase at the price you negotiated.',
  robots: { index: false, follow: false },
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', INR: '₹', EUR: '€', GBP: '£', JPY: '¥',
  AUD: 'A$', CAD: 'C$', SGD: 'S$', AED: 'AED ', CNY: '¥',
}

function money(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Post-bargain purchase window: the buyer's private link back to the deal they
// negotiated (or the last price we offered), with the code already wired into a
// one-tap checkout link. Token-guarded — never guessable, never indexed.
export default async function BargainClaimPage({ params }: { params: { token: string } }) {
  const session = await prisma.bargainSession.findUnique({
    where: { claimToken: params.token },
    include: { store: true },
  })
  if (!session || !session.store) notFound()

  const currency = session.store.currency || 'INR'
  const detail = await fetchShopifyProductDetail(session.store, session.shopifyProductId).catch(() => null)

  const title = detail?.title || 'Your item'
  const description = detail?.body_plain?.trim() || null
  const image = detail?.image?.src || null
  const productUrl = detail?.handle ? `https://${session.store.domain}/products/${detail.handle}` : `https://${session.store.domain}`

  const price = session.finalPrice ?? session.originalPrice
  const hasDiscount = price < session.originalPrice
  const code = session.discountCode
  const purchaseUrl =
    session.purchaseUrl ??
    (code
      ? buildBargainCheckoutUrl({
          domain: session.store.domain,
          code,
          variantId: session.variantId,
          quantity: session.bulkQuantity,
        })
      : null)

  const purchased = session.status === 'purchased'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white">
      <nav className="border-b border-blue-800/30 bg-slate-900/80 backdrop-blur-lg">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-cyan-400" />
          <span className="font-bold">CartGain</span>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-slate-800/50 border border-blue-700/30 rounded-2xl p-6 sm:p-8">
          {purchased ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-2">You&apos;re all set</h1>
              <p className="text-blue-200">
                This negotiated price has already been used on an order. Thanks for shopping with {session.store.name}!
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <Tag className="w-6 h-6 text-cyan-400" />
                <h1 className="text-2xl font-bold">
                  {hasDiscount ? 'Your negotiated price is ready' : 'Complete your purchase'}
                </h1>
              </div>

              <div className="flex items-start gap-4 mb-6">
                {image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt={title}
                    width={96}
                    height={96}
                    className="w-24 h-24 object-cover rounded-xl border border-blue-700/30"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-lg">{title}</h2>
                  {description && (
                    <p className="text-sm text-blue-300/80 mt-1 line-clamp-3">{description}</p>
                  )}
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-xl font-bold text-white">{money(price, currency)}</span>
                    {hasDiscount && (
                      <span className="text-sm text-blue-300/60 line-through">
                        {money(session.originalPrice, currency)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {code ? (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 mb-6">
                  <div className="text-xs uppercase tracking-wide text-cyan-200/80 mb-1">Your personal code</div>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <code className="text-lg font-bold text-cyan-100">{code}</code>
                    <CopyCodeButton code={code} />
                  </div>
                  <p className="text-xs text-blue-300/70 mt-2">
                    Bound to you — single use, can&apos;t be shared. Apply it automatically with the button below.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-blue-300/80 mb-6">
                  Your negotiation has ended. Head back to the store to grab this item.
                </p>
              )}

              {purchaseUrl && code ? (
                <a
                  href={purchaseUrl}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-gradient-to-r from-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/50 transition-all active:scale-95"
                >
                  Checkout at your price <ArrowRight className="w-4 h-4" />
                </a>
              ) : (
                <a
                  href={productUrl}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-gradient-to-r from-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/50 transition-all active:scale-95"
                >
                  Back to the product <ArrowRight className="w-4 h-4" />
                </a>
              )}

              <p className="text-center text-xs text-blue-400/60 mt-4">
                Secured checkout via {session.store.name}
              </p>
            </>
          )}
        </div>

        <p className="text-center text-xs text-blue-400/60 mt-6">
          <Link href={`https://${session.store.domain}`} className="hover:text-blue-300">
            Return to {session.store.name}
          </Link>
        </p>
      </main>
    </div>
  )
}
