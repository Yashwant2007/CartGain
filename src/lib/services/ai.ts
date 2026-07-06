import OpenAI from 'openai'

let client: OpenAI | null = null
let aiCooldownUntil: number = 0

function isAiOnCooldown(): boolean {
  return Date.now() < aiCooldownUntil
}

function setAiCooldown(durationMs = 300_000): void {
  aiCooldownUntil = Date.now() + durationMs
}

function getClient(): OpenAI | null {
  if (isAiOnCooldown()) return null
  if (client) return client
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  client = new OpenAI({ apiKey: key, timeout: 10000 })
  return client
}

function isQuotaError(err: any): boolean {
  const status = err?.status || err?.statusCode
  const code = err?.code || err?.error?.code
  return status === 429 || status === 402 || code === 'insufficient_quota' || code === 'rate_limit_exceeded'
}

export type CartContext = {
  customerName: string
  items: { name: string; description?: string; price: number; quantity: number; image?: string }[]
  storeName: string
  total: number
  currencySymbol: string
  cartUrl: string
  discountCode?: string
  discountValue?: number
  discountType?: string
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
- "body": concise HTML inside a <div> with inline styles. Keep it tight — just 2-3 short sentences. Mention 1-2 products by name. Use 1-2 emojis. Warm tone, gentle urgency. End with a one-liner CTA. Do NOT include the cart URL — it will be added separately.
${ctx.discountCode ? `\nINCLUDE this discount offer prominently: code ${ctx.discountCode}${ctx.discountValue ? ` for ${ctx.discountValue}${ctx.discountType === 'percentage' ? '%' : ''} off` : ''}. Make it the main reason to return.` : ''}`,
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
    if (isQuotaError(err)) setAiCooldown()
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
          content: `Write a short SMS (max 140 chars) for abandoned cart recovery. Warm and urgent. 1-2 lines. Include one emoji. Do NOT include the URL — it will be appended. Return ONLY the message text, no JSON, no quotes.
${ctx.discountCode ? `\nINCLUDE this discount offer: code ${ctx.discountCode}${ctx.discountValue ? ` for ${ctx.discountValue}${ctx.discountType === 'percentage' ? '%' : ''} off` : ''}. Keep it short!` : ''}`,
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
    if (isQuotaError(err)) setAiCooldown()
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
          content: `Write a warm WhatsApp message for abandoned cart recovery. Keep it tight — just 3-5 short lines. Mention 1-2 products by name. Use 1-2 emojis. Friendly, conversational tone. Do NOT include the URL — it will be appended separately. Return ONLY the message text, no JSON, no quotes.
${ctx.discountCode ? `\nINCLUDE this discount offer in the message: code ${ctx.discountCode}${ctx.discountValue ? ` for ${ctx.discountValue}${ctx.discountType === 'percentage' ? '%' : ''} off` : ''}.` : ''}`,
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
    if (isQuotaError(err)) setAiCooldown()
    return null
  }
}

export async function generateSubjectLines(ctx: CartContext, count = 3): Promise<string[]> {
  const ai = getClient()
  if (!ai) return generateFallbackSubjects(ctx, count)

  try {
    const res = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Generate ${count} email subject lines for an abandoned cart recovery email. Rules: each must be under 60 chars, include 1 emoji, feel urgent but warm. Return a JSON array of strings ONLY: ["subject1", "subject2", "subject3"]. No other text.`,
        },
        {
          role: 'user',
          content: `Customer: ${ctx.customerName}\nStore: ${ctx.storeName}\nItems: ${ctx.items.map(i => i.name).join(', ')}\nTotal: ${ctx.currencySymbol}${ctx.total.toFixed(2)}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 200,
      temperature: 0.8,
    })

    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
    const lines = Array.isArray(parsed) ? parsed : parsed.subjects || parsed.lines || []
    return lines.slice(0, count)
  } catch (err) {
    console.error('AI subject lines error:', err)
    return generateFallbackSubjects(ctx, count)
  }
}

function generateFallbackSubjects(ctx: CartContext, count: number): string[] {
  const fallbacks = [
    `🛍️ ${ctx.customerName}, your cart is waiting!`,
    `✨ Don't miss out, ${ctx.customerName}!`,
    `💝 Complete your ${ctx.storeName} order`,
    `⏳ Your cart expires soon, ${ctx.customerName}`,
    `🎯 ${ctx.customerName}, these are still warm!`,
  ]
  return fallbacks.slice(0, count)
}

export async function predictRecoveryProbability(
  cartValue: number,
  customerHistory: { totalOrders: number; totalAbandons: number; totalRecoveries: number; avgOrderValue: number },
  channel: string
): Promise<{ probability: number; factors: string[] }> {
  const ai = getClient()
  if (!ai) return computeProbabilityHeuristic(cartValue, customerHistory, channel)

  try {
    const res = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You predict the probability (0-100) of recovering an abandoned cart. Return JSON: {"probability": number, "factors": ["reason1", "reason2"]}. Be conservative.`,
        },
        {
          role: 'user',
          content: JSON.stringify({ cartValue, customerHistory, recoveryChannel: channel }),
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 150,
      temperature: 0.3,
    })

    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
    return {
      probability: Math.min(100, Math.max(0, parsed.probability || 50)),
      factors: parsed.factors || ['Based on historical patterns'],
    }
  } catch (err) {
    console.error('AI probability error:', err)
    return computeProbabilityHeuristic(cartValue, customerHistory, channel)
  }
}

function computeProbabilityHeuristic(
  cartValue: number,
  history: { totalOrders: number; totalAbandons: number; totalRecoveries: number; avgOrderValue: number },
  channel: string
): { probability: number; factors: string[] } {
  let prob = 50
  const factors: string[] = []

  if (history.totalOrders > 0) {
    prob += 10
    factors.push('Returning customer')
  } else {
    prob -= 10
    factors.push('New customer')
  }

  if (history.totalRecoveries > history.totalAbandons * 0.3) {
    prob += 15
    factors.push('High historical recovery rate')
  }

  if (cartValue > history.avgOrderValue * 0.5 && history.avgOrderValue > 0) {
    prob += 5
    factors.push('Cart value above average')
  }

  const channelBoost: Record<string, number> = { email: 5, whatsapp: 10, sms: 8 }
  prob += channelBoost[channel] || 0
  factors.push(`${channel} channel`)

  return { probability: Math.min(95, Math.max(5, prob)), factors }
}

export async function optimizeDiscount(
  cartValue: number,
  customerHistory: { totalOrders: number; totalAbandons: number; lifetimeValue: number },
  storeMargin: number
): Promise<{
  recommendedType: 'percentage' | 'fixed' | 'free_shipping'
  recommendedValue: number
  confidence: number
  reasoning: string
}> {
  const ai = getClient()
  if (!ai) return computeDiscountHeuristic(cartValue, customerHistory, storeMargin)

  try {
    const res = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a discount optimization expert. Recommend the minimum effective discount to recover an abandoned cart. Return JSON: {"type": "percentage"|"fixed"|"free_shipping", "value": number, "confidence": 0-100, "reasoning": "short explanation"}. Be conservative — minimize discount while maximizing recovery. Free shipping is often best for low margins.`,
        },
        {
          role: 'user',
          content: JSON.stringify({ cartValue, totalOrders: customerHistory.totalOrders, totalAbandons: customerHistory.totalAbandons, estimatedLifetimeValue: customerHistory.lifetimeValue, storeMarginPercent: storeMargin }),
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 150,
      temperature: 0.3,
    })

    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
    return {
      recommendedType: parsed.type || 'percentage',
      recommendedValue: parsed.value || 10,
      confidence: parsed.confidence || 70,
      reasoning: parsed.reasoning || 'Optimized for conversion and margin',
    }
  } catch (err) {
    console.error('AI discount error:', err)
    return computeDiscountHeuristic(cartValue, customerHistory, storeMargin)
  }
}

function computeDiscountHeuristic(
  cartValue: number,
  history: { totalOrders: number; totalAbandons: number; lifetimeValue: number },
  storeMargin: number
): { recommendedType: 'percentage' | 'fixed' | 'free_shipping'; recommendedValue: number; confidence: number; reasoning: string } {
  if (cartValue > 5000) {
    return { recommendedType: 'free_shipping', recommendedValue: 0, confidence: 75, reasoning: 'High-value cart — free shipping is often enough incentive' }
  }
  if (storeMargin > 40) {
    return { recommendedType: 'percentage', recommendedValue: 15, confidence: 70, reasoning: 'Healthy margins allow a meaningful percentage discount' }
  }
  if (history.totalAbandons > 3) {
    return { recommendedType: 'percentage', recommendedValue: 10, confidence: 65, reasoning: 'Frequent abandoner — a small discount may tip the decision' }
  }
  return { recommendedType: 'fixed', recommendedValue: Math.round(cartValue * 0.1), confidence: 60, reasoning: 'Standard 10% cart value discount' }
}

export async function detectCustomerIntent(
  customer: { totalOrders: number; totalAbandons: number; totalRecoveries: number; avgOrderValue: number; lifetimeValue: number; cartValue: number; daysSinceLastOrder: number | null }
): Promise<{ intentType: string; confidence: number; description: string }> {
  const ai = getClient()
  if (!ai) return classifyIntentHeuristic(customer)

  try {
    const res = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Classify this customer into one type: "returning", "new", "loyal", "price_sensitive", "window_shopper", "high_value". Return JSON: {"intentType": string, "confidence": 0-100, "description": "1 sentence"}. 
Definitions:
- returning: has ordered before, reasonable value
- new: first time, no history
- loyal: multiple orders, high value
- price_sensitive: abandons frequently, lower cart value
- window_shopper: browses but rarely buys
- high_value: high cart value, high lifetime value`,
        },
        {
          role: 'user',
          content: JSON.stringify(customer),
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 150,
      temperature: 0.3,
    })

    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
    return {
      intentType: parsed.intentType || 'returning',
      confidence: parsed.confidence || 60,
      description: parsed.description || '',
    }
  } catch (err) {
    console.error('AI intent detection error:', err)
    return classifyIntentHeuristic(customer)
  }
}

function classifyIntentHeuristic(customer: { totalOrders: number; totalAbandons: number; totalRecoveries: number; avgOrderValue: number; lifetimeValue: number; cartValue: number; daysSinceLastOrder: number | null }): { intentType: string; confidence: number; description: string } {
  if (customer.totalOrders === 0) {
    return { intentType: 'new', confidence: 80, description: 'First-time visitor with no purchase history' }
  }
  if (customer.totalOrders >= 5 && customer.lifetimeValue > 50000) {
    return { intentType: 'loyal', confidence: 85, description: 'Loyal customer with high lifetime value' }
  }
  if (customer.lifetimeValue > 20000 && customer.avgOrderValue > 2000) {
    return { intentType: 'high_value', confidence: 75, description: 'High-value customer segment' }
  }
  if (customer.totalAbandons > customer.totalOrders && customer.totalOrders > 0) {
    return { intentType: 'price_sensitive', confidence: 70, description: 'Abandons frequently — likely comparing prices' }
  }
  if (customer.totalOrders > 0 && (customer.daysSinceLastOrder === null || customer.daysSinceLastOrder > 60)) {
    return { intentType: 'window_shopper', confidence: 65, description: 'Previous buyer returning after a long gap' }
  }
  return { intentType: 'returning', confidence: 60, description: 'Returning customer with purchase history' }
}

export async function generateRevenueCoachSuggestions(
  storeMetrics: {
    recoveryRate: number
    cartsAbandoned30d: number
    cartsRecovered30d: number
    revenueRecovered30d: number
    activeCampaigns: number
    channelsUsed: string[]
    aiOptimized: boolean
    hasDiscountCampaigns: boolean
    avgRecoveryTime: number
  }
): Promise<{ suggestions: Array<{ title: string; description: string; impact: string; type: string; metric?: Record<string, any> }> }> {
  const ai = getClient()
  if (!ai) return generateCoachHeuristic(storeMetrics)

  try {
    const res = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a revenue coach for an e-commerce store. Based on their metrics, suggest 3-5 actionable recommendations to improve cart recovery revenue. Each suggestion needs: title (short), description (1-2 sentences), impact ("high"/"medium"/"low"), type ("channel"/"timing"/"discount"/"content"/"campaign").

Return JSON: {"suggestions": [{"title": string, "description": string, "impact": string, "type": string}]}
Be specific and data-driven. Reference their actual numbers.`,
        },
        {
          role: 'user',
          content: JSON.stringify(storeMetrics),
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 500,
      temperature: 0.7,
    })

    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
    return { suggestions: parsed.suggestions || [] }
  } catch (err) {
    console.error('AI coach error:', err)
    return generateCoachHeuristic(storeMetrics)
  }
}

export function generateCoachHeuristic(storeMetrics: {
  recoveryRate: number; cartsAbandoned30d: number; cartsRecovered30d: number;
  revenueRecovered30d: number; activeCampaigns: number; channelsUsed: string[];
  aiOptimized: boolean; hasDiscountCampaigns: boolean; avgRecoveryTime: number
}): { suggestions: Array<{ title: string; description: string; impact: string; type: string }> } {
  const s: Array<{ title: string; description: string; impact: string; type: string }> = []

  if (storeMetrics.recoveryRate < 5) {
    s.push({ title: 'Increase recovery rate', description: `Your recovery rate is ${storeMetrics.recoveryRate.toFixed(1)}%. Add a follow-up message 24h after the first to capture late converters.`, impact: 'high', type: 'timing' })
  }
  if (storeMetrics.channelsUsed.length < 2) {
    s.push({ title: 'Add another channel', description: `You're only using ${storeMetrics.channelsUsed.join(', ')}. Adding WhatsApp or SMS can reach customers who don't check email.`, impact: 'high', type: 'channel' })
  }
  if (!storeMetrics.aiOptimized) {
    s.push({ title: 'Enable AI optimization', description: 'AI-generated messages have 35% higher conversion rates. Toggle AI optimization on your campaign settings.', impact: 'high', type: 'content' })
  }
  if (!storeMetrics.hasDiscountCampaigns) {
    s.push({ title: 'Try discount incentives', description: 'Adding a small discount (10-15%) can recover 20% more carts. Create a campaign with offers.', impact: 'medium', type: 'discount' })
  }
  if (storeMetrics.activeCampaigns === 0) {
    s.push({ title: 'Launch your first campaign', description: 'You have no active campaigns. Create one to start recovering abandoned carts automatically.', impact: 'high', type: 'campaign' })
  }
  if (storeMetrics.avgRecoveryTime > 1440) {
    s.push({ title: 'Shorten recovery window', description: `Your avg recovery time is ${(storeMetrics.avgRecoveryTime / 60).toFixed(0)}h. Send the first message within 15-30 minutes for best results.`, impact: 'medium', type: 'timing' })
  }
  if (s.length === 0) {
    s.push({ title: 'Great performance!', description: `Your ${storeMetrics.recoveryRate.toFixed(1)}% recovery rate is strong. Consider A/B testing message variants to optimize further.`, impact: 'medium', type: 'campaign' })
  }

  return { suggestions: s }
}

export async function generateWeeklyReport(
  storeMetrics: {
    storeName: string
    periodStart: string
    periodEnd: string
    cartsAbandoned: number
    cartsRecovered: number
    recoveryRate: number
    revenueRecovered: number
    messagesSent: number
    channelBreakdown: Array<{ channel: string; sent: number; recovered: number; revenue: number }>
    prevRecoveryRate?: number
    prevRevenueRecovered?: number
    topProduct?: string
    bestChannel?: string
  }
): Promise<{ title: string; summary: string; insights: any[]; recommendations: any[] } | null> {
  const ai = getClient()
  if (!ai) return generateReportHeuristic(storeMetrics)

  try {
    const res = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are CartGain's AI analyst. Generate a weekly recovery report. Return JSON with:
- title: "Weekly Recovery Report: <store>"
- summary: 2-3 sentence executive summary
- insights: array of {icon: string, title: string, description: string, metric: string}
- recommendations: array of {priority: "high"/"medium"/"low", action: string, impact: string}

Focus on actionable insights. Use emojis in titles.`,
        },
        {
          role: 'user',
          content: JSON.stringify(storeMetrics),
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 600,
      temperature: 0.7,
    })

    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
    return {
      title: parsed.title || 'Weekly Recovery Report',
      summary: parsed.summary || '',
      insights: parsed.insights || [],
      recommendations: parsed.recommendations || [],
    }
  } catch (err) {
    console.error('AI weekly report error:', err)
    return generateReportHeuristic(storeMetrics)
  }
}

export function generateReportHeuristic(storeMetrics: any): { title: string; summary: string; insights: any[]; recommendations: any[] } {
  const rateChange = storeMetrics.prevRecoveryRate ? ((storeMetrics.recoveryRate - storeMetrics.prevRecoveryRate) / storeMetrics.prevRecoveryRate * 100).toFixed(1) : null
  const revChange = storeMetrics.prevRevenueRecovered ? ((storeMetrics.revenueRecovered - storeMetrics.prevRevenueRecovered) / storeMetrics.prevRevenueRecovered * 100).toFixed(1) : null

  return {
    title: `Weekly Recovery Report: ${storeMetrics.storeName}`,
    summary: `This week, you recovered ${storeMetrics.cartsRecovered} carts worth ${storeMetrics.revenueRecovered.toFixed(2)} at a ${storeMetrics.recoveryRate.toFixed(1)}% recovery rate.${rateChange ? ` Rate ${Number(rateChange) >= 0 ? 'up' : 'down'} ${Math.abs(Number(rateChange))}% vs last week.` : ''}`,
    insights: [
      { icon: '📊', title: 'Recovery Rate', description: `${storeMetrics.recoveryRate.toFixed(1)}% of abandoned carts were recovered`, metric: `${storeMetrics.recoveryRate.toFixed(1)}%` },
      { icon: '💰', title: 'Revenue Recovered', description: `₹${storeMetrics.revenueRecovered.toFixed(0)} recovered this week`, metric: `₹${storeMetrics.revenueRecovered.toFixed(0)}` },
      { icon: '📨', title: 'Messages Sent', description: `${storeMetrics.messagesSent} recovery messages sent across ${storeMetrics.channelBreakdown?.length || 0} channels`, metric: `${storeMetrics.messagesSent}` },
    ],
    recommendations: [
      { priority: 'high', action: `Focus on ${storeMetrics.bestChannel || 'email'} — your best performing channel`, impact: 'Expected 15-20% improvement' },
      { priority: 'medium', action: storeMetrics.recoveryRate < 10 ? 'Add a follow-up sequence to capture late converters' : 'A/B test message timing to optimize further', impact: 'Expected 5-10% improvement' },
    ],
  }
}

export async function generateCampaignSetup(
  storeInfo: { name: string; domain: string; currency: string }
): Promise<{
  campaignName: string
  channels: string[]
  aiOptimized: boolean
  sendDelay: number
  followUpDelay: number
  maxFollowUps: number
  discountEnabled: boolean
  discountType: string
  discountValue: number
  discountCode: string
} | null> {
  const ai = getClient()
  if (!ai) return defaultCampaignSetup(storeInfo)

  try {
    const res = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are CartGain's setup wizard. Given a store's info, recommend the optimal abandoned cart campaign config. Return JSON with: campaignName, channels (array of strings), aiOptimized (bool), sendDelay (minutes, 5-60), followUpDelay (minutes, 60-1440), maxFollowUps (1-5), discountEnabled (bool), discountType ("percentage"/"free_shipping"/null), discountValue (number if percentage), discountCode (string if enabled). Be conservative with discounts.`,
        },
        {
          role: 'user',
          content: JSON.stringify(storeInfo),
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 300,
      temperature: 0.5,
    })

    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
    return {
      campaignName: parsed.campaignName || 'RecoverMyCart',
      channels: parsed.channels || ['email', 'whatsapp'],
      aiOptimized: parsed.aiOptimized !== false,
      sendDelay: Math.min(60, Math.max(5, parsed.sendDelay || 15)),
      followUpDelay: Math.min(1440, Math.max(60, parsed.followUpDelay || 180)),
      maxFollowUps: Math.min(5, Math.max(1, parsed.maxFollowUps || 2)),
      discountEnabled: parsed.discountEnabled || false,
      discountType: parsed.discountType || 'percentage',
      discountValue: parsed.discountValue || 10,
      discountCode: parsed.discountCode || 'WELCOME10',
    }
  } catch (err) {
    console.error('AI campaign setup error:', err)
    return defaultCampaignSetup(storeInfo)
  }
}

function defaultCampaignSetup(store: { name: string; domain: string; currency: string }): {
  campaignName: string; channels: string[]; aiOptimized: boolean;
  sendDelay: number; followUpDelay: number; maxFollowUps: number;
  discountEnabled: boolean; discountType: string; discountValue: number; discountCode: string
} {
  return {
    campaignName: `${store.name} Recovery`,
    channels: ['email'],
    aiOptimized: true,
    sendDelay: 15,
    followUpDelay: 180,
    maxFollowUps: 2,
    discountEnabled: false,
    discountType: 'percentage',
    discountValue: 10,
    discountCode: 'SAVE10',
  }
}

export function simulateRecovery(
  currentMetrics: {
    monthlyAbandonedCarts: number
    avgCartValue: number
    currentRecoveryRate: number
    currentRevenueRecovered: number
  },
  improvements: {
    addChannel?: boolean
    enableAI?: boolean
    addDiscount?: boolean
    improveTiming?: boolean
    addFollowUp?: boolean
  }
): {
  projectedRecoveryRate: number
  projectedRevenue: number
  additionalRevenue: number
  estimatedMessages: number
  channelBreakdown: Array<{ channel: string; recoveryRate: number; revenue: number }>
} {
  let recRate = currentMetrics.currentRecoveryRate
  const factors: string[] = []

  const hasImprovements = improvements.addChannel || improvements.enableAI || improvements.addDiscount || improvements.improveTiming || improvements.addFollowUp
  if (hasImprovements && recRate < 5) {
    recRate = 5
  }

  if (improvements.addChannel) { recRate *= 1.3; factors.push('+30% for multi-channel') }
  if (improvements.enableAI) { recRate *= 1.25; factors.push('+25% for AI content') }
  if (improvements.addDiscount) { recRate *= 1.2; factors.push('+20% for discounts') }
  if (improvements.improveTiming) { recRate *= 1.15; factors.push('+15% for optimal timing') }
  if (improvements.addFollowUp) { recRate *= 1.2; factors.push('+20% for follow-ups') }

  recRate = Math.min(45, recRate)

  const projectedRevenue = currentMetrics.monthlyAbandonedCarts * currentMetrics.avgCartValue * (recRate / 100)
  const additionalRevenue = projectedRevenue - currentMetrics.currentRevenueRecovered

  return {
    projectedRecoveryRate: Math.round(recRate * 10) / 10,
    projectedRevenue: Math.round(projectedRevenue),
    additionalRevenue: Math.round(additionalRevenue),
    estimatedMessages: Math.round(currentMetrics.monthlyAbandonedCarts * (recRate / 100) * 2.5),
    channelBreakdown: [
      { channel: 'email', recoveryRate: recRate * 0.4, revenue: Math.round(projectedRevenue * 0.4) },
      { channel: 'whatsapp', recoveryRate: recRate * 0.35, revenue: Math.round(projectedRevenue * 0.35) },
      { channel: 'sms', recoveryRate: recRate * 0.25, revenue: Math.round(projectedRevenue * 0.25) },
    ],
  }
}

export function calculateHealthScore(metrics: {
  recoveryRate: number
  aiOptimized: boolean
  activeCampaigns: number
  channelsUsed: number
  hasDiscountCampaigns: boolean
  hasRecoveredCarts: boolean
  revenueTrend: 'up' | 'down' | 'stable'
}): { score: number; components: Array<{ name: string; score: number; max: number }> } {
  const components: Array<{ name: string; score: number; max: number }> = []

  const rrScore = Math.min(25, Math.round((metrics.recoveryRate / 20) * 25))
  components.push({ name: 'Recovery Rate', score: rrScore, max: 25 })

  const aiScore = metrics.aiOptimized ? 15 : 0
  components.push({ name: 'AI Optimization', score: aiScore, max: 15 })

  const campScore = Math.min(20, metrics.activeCampaigns * 10)
  components.push({ name: 'Active Campaigns', score: campScore, max: 20 })

  const chScore = Math.min(20, metrics.channelsUsed * 7)
  components.push({ name: 'Channel Coverage', score: chScore, max: 20 })

  const discScore = metrics.hasDiscountCampaigns ? 10 : 0
  components.push({ name: 'Discount Strategy', score: discScore, max: 10 })

  const revScore = metrics.hasRecoveredCarts ? (metrics.revenueTrend === 'up' ? 10 : metrics.revenueTrend === 'stable' ? 5 : 0) : 0
  components.push({ name: 'Revenue Trend', score: revScore, max: 10 })

  const total = components.reduce((s, c) => s + c.score, 0)
  return { score: total, components }
}

export const INDUSTRY_BENCHMARKS = {
  recoveryRate: { average: 8.5, topPerformers: 22, bottomQuartile: 3 },
  avgRecoveryTime: { average: 180, topPerformers: 45, bottomQuartile: 480 },
  recoveryByChannel: {
    email: { average: 6, topPerformers: 15 },
    whatsapp: { average: 12, topPerformers: 28 },
    sms: { average: 9, topPerformers: 20 },
  },
  avgOrderValue: { average: 1250, topPerformers: 3500 },
  messagesPerRecovery: { average: 2.5, topPerformers: 1.5 },
  revenuePerCart: { average: 150, topPerformers: 500 },
  channelsUsed: { average: 1.8, topPerformers: 3 },
  aiAdoptionRate: { average: 35, topPerformers: 72 },
  revenueImpactOfAI: { improvementPercent: 35 },
}
