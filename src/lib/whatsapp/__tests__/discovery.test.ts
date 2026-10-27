import { discoverWhatsAppPhoneNumbers } from '../discovery'

describe('WhatsApp phone-number discovery', () => {
  const originalFetch = global.fetch
  const originalWaba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  const originalToken = process.env.WHATSAPP_BUSINESS_TOKEN

  afterEach(() => {
    global.fetch = originalFetch
    if (originalWaba === undefined) delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
    else process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = originalWaba
    if (originalToken === undefined) delete process.env.WHATSAPP_BUSINESS_TOKEN
    else process.env.WHATSAPP_BUSINESS_TOKEN = originalToken
  })

  it('reads every phone number from the configured WhatsApp Business Account', async () => {
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = 'waba-123'
    process.env.WHATSAPP_BUSINESS_TOKEN = 'token-123'
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: '111222333',
            display_phone_number: '+91 90000 00000',
            verified_name: 'Store One',
            status: 'CONNECTED',
            quality_rating: 'GREEN',
            platform_type: 'CLOUD_API',
          },
        ],
      }),
    })
    global.fetch = fetchMock as any

    const result = await discoverWhatsAppPhoneNumbers()

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/waba-123/phone_numbers'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token-123' } }),
    )
    expect(result.ok).toBe(true)
    expect(result.numbers).toEqual([
      expect.objectContaining({
        id: '111222333',
        displayPhoneNumber: '+91 90000 00000',
        verifiedName: 'Store One',
        wabaId: 'waba-123',
      }),
    ])
  })

  it('discovers the WABA through the token when no WABA id is configured', async () => {
    delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
    process.env.WHATSAPP_BUSINESS_TOKEN = 'token-123'
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('/me/businesses')) {
        return { ok: true, json: async () => ({ data: [{ id: 'biz-1', name: 'Biz' }] }) }
      }
      if (url.includes('/owned_whatsapp_business_accounts')) {
        return { ok: true, json: async () => ({ data: [{ id: 'waba-9', name: 'Brand WABA' }] }) }
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ id: '999888777', display_phone_number: '+91 91111 11111', status: 'CONNECTED' }],
        }),
      }
    })
    global.fetch = fetchMock as any

    const result = await discoverWhatsAppPhoneNumbers()

    expect(result.ok).toBe(true)
    expect(result.numbers[0]).toEqual(
      expect.objectContaining({ id: '999888777', wabaId: 'waba-9', wabaName: 'Brand WABA' }),
    )
  })

  it('fails closed without a token', async () => {
    delete process.env.WHATSAPP_BUSINESS_TOKEN
    delete process.env.WHATSAPP_ACCESS_TOKEN
    delete process.env.META_WHATSAPP_TOKEN
    const result = await discoverWhatsAppPhoneNumbers()
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not connected')
  })
})
