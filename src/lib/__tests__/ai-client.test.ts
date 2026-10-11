import { decorateForFallback } from '../ai-client'

function fakeChatCompletions(createImpl: jest.Mock) {
  return {
    chat: {
      completions: {
        create: createImpl,
      },
    },
  }
}

describe('decorateForFallback', () => {
  it('overrides the requested model with the fallback model for every call', async () => {
    const create = jest.fn().mockResolvedValue({ ok: true })
    const decorated = decorateForFallback(fakeChatCompletions(create), 'llama-3.3-70b-versatile')

    await (decorated as any).chat.completions.create({ model: 'gpt-4o-mini', messages: [] })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'llama-3.3-70b-versatile' })
    )
    expect(create.mock.calls[0][0].model).not.toBe('gpt-4o-mini')
  })

  it('passes other request fields through unchanged', async () => {
    const create = jest.fn().mockResolvedValue({ ok: true })
    const decorated = decorateForFallback(fakeChatCompletions(create), 'llama-3.3-70b-versatile')
    const messages = [{ role: 'user', content: 'hi' }]

    await (decorated as any).chat.completions.create({ model: 'gpt-4o-mini', messages, temperature: 0.5 })

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ messages, temperature: 0.5 }))
  })

  it('passes properties other than chat through to the raw client', () => {
    const client: any = fakeChatCompletions(jest.fn())
    client.someOtherProp = 'kept'
    const decorated: any = decorateForFallback(client, 'llama-3.3-70b-versatile')
    expect(decorated.someOtherProp).toBe('kept')
  })

  it('retries once without response_format when the provider rejects it (400)', async () => {
    const formatError = Object.assign(new Error('response_format is not supported'), { status: 400 })
    const create = jest
      .fn()
      .mockRejectedValueOnce(formatError)
      .mockResolvedValueOnce({ ok: true })

    const decorated = decorateForFallback(fakeChatCompletions(create), 'llama-3.3-70b-versatile')

    const result = await (decorated as any).chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [],
      response_format: { type: 'json_object' },
    })

    expect(result).toEqual({ ok: true })
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[0][0]).toHaveProperty('response_format')
    expect(create.mock.calls[1][0]).not.toHaveProperty('response_format')
  })

  it('rethrows non-format errors without retrying', async () => {
    const rateError = Object.assign(new Error('rate limited'), { status: 429 })
    const create = jest.fn().mockRejectedValue(rateError)
    const decorated = decorateForFallback(fakeChatCompletions(create), 'llama-3.3-70b-versatile')

    await expect(
      (decorated as any).chat.completions.create({ model: 'gpt-4o-mini', messages: [] })
    ).rejects.toBe(rateError)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('caps reasoning effort on gpt-oss so the answer fits the token budget', async () => {
    const create = jest.fn().mockResolvedValue({ ok: true })
    const decorated = decorateForFallback(fakeChatCompletions(create), 'openai/gpt-oss-120b')

    await (decorated as any).chat.completions.create({ model: 'gpt-4o', messages: [] })

    expect(create.mock.calls[0][0].reasoning_effort).toBe('low')
  })

  it('does not add reasoning_effort for non-reasoning fallback models', async () => {
    const create = jest.fn().mockResolvedValue({ ok: true })
    const decorated = decorateForFallback(fakeChatCompletions(create), 'llama-3.3-70b-versatile')

    await (decorated as any).chat.completions.create({ model: 'gpt-4o', messages: [] })

    expect(create.mock.calls[0][0]).not.toHaveProperty('reasoning_effort')
  })
})
describe('provider env parsing (getAiHealth)', () => {
  const ORIGINAL = { ...process.env }

  afterEach(() => {
    process.env = { ...ORIGINAL }
    jest.resetModules()
  })

  it('trims a pasted base URL that has a leading space', async () => {
    // Shipped to production exactly like this. The OpenAI SDK concatenates
    // `${baseURL}/chat/completions`, so the leading space made every fallback
    // call throw on URL parse → tier breaker trips → the whole storefront
    // silently falls back to hard-coded templates.
    process.env.AI_FALLBACK_BASE_URL = ' https://api.groq.com/openai/v1'
    process.env.AI_FALLBACK_API_KEY = 'gsk_test'
    process.env.AI_FALLBACK_MODEL = ' openai/gpt-oss-120b '

    const { getAiHealth } = await import('../ai-client')
    const ai = getAiHealth()

    expect(ai.fallback.baseUrl).toBe('https://api.groq.com/openai/v1')
    expect(ai.fallback.model).toBe('openai/gpt-oss-120b')
    expect(ai.fallback.baseUrl.startsWith(' ')).toBe(false)
    expect(ai.fallback.configured).toBe(true)
  })

  it('treats a whitespace-only value as unset and falls back to the default', async () => {
    process.env.AI_FALLBACK_BASE_URL = '   '
    process.env.AI_FALLBACK_API_KEY = 'gsk_test'

    const { getAiHealth } = await import('../ai-client')
    const ai = getAiHealth()

    expect(ai.fallback.baseUrl).toBe('https://api.groq.com/openai/v1')
    expect(ai.fallback.model).toBe('openai/gpt-oss-120b')
  })

  it('trims the API key so a pasted newline does not look configured-but-broken', async () => {
    process.env.AI_FALLBACK_API_KEY = '\n  gsk_test  \n'

    const { getAiHealth } = await import('../ai-client')
    expect(getAiHealth().fallback.configured).toBe(true)
  })
})
