// ── Accepted-deal follow-up (Phase 5) ────────────────────────
// When a shopper accepts a bargain but never pays, the locked price still has a
// real expiry. This module holds the deterministic scheduling + message copy so
// the job stays a thin, idempotent sender. No pricing logic here: a follow-up
// only ever points back at the already-accepted deal.

export const DEFAULT_DEAL_FOLLOWUP_DELAYS_MINUTES = [15, 180, 1200] as const
export const MAX_DEAL_FOLLOWUPS = 5

/** Clean, sorted, bounded list of follow-up delays (minutes after acceptance). */
export function normalizeDelays(input: unknown, max = MAX_DEAL_FOLLOWUPS): number[] {
  const arr = Array.isArray(input) ? input : DEFAULT_DEAL_FOLLOWUP_DELAYS_MINUTES
  const clean = arr
    .map((v) => Math.floor(Number(v)))
    .filter((v) => Number.isFinite(v) && v > 0 && v <= 60 * 24 * 7)
  const unique = Array.from(new Set(clean)).sort((a, b) => a - b)
  return unique.slice(0, Math.max(1, Math.min(max, MAX_DEAL_FOLLOWUPS)))
}

/**
 * The next stage index that is due at `now` and not already sent. Stages are
 * 0-based indexes into `delays`. Returns null when nothing is due.
 */
export function dueStage(opts: {
  acceptedAt: Date
  now: Date
  delays: number[]
  sentStages: number[]
}): number | null {
  const elapsedMin = (opts.now.getTime() - opts.acceptedAt.getTime()) / 60000
  const sent = new Set(opts.sentStages)
  for (let i = 0; i < opts.delays.length; i++) {
    if (sent.has(i)) continue
    if (elapsedMin >= opts.delays[i]) return i
    break
  }
  return null
}

export interface DealFollowupContext {
  name?: string | null
  productTitle?: string | null
  storeName?: string | null
  currencySymbol: string
  price?: number | null
  url: string
  expiresAt?: Date | null
}

function greeting(ctx: DealFollowupContext): string {
  const n = ctx.name?.trim()
  return n ? `Hey ${n}!` : 'Hey there!'
}

function priceLine(ctx: DealFollowupContext): string {
  if (ctx.price == null) return ''
  const p = `${ctx.currencySymbol}${ctx.price}`
  return ctx.productTitle ? `your locked price of ${p} for ${ctx.productTitle}` : `your locked price of ${p}`
}

function expiryLine(ctx: DealFollowupContext): string {
  if (!ctx.expiresAt) return ''
  try {
    return ` (available until ${ctx.expiresAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })})`
  } catch {
    return ''
  }
}

/** Short, honest reminder copy. No fake scarcity, no invented claims. */
export function dealFollowupText(stage: number, ctx: DealFollowupContext): string {
  const deal = priceLine(ctx)
  const expiry = expiryLine(ctx)
  if (stage <= 0) {
    return `${greeting(ctx)} Your special deal is still waiting — ${deal} is saved for you${expiry}. Ready to complete your order?\n\n${ctx.url}`
  }
  if (stage === 1) {
    return `Still thinking it over? No pressure at all. ${deal ? `${deal.charAt(0).toUpperCase()}${deal.slice(1)} is` : 'Your negotiated offer is'} still available${expiry}.\n\n${ctx.url}`
  }
  return `A quick heads-up: ${deal || 'your negotiated price'} is about to expire${expiry}. If you're still interested, you can finish your order here:\n\n${ctx.url}`
}

export function dealFollowupSubject(stage: number, ctx: DealFollowupContext): string {
  const store = ctx.storeName?.trim() || 'your store'
  if (stage <= 0) return `Your special deal is still waiting 🎉`
  if (stage === 1) return `Still thinking about it? Your offer is saved`
  return `Last call: your negotiated price is about to expire`
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export function dealFollowupHtml(stage: number, ctx: DealFollowupContext): string {
  const store = ctx.storeName?.trim() || 'Your store'
  const deal = priceLine(ctx)
  const url = safeHttpUrl(ctx.url)
  const cta = stage <= 0 ? 'Complete my order' : stage === 1 ? 'Return to my offer' : 'Finish my order'
  const heading = stage <= 0 ? 'Your special deal is still waiting' : stage === 1 ? 'Still thinking about it?' : 'Last call on your special price'
  const body = deal ? `We saved ${deal} for you.` : 'We saved your negotiated price for you.'
  return `<!DOCTYPE html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
  <div style="max-width:520px;margin:0 auto;padding:28px 20px">
    <p style="font-size:13px;color:#6b7280;margin:0 0 14px">${escapeHtml(store)}</p>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:24px">
      <h1 style="font-size:20px;margin:0 0 10px">${escapeHtml(heading)}</h1>
      <p style="font-size:15px;line-height:1.55;color:#374151;margin:0 0 18px">${escapeHtml(body)}</p>
      ${url ? `<a href="${escapeHtml(url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${escapeHtml(cta)}</a>` : ''}
    </div>
    <p style="font-size:12px;color:#9ca3af;margin:16px 0 0">If you'd rather not receive these, just reply STOP.</p>
  </div></body></html>`
}
