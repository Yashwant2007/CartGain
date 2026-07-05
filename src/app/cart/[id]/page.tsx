import Image from 'next/image'
import Link from 'next/link'
import prisma from '@/lib/db'
import { notFound } from 'next/navigation'
import { ArrowLeft, ShoppingBag, Zap } from 'lucide-react'

export const dynamic = 'force-dynamic'

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', INR: '₹', EUR: '€', GBP: '£', JPY: '¥',
  AUD: 'A$', CAD: 'C$', SGD: 'S$', AED: 'د.إ', CNY: '¥',
}

function getSymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency?.toUpperCase()] || currency || '₹'
}

export default async function CartRecoveryPage({ params }: { params: { id: string } }) {
  const cart = await prisma.cart.findUnique({
    where: { id: params.id },
    include: { store: true },
  })

  if (!cart || cart.isRecovered) {
    notFound()
  }

  const symbol = getSymbol(cart.currency || cart.store.currency)
  const items = Array.isArray(cart.items) ? cart.items : []
  const checkoutUrl = `https://${cart.store.domain}/cart/${cart.cartId}`

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      <nav className="border-b border-blue-800/30 bg-slate-900/80 backdrop-blur-lg">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary-400" />
          <span className="font-bold text-white">CartGain</span>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 py-12">
        <Link href={`https://${cart.store.domain}`} className="inline-flex items-center gap-2 text-blue-300 hover:text-blue-200 mb-8 text-sm">
          <ArrowLeft className="w-4 h-4" />
          Back to {cart.store.name}
        </Link>

        <div className="bg-slate-800/50 border border-blue-700/30 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <ShoppingBag className="w-6 h-6 text-cyan-400" />
            <h1 className="text-2xl font-bold text-white">Your Cart</h1>
          </div>

          {cart.customerName && (
            <p className="text-blue-200 mb-6">Hi {cart.customerName}, these items are still waiting for you!</p>
          )}

          <div className="space-y-4 mb-6">
            {items.length === 0 ? (
              <p className="text-blue-300/60 text-sm">Items in your cart are being loaded.</p>
            ) : (
              items.map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-4 p-4 bg-slate-700/40 rounded-xl border border-blue-700/20">
                  <Image
                    src={item.image || 'https://via.placeholder.com/64'}
                    alt={item.name}
                    width={64}
                    height={64}
                    className="w-16 h-16 object-cover rounded-lg"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{item.name}</p>
                    <p className="text-sm text-blue-300/70">
                      {symbol}{item.price?.toFixed(2)} × {item.quantity || 1}
                    </p>
                  </div>
                  <p className="font-semibold text-cyan-300">{symbol}{(item.price * (item.quantity || 1)).toFixed(2)}</p>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-blue-700/30 pt-4 mb-8">
            <div className="flex justify-between items-center">
              <span className="text-blue-200">Total</span>
              <span className="text-2xl font-bold text-white">{symbol}{cart.totalValue.toFixed(2)}</span>
            </div>
          </div>

          <a
            href={checkoutUrl}
            className="block w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-center font-semibold rounded-xl hover:shadow-lg hover:shadow-cyan-500/50 transition-all active:scale-95"
          >
            Complete Your Purchase
          </a>

          <p className="text-center text-xs text-blue-400/60 mt-4">
            Secured checkout via {cart.store.name}
          </p>
        </div>
      </main>
    </div>
  )
}
