import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck, Lock } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import BargainView from './bargain-view'

export const dynamic = 'force-dynamic'

// Stale theme extensions (pre c134ce14) iframe THIS url instead of
// /bargain/embed. They pass shop+product+price+mode storefront params.
// Sending those through the merchant login made customers see a sign-in
// window, and logged-in merchants browsing their own storefront landed on the
// merchant demo/"Demo already used" screen. Everyone hitting the storefront
// param signature is forwarded to the public embed — the iframe follows the
// same-origin redirect and renders the widget (or unavailable/paused card).
// The merchant live-demo preview remains the NAKED /s/bargain URL.
export default async function BargainPreviewPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const sp = (key: string): string | undefined => {
    const v = searchParams[key]
    return typeof v === 'string' && v ? v : undefined
  }
  const price = parseFloat(sp('price') ?? '')
  const hasStorefrontParams = Boolean(sp('shop') && sp('product') && Number.isFinite(price) && price > 0)

  // The storefront-param query string is ALWAYS a stale-extension iframe — both
  // for anonymous customers AND logged-in merchants browsing their own
  // storefront (they carry a session, so the old code let them fall through to
  // the merchant demo/Demo-used screen here). Send everyone to the public embed.
  // The merchant live-demo preview is the naked URL /s/bargain only.
  if (hasStorefrontParams) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (typeof v === 'string') qs.set(k, v)
    }
    redirect(`/bargain/embed?${qs.toString()}`)
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/s/bargain')
  }

  const existing = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { notificationPrefs: true },
  })
  const prefs = (existing?.notificationPrefs ?? {}) as Record<string, unknown>
  const demoUsedAt = typeof prefs.demoUsedAt === 'string' ? prefs.demoUsedAt : null

  if (demoUsedAt) {
    return <DemoUsedScreen date={demoUsedAt} />
  }

  return <BargainView />
}

function DemoUsedScreen({ date }: { date: string }) {
  const when = new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-slate-900/60 border border-blue-800/30 rounded-2xl p-8 sm:p-10 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-900/40 border border-blue-700/40 mb-5">
          <ShieldCheck className="w-7 h-7 text-blue-300" />
        </div>
        <h1 className="text-2xl font-bold mb-3">Demo already used</h1>
        <p className="text-sm text-blue-200/70 mb-2">
          You used your one live negotiation session on {when}. Each account gets one — so spam bots and
          price-shoppers toggling personas can&apos;t burn your margins.
        </p>
        <p className="text-sm text-blue-200/70 mb-6">
          The real product runs unlimited sessions on your own storefront, with every interaction protected by
          the same margins.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-primary-600 hover:bg-primary-700 rounded-lg text-sm font-semibold transition active:scale-95"
          >
            Start your free trial — first 50 carts free
          </Link>
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-blue-300/50">
            <Lock className="w-3 h-3" /> Sign-in required · One demo per account · Real stores, unlimited
          </div>
        </div>
      </div>
    </div>
  )
}