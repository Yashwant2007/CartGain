import { parseWhatsAppEvents, isWhatsAppOptOutText } from '@/lib/whatsapp/inbound'

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

  it('recognizes opt-out keywords only', () => {
    expect(isWhatsAppOptOutText(' STOP ')).toBe(true)
    expect(isWhatsAppOptOutText('Unsubscribe')).toBe(true)
    expect(isWhatsAppOptOutText('cancel')).toBe(true)
    expect(isWhatsAppOptOutText('stop texting me about shoes')).toBe(false)
    expect(isWhatsAppOptOutText('hello there')).toBe(false)
  })
})
