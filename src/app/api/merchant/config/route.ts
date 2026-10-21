import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { loadStoreVoiceSettings, saveStoreVoice } from '@/lib/conversation/store'
import {
  ASSERTIVENESS_LEVELS,
  EMOJI_INTENSITIES,
  HUMOR_LEVELS,
  MESSAGE_LENGTHS,
  VOICE_PERSONAS,
  VOICE_PRESETS,
  resolveVoice,
} from '@/lib/conversation/voice'

export const dynamic = 'force-dynamic'

async function resolveStore(userId: string, storeId: string | null) {
  if (!storeId) return null
  return prisma.store.findFirst({ where: { id: storeId, userId }, select: { id: true } })
}

/**
 * GET /api/merchant/config?storeId=…
 *
 * The merchant's brand voice: persona, emoji policy, humour, length,
 * assertiveness, language, banned/approved vocabulary, sign-off and quiet
 * hours. Returns the resolved defaults when the store has never configured a
 * voice, so the dashboard can render a complete form immediately.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const storeId = request.nextUrl.searchParams.get('storeId')
  const store = await resolveStore(session.user.id, storeId)
  if (!store) {
    return NextResponse.json({ message: 'Store not found' }, { status: 404 })
  }

  const settings = await loadStoreVoiceSettings(store.id)
  return NextResponse.json({
    ...settings,
    options: {
      personas: VOICE_PERSONAS,
      emojiIntensities: EMOJI_INTENSITIES,
      humorLevels: HUMOR_LEVELS,
      messageLengths: MESSAGE_LENGTHS,
      assertiveness: ASSERTIVENESS_LEVELS,
      presets: VOICE_PRESETS,
    },
  })
}

/**
 * PUT /api/merchant/config?storeId=…
 *
 * Saves the voice. Every field is normalised through `resolveVoice`, so an
 * invalid value degrades to the preset instead of producing an invalid prompt.
 */
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const storeId = request.nextUrl.searchParams.get('storeId')
  const store = await resolveStore(session.user.id, storeId)
  if (!store) {
    return NextResponse.json({ message: 'Store not found' }, { status: 404 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 })
  }

  const input = {
    persona: body?.persona,
    emojiIntensity: body?.emojiIntensity,
    humorLevel: body?.humorLevel,
    messageLength: body?.messageLength,
    assertiveness: body?.assertiveness,
    language: body?.language,
    bannedPhrases: body?.bannedPhrases,
    approvedPhrases: body?.approvedPhrases,
    signOff: body?.signOff,
    quietHoursStart: body?.quietHoursStart,
    quietHoursEnd: body?.quietHoursEnd,
  }

  // Reject a quiet-hours window that is not a valid pair of hours (0-23).
  for (const key of ['quietHoursStart', 'quietHoursEnd'] as const) {
    const value = input[key]
    if (value !== null && value !== undefined && (typeof value !== 'number' || value < 0 || value > 23)) {
      return NextResponse.json({ message: `${key} must be an hour between 0 and 23` }, { status: 400 })
    }
  }

  const saved = await saveStoreVoice(store.id, input)

  console.info('[merchant-config] brand voice updated', {
    storeId: store.id,
    userId: session.user.id,
    persona: saved.persona,
    bannedPhraseCount: saved.bannedPhrases.length,
  })

  return NextResponse.json(saved)
}

/**
 * DELETE /api/merchant/config?storeId=…
 * Reset to the default voice.
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const storeId = request.nextUrl.searchParams.get('storeId')
  const store = await resolveStore(session.user.id, storeId)
  if (!store) {
    return NextResponse.json({ message: 'Store not found' }, { status: 404 })
  }

  await prisma.merchantVoice.deleteMany({ where: { storeId: store.id } })
  const voice = resolveVoice(null)
  return NextResponse.json({ ...voice, quietHoursStart: null, quietHoursEnd: null })
}
