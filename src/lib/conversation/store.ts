/**
 * Server-side storage for the merchant voice.
 *
 * Kept separate from `voice.ts` so the pure voice model (used by the dashboard
 * UI and by tests) never imports Prisma.
 */
import prisma from '@/lib/db'
import { BrandVoice, resolveVoice } from './voice'

type VoiceRow = {
  persona: string
  emojiIntensity: string
  humorLevel: string
  messageLength: string
  assertiveness: string
  language: string
  bannedPhrases: string[]
  approvedPhrases: string[]
  signOff: string | null
  quietHoursStart: number | null
  quietHoursEnd: number | null
}

/**
 * The `merchantVoice` delegate is absent when the running Prisma client was
 * generated before the model existed (a rolling deploy, or a unit test with a
 * partial db mock). Recovery must keep working in that window, so the default
 * voice is returned instead of throwing.
 */
function merchantVoiceDelegate() {
  return (prisma as any).merchantVoice as
    | { findUnique: (args: any) => Promise<VoiceRow | null>; upsert: (args: any) => Promise<unknown> }
    | undefined
}

/** The voice a store writes in, or the defaults when none is configured. */
export async function loadStoreVoice(storeId: string): Promise<BrandVoice> {
  if (!merchantVoiceDelegate()) return resolveVoice(null)
  const row = await prisma.merchantVoice.findUnique({
    where: { storeId },
    select: {
      persona: true,
      emojiIntensity: true,
      humorLevel: true,
      messageLength: true,
      assertiveness: true,
      language: true,
      bannedPhrases: true,
      approvedPhrases: true,
      signOff: true,
      quietHoursStart: true,
      quietHoursEnd: true,
    },
  })
  if (!row) return resolveVoice(null)
  return resolveVoice({
    persona: row.persona as BrandVoice['persona'],
    emojiIntensity: row.emojiIntensity as BrandVoice['emojiIntensity'],
    humorLevel: row.humorLevel as BrandVoice['humorLevel'],
    messageLength: row.messageLength as BrandVoice['messageLength'],
    assertiveness: row.assertiveness as BrandVoice['assertiveness'],
    language: row.language,
    bannedPhrases: row.bannedPhrases,
    approvedPhrases: row.approvedPhrases,
    signOff: row.signOff ?? undefined,
  })
}

export type StoreVoiceSettings = BrandVoice & {
  quietHoursStart: number | null
  quietHoursEnd: number | null
}

export async function loadStoreVoiceSettings(storeId: string): Promise<StoreVoiceSettings> {
  const delegate = merchantVoiceDelegate()
  const [voice, row] = await Promise.all([
    loadStoreVoice(storeId),
    delegate
      ? delegate.findUnique({
          where: { storeId },
          select: { quietHoursStart: true, quietHoursEnd: true },
        })
      : Promise.resolve(null),
  ])
  return {
    ...voice,
    quietHoursStart: row?.quietHoursStart ?? null,
    quietHoursEnd: row?.quietHoursEnd ?? null,
  }
}

export async function saveStoreVoice(storeId: string, input: Partial<BrandVoice> & {
  quietHoursStart?: number | null
  quietHoursEnd?: number | null
}): Promise<StoreVoiceSettings> {
  const voice = resolveVoice(input)
  const quietHoursStart = normalizeHour(input.quietHoursStart)
  const quietHoursEnd = normalizeHour(input.quietHoursEnd)

  const data = {
    persona: voice.persona,
    emojiIntensity: voice.emojiIntensity,
    humorLevel: voice.humorLevel,
    messageLength: voice.messageLength,
    assertiveness: voice.assertiveness,
    language: voice.language,
    bannedPhrases: voice.bannedPhrases,
    approvedPhrases: voice.approvedPhrases,
    signOff: voice.signOff ?? null,
    quietHoursStart,
    quietHoursEnd,
  }

  const delegate = merchantVoiceDelegate()
  if (!delegate) {
    throw new Error('Brand voice storage is unavailable (stale Prisma client)')
  }
  await delegate.upsert({
    where: { storeId },
    update: data,
    create: { storeId, ...data },
  })

  return { ...voice, quietHoursStart, quietHoursEnd }
}

function normalizeHour(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const hour = Math.trunc(value)
  return hour >= 0 && hour <= 23 ? hour : null
}
