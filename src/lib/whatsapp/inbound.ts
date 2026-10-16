// Parsing for Meta WhatsApp Cloud API inbound webhooks (field = "messages").
// Kept pure and dependency-free so it is unit-testable and safe to call from the
// webhook hot path after the X-Hub-Signature-256 check has passed.

export type WhatsAppInboundEvent =
  | {
      kind: 'message'
      wamid?: string
      from?: string
      text: string
      phoneNumberId?: string
    }
  | {
      kind: 'status'
      wamid?: string
      status: string
      recipientPhone?: string
      phoneNumberId?: string
    }

// Truthy "unsubscribe me" keywords a customer can text back. Kept deliberately
// tight (exact match after trim/lowercase) so ordinary chat is not misread.
const OPT_OUT_KEYWORDS = new Set([
  'stop',
  'unsubscribe',
  'optout',
  'opt-out',
  'opt out',
  'cancel',
  'end',
  'quit',
  'remove me',
  'band karo',
])

export function isWhatsAppOptOutText(text: string): boolean {
  return OPT_OUT_KEYWORDS.has(text.trim().toLowerCase())
}

// Flattens a Meta webhook body into discrete message/status events across every
// entry/change (Meta batches them). Returns [] for payloads that carry no
// customer-facing event.
export function parseWhatsAppEvents(body: unknown): WhatsAppInboundEvent[] {
  const events: WhatsAppInboundEvent[] = []
  const root = body as any
  const entries = Array.isArray(root?.entry) ? root.entry : []

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : []
    for (const change of changes) {
      const value = change?.value
      if (!value) continue
      const phoneNumberId = value?.metadata?.phone_number_id

      const messages = Array.isArray(value.messages) ? value.messages : []
      for (const msg of messages) {
        const text = msg?.text?.body
          ?? msg?.button?.text
          ?? msg?.interactive?.button_reply?.title
          ?? msg?.interactive?.list_reply?.title
          ?? ''
        events.push({
          kind: 'message',
          wamid: msg?.id,
          from: msg?.from,
          text: String(text),
          phoneNumberId,
        })
      }

      const statuses = Array.isArray(value.statuses) ? value.statuses : []
      for (const st of statuses) {
        events.push({
          kind: 'status',
          wamid: st?.id,
          status: String(st?.status ?? ''),
          recipientPhone: st?.recipient_id,
          phoneNumberId,
        })
      }
    }
  }

  return events
}
