import { sendWhatsAppMessage } from '../whatsapp'

const originalFetch = global.fetch

function metaError(code: number, message: string) {
  return { ok: false, status: 400, json: async () => ({ error: { code, message } }) }
}

function metaOk(id = 'wamid.test') {
  return { ok: true, status: 200, json: async () => ({ messages: [{ id }] }) }
}

function headerLink(body: any): string | undefined {
  const components = body?.template?.components ?? []
  const header = components.find((c: any) => c.type === 'header')
  return header?.parameters?.[0]?.image?.link
}

describe('sendWhatsAppMessage image handling', () => {
  beforeEach(() => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1266364546554326'
    process.env.WHATSAPP_BUSINESS_TOKEN = 'test-token'
    process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_URL = 'https://cart-gain.com/logo.png'
    delete process.env.WHATSAPP_TEMPLATE_LANG
    delete process.env.WHATSAPP_API_VERSION
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  const params = {
    header: { type: 'image' as const, imageUrl: 'https://cdn.shopify.com/s/files/1/1/1/products/board.jpg?v=2' },
    body: ['Priya', 'Your board is saved.', 'Name your price'],
  }

  it('sends the product photo on the header', async () => {
    const fetchMock = jest.fn().mockResolvedValue(metaOk())
    global.fetch = fetchMock as any

    const result = await sendWhatsAppMessage({
      to: '+918708718426',
      templateName: 'cart_reminders',
      templateParams: params,
    })

    expect(result.success).toBe(true)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(headerLink(body)).toBe('https://cdn.shopify.com/s/files/1/1/1/products/board.jpg?v=2')
  })

  it('retries with the fallback image when Meta rejects the product image', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(metaError(132012, 'header: Format mismatch, expected IMAGE, received UNKNOWN'))
      .mockResolvedValueOnce(metaOk('wamid.retry'))
    global.fetch = fetchMock as any

    const result = await sendWhatsAppMessage({
      to: '+918708718426',
      templateName: 'cart_reminders',
      templateParams: params,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const first = JSON.parse(fetchMock.mock.calls[0][1].body)
    const second = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(headerLink(first)).toBe('https://cdn.shopify.com/s/files/1/1/1/products/board.jpg?v=2')
    expect(headerLink(second)).toBe('https://cart-gain.com/logo.png')
    expect(result.success).toBe(true)
    expect(result.messageId).toBe('wamid.retry')
  })

  it('does not swap the image for an unrelated rejection', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(metaError(132001, 'Template name does not exist in the translation'))
      .mockResolvedValueOnce(metaOk('wamid.lang'))
    global.fetch = fetchMock as any

    await sendWhatsAppMessage({
      to: '+918708718426',
      templateName: 'cart_reminders',
      templateParams: params,
    })

    const second = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(headerLink(second)).toBe('https://cdn.shopify.com/s/files/1/1/1/products/board.jpg?v=2')
    expect(second.template.language.code).toBe('en_US')
  })
})
