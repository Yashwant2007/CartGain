import { NextRequest, NextResponse } from 'next/server'

// Sets the cg_oauth_intent cookie server-side so it can carry the
// Partitioned (CHIPS) attribute. Inside the Shopify admin iframe a
// document.cookie write is dropped by the browser (third-party cookie
// blocking), which broke sign-up intent — the intent had to be readable
// by the Google OAuth popup's callback request, which inherits the
// iframe's partition under CHIPS.
//
// The cookie is short-lived and HttpOnly; the sign-in callback consumes
// (and clears) it.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const intent = body?.intent
  if (intent !== 'signin' && intent !== 'signup') {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  const res = NextResponse.json({ ok: true })
  res.headers.append(
    'Set-Cookie',
    `cg_oauth_intent=${intent}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=None; Partitioned`
  )
  return res
}