/**
 * Shared conversational intelligence layer.
 *
 * One voice model, one fact contract, one validator, one generator — used by
 * cart recovery today and available to the bargain engine (and future
 * channels) without copying prompts around.
 */
export * from './voice'
export * from './facts'
export * from './validate'
export * from './variety'
export * from './prompts'
export * from './generate'
export * from './recovery'

export interface ConversationTask {
  type: 'bargain_reply' | 'recovery_message' | 'support_response' | 'recommendation' | 'follow_up'
  constraints?: {
    maxLength?: number
    allowEmoji?: boolean
    requireCallToAction?: boolean
    authorizedDiscountOnly?: boolean
    channel?: 'email' | 'whatsapp' | 'onsite' | 'sms'
  }
}

export interface ConversationContextInput {
  storeId: string
  storeName: string
  currencySymbol: string
  items: Array<{ name: string; price: number; quantity: number; productId?: string }>
  cartTotal: number
  cartUrl?: string
  customerName?: string | null
  conversationHistory?: Array<{ role: 'customer' | 'ai'; content: string }>
  sessionType?: 'bargain' | 'recovery' | 'support'
  bargainState?: {
    originalPrice: number
    minPrice: number
    attemptsUsed: number
    maxAttempts: number
  } | null
  intent?: {
    intent: string
    objection: string | null
    budget?: number | null
  } | null
  channel?: 'email' | 'whatsapp' | 'onsite' | 'sms'
}

export async function generateConversationResponse(
  context: ConversationContextInput,
  task: ConversationTask['type'],
  constraints?: ConversationTask['constraints']
): Promise<{ content: string; subject?: string; validated: boolean; source: string }> {
  const { composeRecoveryMessage } = await import('./recovery')
  const { loadStoreVoice } = await import('./store')
  
  const voice = await loadStoreVoice(context.storeId)
  const channel = (constraints?.channel || context.channel || 'email') as 'email' | 'whatsapp'
  
  if (task === 'recovery_message' || context.sessionType === 'recovery') {
    try {
      const result = await composeRecoveryMessage({
        storeId: context.storeId,
        storeName: context.storeName,
        currencySymbol: context.currencySymbol,
        customerName: context.customerName,
        items: context.items.map(i => ({ name: i.name, price: i.price, quantity: i.quantity })),
        total: context.cartTotal,
        cartUrl: context.cartUrl || '/',
        discount: null,
        channel,
        step: 0,
        voice,
        previousMessage: context.conversationHistory?.[context.conversationHistory.length - 1]?.content || null,
      })
      return {
        content: result.body,
        subject: result.subject,
        validated: true,
        source: result.source,
      }
    } catch {
      // fall through to fallback
    }
  }
  
  const name = context.customerName?.split(' ')[0]
  const greeting = name ? `Hi ${name},` : 'Hi,'
  const item = context.items[0]?.name || 'your item'
  
  return {
    content: `${greeting} ${item} is still waiting. You can pick up where you left off when you're ready.`,
    validated: true,
    source: 'fallback',
  }
}

export async function evaluateBargainOffer(
  context: ConversationContextInput,
  customerOffer: number
): Promise<{ authorized: boolean; decision: 'accept' | 'counter' | 'reject'; counterOffer?: number; reason: string }> {
  const state = context.bargainState
  if (!state) {
    return { authorized: false, decision: 'reject', reason: 'No active session' }
  }
  
  if (customerOffer <= 0) return { authorized: false, decision: 'reject', reason: 'Invalid offer' }
  if (customerOffer > state.originalPrice) return { authorized: true, decision: 'accept', reason: 'At or above asking price' }
  if (customerOffer < state.minPrice) {
    const counter = Math.max(state.minPrice * 1.05, state.originalPrice * 0.9)
    return { authorized: false, decision: 'counter', counterOffer: Math.round(counter * 100) / 100, reason: 'Below minimum' }
  }
  if (customerOffer >= state.originalPrice * 0.9) return { authorized: true, decision: 'accept', reason: 'Good offer' }
  
  const counter = Math.max(state.minPrice, state.originalPrice * 0.92)
  return { authorized: false, decision: 'counter', counterOffer: Math.round(counter * 100) / 100, reason: 'Counter offer' }
}
