import { resolveWhatsAppAccessToken } from './config'

export type DiscoveredWhatsAppNumber = {
  id: string
  displayPhoneNumber: string | null
  verifiedName: string | null
  status: string | null
  qualityRating: string | null
  platformType: string | null
  wabaId: string
  wabaName: string | null
}

type DiscoverResult = {
  ok: boolean
  numbers: DiscoveredWhatsAppNumber[]
  wabaIds: string[]
  error?: string
  lookupErrors: string[]
}

function clean(value: string | undefined): string {
  return (value || '').replace(/^\s*["']|["']\s*$/g, '').trim()
}

function configuredWabaIds(): string[] {
  return [
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    process.env.WHATSAPP_WABA_ID,
    process.env.META_WABA_ID,
  ]
    .map(clean)
    .filter(Boolean)
    .filter((id, index, all) => all.indexOf(id) === index)
}

async function graphGet(path: string, accessToken: string): Promise<{ ok: boolean; body: any }> {
  const version = process.env.WHATSAPP_API_VERSION || 'v22.0'
  try {
    const response = await fetch(`https://graph.facebook.com/${version}/${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    })
    const body = await response.json().catch(() => ({}))
    return { ok: response.ok, body }
  } catch (error: any) {
    return { ok: false, body: { error: { message: error?.message || 'request failed' } } }
  }
}

async function numbersForWaba(
  wabaId: string,
  wabaName: string | null,
  accessToken: string,
): Promise<{ numbers: DiscoveredWhatsAppNumber[]; error?: string }> {
  const result = await graphGet(
    `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,status,quality_rating,platform_type`,
    accessToken,
  )
  if (!result.ok) {
    return { numbers: [], error: result.body?.error?.message || `Could not read ${wabaId}` }
  }
  return {
    numbers: (result.body?.data || []).map((number: any) => ({
      id: String(number.id),
      displayPhoneNumber: number.display_phone_number || null,
      verifiedName: number.verified_name || null,
      status: number.status || null,
      qualityRating: number.quality_rating || null,
      platformType: number.platform_type || null,
      wabaId,
      wabaName,
    })),
  }
}

export async function discoverWhatsAppPhoneNumbers(opts?: {
  wabaId?: string
  accessToken?: string
}): Promise<DiscoverResult> {
  const accessToken = clean(opts?.accessToken || resolveWhatsAppAccessToken()).replace(/^Bearer\s+/i, '')
  if (!accessToken) {
    return {
      ok: false,
      numbers: [],
      wabaIds: [],
      error: 'WhatsApp is not connected on this deployment.',
      lookupErrors: [],
    }
  }

  const lookupErrors: string[] = []
  const wabas: Array<{ id: string; name: string | null }> = []
  const explicitWaba = clean(opts?.wabaId)
  if (explicitWaba) {
    wabas.push({ id: explicitWaba, name: null })
  } else {
    for (const id of configuredWabaIds()) wabas.push({ id, name: null })
  }

  if (wabas.length === 0) {
    const businesses = await graphGet('me/businesses?fields=id,name', accessToken)
    if (!businesses.ok) {
      lookupErrors.push(businesses.body?.error?.message || 'Could not read Meta businesses')
    }
    for (const business of businesses.body?.data || []) {
      const owned = await graphGet(
        `${business.id}/owned_whatsapp_business_accounts?fields=id,name`,
        accessToken,
      )
      if (!owned.ok) {
        lookupErrors.push(owned.body?.error?.message || `Could not read business ${business.id}`)
        continue
      }
      for (const waba of owned.body?.data || []) {
        wabas.push({ id: String(waba.id), name: waba.name || null })
      }
    }
  }

  const numbers: DiscoveredWhatsAppNumber[] = []
  for (const waba of wabas) {
    const found = await numbersForWaba(waba.id, waba.name, accessToken)
    if (found.error) lookupErrors.push(found.error)
    numbers.push(...found.numbers)
  }

  const deduped = numbers.filter(
    (number, index, all) => all.findIndex((candidate) => candidate.id === number.id) === index,
  )

  return {
    ok: deduped.length > 0,
    numbers: deduped,
    wabaIds: wabas.map((waba) => waba.id),
    error:
      deduped.length === 0
        ? lookupErrors[0] ||
          'No WhatsApp number was found. Add the number to the WhatsApp Business Account connected to CartGain, then try again.'
        : undefined,
    lookupErrors,
  }
}
