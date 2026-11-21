export interface PostDealReassuranceInput {
  price: string
  code: string
  verified?: boolean
}

export function dealAcceptedMessage(input: PostDealReassuranceInput): string {
  return input.verified === false
    ? `Deal locked at ${input.price}! Use code ${input.code} — it's being confirmed now.`
    : `Deal locked at ${input.price}. Use code ${input.code} at checkout — no need to rush.`
}

export function checkoutAcceptedMessage(input: Pick<PostDealReassuranceInput, 'code'>): string {
  return `Your negotiated price is saved with code ${input.code}. Finish checkout when you're ready — no pressure.`
}

export function dealAcceptedReassurance(input: PostDealReassuranceInput): string {
  return `Agreed at ${input.price}. Your code ${input.code} is ready for secure checkout.`
}
