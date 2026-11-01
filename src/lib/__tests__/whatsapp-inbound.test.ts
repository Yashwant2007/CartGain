import {
  parseWhatsAppEvents,
  isWhatsAppOptInText,
  isWhatsAppOptOutText,
} from '@/lib/whatsapp/inbound'

describe('whatsapp inbound parsing', () => {
  it('flattens messages and statuses across entries/changes', () => {
    const body = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: 'PN1' },
                messages: [{ id: 'wamid.M1', from: '919876543210', text: { body: 'Hello' } }],
                statuses: [{ id: 'wamid.M0', status: 'delivered', recipient_id: '919876543210' }],
              },
            },
          ],
        },
      ],
    }

    const events = parseWhatsAppEvents(body)
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({
      kind: 'message',
      wamid: 'wamid.M1',
      from: '919876543210',
      text: 'Hello',
      phoneNumberId: 'PN1',
    })
    expect(events[1]).toEqual({
      kind: 'status',
      wamid: 'wamid.M0',
      status: 'delivered',
      recipientPhone: '919876543210',
      phoneNumberId: 'PN1',
    })
  })

  it('returns [] for payloads with no customer-facing events', () => {
    expect(parseWhatsAppEvents({})).toEqual([])
    expect(parseWhatsAppEvents({ entry: [{ changes: [{ value: {} }] }] })).toEqual([])
  })

  it('keeps the delivery failure reason on a failed status', () => {
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'PN1' },
                statuses: [
                  {
                    id: 'wamid.M0',
                    status: 'failed',
                    recipient_id: '919876543210',
                    errors: [
                      {
                        code: 131026,
                        title: 'Message undeliverable',
                        message: 'Message undeliverable',
                        error_data: { details: 'Recipient is not on WhatsApp' },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    }

    const [event] = parseWhatsAppEvents(body)
    expect(event).toEqual({
      kind: 'status',
      wamid: 'wamid.M0',
      status: 'failed',
      recipientPhone: '919876543210',
      phoneNumberId: 'PN1',
      errors: [
        {
          code: 131026,
          title: 'Message undeliverable',
          message: 'Message undeliverable',
          details: 'Recipient is not on WhatsApp',
        },
      ],
    })
  })

  it('recognizes opt-out keywords only', () => {
    expect(isWhatsAppOptOutText(' STOP ')).toBe(true)
    expect(isWhatsAppOptOutText('Unsubscribe')).toBe(true)
    expect(isWhatsAppOptOutText('cancel')).toBe(true)
    expect(isWhatsAppOptOutText('stop texting me about shoes')).toBe(false)
    expect(isWhatsAppOptOutText('hello there')).toBe(false)
  })

  it('grants opt-in only for unambiguous keywords', () => {
    expect(isWhatsAppOptInText(' START ')).toBe(true)
    expect(isWhatsAppOptInText('unstop')).toBe(true)
    expect(isWhatsAppOptInText('subscribe')).toBe(true)
    expect(isWhatsAppOptInText('yes')).toBe(false)
    expect(isWhatsAppOptInText('haan')).toBe(false)
    expect(isWhatsAppOptInText('i agree')).toBe(false)
    expect(isWhatsAppOptInText('yes please send it')).toBe(false)
  })
})
