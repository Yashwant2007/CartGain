export interface PostDealReassuranceInput {
  price: string
  code: string
  verified?: boolean
  persona?: 'friendly_shopkeeper' | 'strict_negotiator' | 'playful_friend'
}

export function dealAcceptedMessage(input: PostDealReassuranceInput): string {
  const p = input.persona ?? 'friendly_shopkeeper'
  if (p === 'strict_negotiator') {
    return input.verified === false
      ? `Deal confirmed at ${input.price}. Code ${input.code} is being verified now.`
      : `Deal confirmed at ${input.price}. Use code ${input.code} at checkout when ready.`
  }
  if (p === 'playful_friend') {
    return input.verified === false
      ? `Deal locked at ${input.price} 🎉 Use code ${input.code} — I'm confirming it now.`
      : `Deal locked at ${input.price} 🎉 Use code ${input.code} at checkout whenever you're ready.`
  }
  return input.verified === false
    ? `Deal locked at ${input.price}! Use code ${input.code} — it's being confirmed now.`
    : `Deal locked at ${input.price}. Use code ${input.code} at checkout — no need to rush.`
}

export function checkoutAcceptedMessage(input: Pick<PostDealReassuranceInput, 'code' | 'persona'>): string {
  const p = input.persona ?? 'friendly_shopkeeper'
  if (p === 'strict_negotiator') return `Your negotiated price is saved with code ${input.code}. Complete checkout when ready.`
  if (p === 'playful_friend') return `Your negotiated price is saved with code ${input.code} 🎉 Finish checkout whenever you're ready.`
  return `Your negotiated price is saved with code ${input.code}. Finish checkout when you're ready — no pressure.`
}

export function dealAcceptedReassurance(input: PostDealReassuranceInput): string {
  const p = input.persona ?? 'friendly_shopkeeper'
  if (p === 'strict_negotiator') return `Agreed at ${input.price}. Code ${input.code} is ready for secure checkout.`
  if (p === 'playful_friend') return `Agreed at ${input.price} 🎉 Code ${input.code} is ready for secure checkout.`
  return `Agreed at ${input.price}. Your code ${input.code} is ready for secure checkout.`
}
