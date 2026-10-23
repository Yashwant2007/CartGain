/**
 * WhatsApp send failures — which ones are worth retrying.
 *
 * A recovery sweep runs every few minutes and a failed message stays retryable
 * at the same round. That is exactly right for transient failures (network
 * blip, rate limit), but wrong for failures that will never succeed for this
 * recipient or with the current template: retrying them every sweep can never
 * advance the round. Those are also the cases where an email fallback should
 * take over immediately.
 *
 * Meta error codes:
 *   131026 message undeliverable (recipient has no WhatsApp / no capability)
 *   131053 media upload failed (the product photo cannot be fetched)
 *   132000 template parameter/component mismatch
 *   132001 template not found for the language
 *   132012 header format mismatch
 *   131008 required parameter missing
 *   131047 re-engagement window — only applies to free-form text, not templates,
 *          so it is transient from the recovery pipeline's perspective.
 */

export type WhatsAppFailure = {
  errorCode?: number
  errorSubcode?: number
  error?: string
  errorDetails?: string
}

const PERMANENT_CODES = new Set([
  131026, // undeliverable / not on WhatsApp
  131053, // media upload failed
  132000, // template param mismatch
  132001, // template not found for language
  132012, // header format mismatch
  131008, // required parameter missing
])

const PERMANENT_PATTERN =
  /not on whatsapp|isn'?t on whatsapp|undeliverable|recipient.*(invalid|not.*whatsapp)|number.*(invalid|not.*whatsapp)|template.*(not found|does not exist|mismatch|not approved)/i

export function isPermanentWhatsAppFailure(failure: WhatsAppFailure): boolean {
  if (typeof failure.errorCode === 'number' && PERMANENT_CODES.has(failure.errorCode)) {
    return true
  }
  const text = [failure.error, failure.errorDetails].filter(Boolean).join(' ')
  return text.length > 0 && PERMANENT_PATTERN.test(text)
}

/**
 * Credential/permission failures. Retrying cannot help until a human fixes the
 * Meta app (token scopes, app secret, account restriction), so the customer
 * should still get the email in this round — but the WhatsApp row must stay
 * retryable, because once the credential is repaired the channel works again.
 */
const CONFIG_CODES = new Set([
  10, // permission denied
  100, // invalid parameter — Graph answers this for a bad/unscoped token
  102, // session invalid
  190, // access token expired
  200, // permission error
  131031, // WhatsApp account restricted/locked
])

const CONFIG_PATTERN = /not configured|oauthexception|access token|permission|scope/i

export function isConfigWhatsAppFailure(failure: WhatsAppFailure): boolean {
  if (typeof failure.errorCode === 'number' && CONFIG_CODES.has(failure.errorCode)) {
    return true
  }
  const text = [failure.error, failure.errorDetails].filter(Boolean).join(' ')
  return text.length > 0 && CONFIG_PATTERN.test(text)
}
