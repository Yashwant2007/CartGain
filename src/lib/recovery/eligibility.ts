// Pure WhatsApp eligibility policy.
//
// The recovery engine used to decide "can we send?" from the cart alone
// (a phone number existed and it was not on the opt-out list). That is not
// enough for WhatsApp: Meta requires an explicit opt-in for the recipient, and
// an opt-out/erasure request must suppress every channel immediately. Keeping
// this decision in one pure function makes the job, the dashboard and the
// tests agree on exactly one rule set.

import { isValidPhone } from '@/lib/utils'

export type WhatsAppBlockCode =
  | 'eligible'
  | 'cart_converted'
  | 'store_inactive'
  | 'whatsapp_not_configured'
  | 'missing_phone'
  | 'invalid_phone'
  | 'no_consent'
  | 'identity_mismatch'
  | 'suppressed'
  | 'opted_out'

export type WhatsAppIdentityLike = {
  phone?: string | null
  consentWhatsApp?: boolean | null
  optedOutAt?: Date | string | null
  suppressed?: boolean | null
}

export type WhatsAppEligibilityInput = {
  phone?: string | null
  identity?: WhatsAppIdentityLike | null
  cartConverted?: boolean
  storeActive?: boolean
  whatsappConfigured?: boolean
  onOptOutList?: boolean
}

export type WhatsAppEligibilityResult = {
  eligible: boolean
  code: WhatsAppBlockCode
  reason: string
}

export function normalizeWhatsAppPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return null
  if (!isValidPhone(digits)) return null
  return `+${digits}`
}

export function evaluateWhatsAppEligibility(
  input: WhatsAppEligibilityInput,
): WhatsAppEligibilityResult {
  const block = (code: WhatsAppBlockCode, reason: string): WhatsAppEligibilityResult => ({
    eligible: false,
    code,
    reason,
  })

  if (input.cartConverted) return block('cart_converted', 'Cart already purchased')
  if (input.storeActive === false) return block('store_inactive', 'Store is inactive')
  if (input.whatsappConfigured === false) {
    return block('whatsapp_not_configured', 'WhatsApp provider is not configured')
  }

  const phone = normalizeWhatsAppPhone(input.phone)
  if (!input.phone) return block('missing_phone', 'Cart has no phone number')
  if (!phone) return block('invalid_phone', 'Phone number is not a valid E.164 number')

  if (input.onOptOutList) return block('opted_out', 'Contact is on the opt-out list')

  const identity = input.identity
  if (!identity) return block('no_consent', 'No recipient record with WhatsApp consent')
  if (identity.suppressed) return block('suppressed', 'Recipient is suppressed')
  if (identity.optedOutAt) return block('opted_out', 'Recipient opted out')

  const identityPhone = normalizeWhatsAppPhone(identity.phone)
  if (!identityPhone || identityPhone !== phone) {
    return block('identity_mismatch', 'Consent is recorded for a different phone number')
  }
  if (identity.consentWhatsApp !== true) {
    return block('no_consent', 'Recipient has not explicitly opted in to WhatsApp')
  }

  return { eligible: true, code: 'eligible', reason: 'Recipient can receive WhatsApp' }
}
