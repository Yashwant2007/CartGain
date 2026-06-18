import OpenAI from 'openai'

let client: OpenAI | null = null

function getClient(): OpenAI | null {
  if (client) return client
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  client = new OpenAI({ apiKey: key, timeout: 15000 })
  return client
}

export type CartContext = {
  customerName: string
  items: { name: string; description?: string; price: number; quantity: number; image?: string }[]
  storeName: string
  total: number
  currencySymbol: string
  cartUrl: string
}

type GeneratedContent = {
  subject?: string
  body: string
}

function buildItemList(ctx: CartContext): string {
  return ctx.items.map(i =>
    `${i.name}${i.description ? ` — ${i.description}` : ''} (${ctx.currencySymbol}${i.price})`
  ).join('\n')
}

export async function generateEmailContent(ctx: CartContext): Promise<GeneratedContent | null> {
  const ai = getClient()
  if (!ai) return null

  try {
    const res = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a cart recovery copywriter for ${ctx.storeName}. Generate a warm, personalized email.

Return valid JSON with these keys:
- "subject": compelling subject line with emoji (max 60 chars)
- "body": concise HTML inside a <div> with inline styles. Keep it tight — just 2-3 short sentences. Mention 1-2 products by name. Use 1-2 emojis. Warm tone, gentle urgency. End with a one-liner CTA. Do NOT include the cart URL — it will be added separately.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            customerName: ctx.customerName,
            storeName: ctx.storeName,
            items: buildItemList(ctx),
            total: `${ctx.currencySymbol}${ctx.total.toFixed(2)}`,
          }),
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 400,
      temperature: 0.8,
    })

    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
    return { subject: parsed.subject, body: parsed.body }
  } catch (err) {
    console.error('AI email generation error:', err)
    return null
  }
}

export async function generateSMSContent(ctx: CartContext): Promise<GeneratedContent | null> {
  const ai = getClient()
  if (!ai) return null

  try {
    const res = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Write a short SMS (max 140 chars) for abandoned cart recovery. Warm and urgent. 1-2 lines. Include one emoji. Do NOT include the URL — it will be appended. Return ONLY the message text, no JSON, no quotes.`,
        },
        {
          role: 'user',
          content: `Name: ${ctx.customerName}\nStore: ${ctx.storeName}\nItems: ${ctx.items.map(i => i.name).join(', ')}\nTotal: ${ctx.currencySymbol}${ctx.total.toFixed(2)}`,
        },
      ],
      max_tokens: 80,
      temperature: 0.8,
    })

    const body = res.choices[0]?.message?.content?.trim()
    return body ? { body } : null
  } catch (err) {
    console.error('AI SMS generation error:', err)
    return null
  }
}

export async function generateWhatsAppContent(ctx: CartContext): Promise<GeneratedContent | null> {
  const ai = getClient()
  if (!ai) return null

  const itemsStr = ctx.items.map(i =>
    `• ${i.name}${i.description ? `: ${i.description}` : ''} — ${ctx.currencySymbol}${i.price}`
  ).join('\n')

  try {
    const res = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Write a warm WhatsApp message for abandoned cart recovery. Keep it tight — just 3-5 short lines. Mention 1-2 products by name. Use 1-2 emojis. Friendly, conversational tone. Do NOT include the URL — it will be appended separately. Return ONLY the message text, no JSON, no quotes.`,
        },
        {
          role: 'user',
          content: `Name: ${ctx.customerName}\nStore: ${ctx.storeName}\nItems:\n${itemsStr}\nTotal: ${ctx.currencySymbol}${ctx.total.toFixed(2)}`,
        },
      ],
      max_tokens: 150,
      temperature: 0.8,
    })

    const body = res.choices[0]?.message?.content?.trim()
    return body ? { body } : null
  } catch (err) {
    console.error('AI WhatsApp generation error:', err)
    return null
  }
}
