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

describe('sendWhatsAppMessage template shape', () => {
  beforeEach(() => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1266364546554326'
    process.env.WHATSAPP_BUSINESS_TOKEN = 'test-token'
    process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_URL = 'https://cart-gain.com/logo.png'
    delete process.env.WHATSAPP_TEMPLATE_PARAM_FORMAT
    delete process.env.WHATSAPP_TEMPLATE_PARAM_NAMES
    delete process.env.WHATSAPP_TEMPLATE_LANG
    delete process.env.WHATSAPP_API_VERSION
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  const offerLine =
    'Priya, your Snowboard gets 10% off — code GAINABC123 — finish checkout: https://cart-gain.com/r/cart_1?c=whatsapp&to=checkout&code=GAINABC123 — or name your price: https://cart-gain.com/r/cart_1?c=whatsapp&to=bargain'

  it('sends header, then body name/content/offer, then url button in that order', async () => {
    const fetchMock = jest.fn().mockResolvedValue(metaOk())
    global.fetch = fetchMock as any

    const result = await sendWhatsAppMessage({
      to: '+918708718426',
      templateName: 'cart_reminders',
      templateParams: {
        header: { type: 'image', imageUrl: 'https://cdn.shopify.com/board.jpg' },
        body: ['Priya', 'You left the board behind.', offerLine],
        buttons: [{ type: 'url', text: 'Complete Purchase', url: 'cart_1?c=whatsapp' }],
      },
    })

    expect(result.success).toBe(true)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.template.name).toBe('cart_reminders')
    expect(body.template.language.code).toBe('en')
    expect(body.template.components.map((c: any) => c.type)).toEqual(['header', 'body', 'button'])

    const bodyParams = body.template.components[1].parameters
    expect(bodyParams.map((p: any) => p.text)).toEqual([
      'Priya',
      'You left the board behind.',
      offerLine,
    ])
    for (const param of bodyParams) expect(param.parameter_name).toBeUndefined()

    const button = body.template.components[2]
    expect(button).toMatchObject({ sub_type: 'url', index: 0 })
    expect(button.parameters[0].text).toBe('cart_1?c=whatsapp')
  })

  it('uses the approved named parameters when the template is named', async () => {
    process.env.WHATSAPP_TEMPLATE_PARAM_FORMAT = 'named'
    const fetchMock = jest.fn().mockResolvedValue(metaOk())
    global.fetch = fetchMock as any

    await sendWhatsAppMessage({
      to: '+918708718426',
      templateName: 'cart_followup',
      templateParams: {
        header: { type: 'image', imageUrl: 'https://cdn.shopify.com/board.jpg' },
        body: ['Priya', 'Still deciding?', offerLine],
      },
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(
      body.template.components[1].parameters.map((p: any) => [p.parameter_name, p.text]),
    ).toEqual([
      ['name', 'Priya'],
      ['body', 'Still deciding?'],
      ['discount', offerLine],
    ])
  })

  it('collapses whitespace and neutralises template syntax in every variable', async () => {
    const fetchMock = jest.fn().mockResolvedValue(metaOk())
    global.fetch = fetchMock as any

    await sendWhatsAppMessage({
      to: '+918708718426',
      templateName: 'cart_urgent',
      templateParams: {
        body: ['  Priya  ', 'Line one\n\nLine   two {{1}}', `Offer\r\n${offerLine}`],
      },
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.template.components[0].parameters.map((p: any) => p.text)).toEqual([
      'Priya',
      'Line one Line two { {1} }',
      `Offer ${offerLine}`,
    ])
    for (const param of body.template.components[0].parameters) {
      expect(param.text).not.toMatch(/[\r\n\t]/)
      expect(param.text).not.toMatch(/\s{2,}/)
      expect(param.text).not.toContain('{{')
    }
  })
})

describe('sendWhatsAppMessage credential aliases', () => {
  const originalToken = process.env.WHATSAPP_BUSINESS_TOKEN
  const originalAlias = process.env.WHATSAPP_ACCESS_TOKEN

  afterEach(() => {
    if (originalToken === undefined) delete process.env.WHATSAPP_BUSINESS_TOKEN
    else process.env.WHATSAPP_BUSINESS_TOKEN = originalToken
    if (originalAlias === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN
    else process.env.WHATSAPP_ACCESS_TOKEN = originalAlias
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('falls back to WHATSAPP_ACCESS_TOKEN when the canonical var is absent', async () => {
    delete process.env.WHATSAPP_BUSINESS_TOKEN
    process.env.WHATSAPP_ACCESS_TOKEN = 'alias-token'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1266364546554326'
    const fetchMock = jest.fn().mockResolvedValue(metaOk())
    global.fetch = fetchMock as any

    const result = await sendWhatsAppMessage({
      to: '+918708718426',
      templateName: 'cart_reminders',
      templateParams: { body: ['Priya', 'Saved.', 'Offer'] },
    })

    expect(result.success).toBe(true)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer alias-token')
  })
})
