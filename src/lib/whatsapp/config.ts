// Resolution of the Meta/WhatsApp webhook credentials.
//
// The canonical names are WHATSAPP_APP_SECRET / WHATSAPP_VERIFY_TOKEN, but a
// deployment that already manages Meta credentials for other surfaces commonly
// only has the generic META_* / FACEBOOK_* names set. Reading the aliases here
// means a correctly-configured app is not reported as "not configured" (which
// previously produced a misleading webhook_verify warning on every delivery).
// Values are trimmed: secrets pasted into dashboards frequently carry stray
// whitespace, and an untrimmed HMAC key silently fails every verification.

function firstNonEmpty(names: Array<string | undefined>): string | undefined {
  for (const name of names) {
    const raw = name ? process.env[name] : undefined
    if (raw && raw.trim()) return raw.trim()
  }
  return undefined
}

export function resolveWhatsAppAppSecret(): string | undefined {
  return firstNonEmpty(['WHATSAPP_APP_SECRET', 'META_APP_SECRET', 'FACEBOOK_APP_SECRET'])
}

export function resolveWhatsAppVerifyToken(): string | undefined {
  return firstNonEmpty(['WHATSAPP_VERIFY_TOKEN', 'META_VERIFY_TOKEN', 'FACEBOOK_VERIFY_TOKEN'])
}

export function resolveWhatsAppPhoneNumberId(): string | undefined {
  return firstNonEmpty(['WHATSAPP_PHONE_NUMBER_ID', 'META_PHONE_NUMBER_ID'])
}

export function resolveWhatsAppAccessToken(): string | undefined {
  return firstNonEmpty(['WHATSAPP_BUSINESS_TOKEN', 'META_WHATSAPP_TOKEN', 'WHATSAPP_ACCESS_TOKEN'])
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(resolveWhatsAppPhoneNumberId() && resolveWhatsAppAccessToken())
}
