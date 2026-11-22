import prisma from '@/lib/db'
import { legacyPersonaFor, resolveShopkeeperPersonality } from './personality'
import {
  AVATAR_SIZES,
  AVATAR_VARIANTS,
  CHARACTER_STYLES,
  DEFAULT_BARGAIN_EXPERIENCE,
  INVITATION_DESIGNS,
  INVITATION_FONTS,
  INVITATION_POSITIONS,
  INVITATION_TEXT_ALIGNS,
  SHOPKEEPER_PERSONALITIES,
  type AvatarSize,
  type AvatarVariant,
  type BargainExperienceConfig,
  type CharacterStyle,
  type InvitationDesign,
  type InvitationFont,
  type InvitationIndicators,
  type InvitationPosition,
  type InvitationTextAlign,
  type ShopkeeperPersonality,
} from './types'

export type ExperienceChannel = 'draft' | 'published'

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

function asHex(value: unknown): string | null {
  const text = asText(value, 7)
  return text && /^#[0-9a-f]{6}$/i.test(text) ? text : null
}

function asVersion(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function asIndicators(value: unknown, fallback: InvitationIndicators): InvitationIndicators {
  if (!value || typeof value !== 'object') return { ...fallback }
  const input = value as Record<string, unknown>
  return {
    quickReply: asBoolean(input.quickReply, fallback.quickReply),
    noPressure: asBoolean(input.noPressure, fallback.noPressure),
    smartDeals: asBoolean(input.smartDeals, fallback.smartDeals),
  }
}

export function sanitizeExperience(input: any, fallback?: Partial<BargainExperienceConfig>): BargainExperienceConfig {
  const base = { ...DEFAULT_BARGAIN_EXPERIENCE, ...fallback }
  const legacyVariant = input?.avatarVariant === undefined && input?.characterStyle === 'minimal' ? 'minimal' : base.avatarVariant
  return {
    schemaVersion: asVersion(input?.schemaVersion, asVersion(base.schemaVersion, 1)),
    personality: asEnum<ShopkeeperPersonality>(input?.personality, SHOPKEEPER_PERSONALITIES, base.personality),
    designVariant: asEnum<InvitationDesign>(input?.designVariant, INVITATION_DESIGNS, base.designVariant),
    avatarEnabled: asBoolean(input?.avatarEnabled, base.avatarEnabled),
    motionEnabled: asBoolean(input?.motionEnabled, base.motionEnabled),
    avatarVariant: asEnum<AvatarVariant>(input?.avatarVariant, AVATAR_VARIANTS, legacyVariant),
    characterStyle: asEnum<CharacterStyle>(input?.characterStyle, CHARACTER_STYLES, base.characterStyle),
    essentialMotionOnly: asBoolean(input?.essentialMotionOnly, base.essentialMotionOnly),
    localeMode: asText(input?.localeMode, 40) ?? base.localeMode,
    customGreeting: input?.customGreeting === undefined ? base.customGreeting : asText(input.customGreeting, 280),
    ctaLabel: input?.ctaLabel === undefined ? base.ctaLabel : asText(input.ctaLabel, 40),
    avatarSize: asEnum<AvatarSize>(input?.avatarSize, AVATAR_SIZES, base.avatarSize),
    compact: asBoolean(input?.compact, base.compact),
    position: asEnum<InvitationPosition>(input?.position, INVITATION_POSITIONS, base.position),
    invitationVisible: asBoolean(input?.invitationVisible, base.invitationVisible),
    invitationHeadline: input?.invitationHeadline === undefined ? base.invitationHeadline : asText(input.invitationHeadline, 120),
    invitationSubtitle: input?.invitationSubtitle === undefined ? base.invitationSubtitle : asText(input.invitationSubtitle, 200),
    invitationCtaVisible: asBoolean(input?.invitationCtaVisible, base.invitationCtaVisible),
    invitationSparkleVisible: asBoolean(input?.invitationSparkleVisible, base.invitationSparkleVisible),
    invitationTextAlign: asEnum<InvitationTextAlign>(input?.invitationTextAlign, INVITATION_TEXT_ALIGNS, base.invitationTextAlign),
    invitationIndicators: asIndicators(input?.invitationIndicators, base.invitationIndicators),
    accentColor: input?.accentColor === undefined ? base.accentColor : asHex(input.accentColor),
    accentSecondaryColor: input?.accentSecondaryColor === undefined ? base.accentSecondaryColor : asHex(input.accentSecondaryColor),
    backgroundColor: input?.backgroundColor === undefined ? base.backgroundColor : asHex(input.backgroundColor),
    textColor: input?.textColor === undefined ? base.textColor : asHex(input.textColor),
    buttonColor: input?.buttonColor === undefined ? base.buttonColor : asHex(input.buttonColor),
    borderColor: input?.borderColor === undefined ? base.borderColor : asHex(input.borderColor),
    fontFamily: asEnum<InvitationFont>(input?.fontFamily, INVITATION_FONTS, base.fontFamily),
    draftVersion: asVersion(input?.draftVersion, base.draftVersion),
    publishedVersion: asVersion(input?.publishedVersion, base.publishedVersion),
  }
}

function fromFlat(config: any): BargainExperienceConfig {
  return sanitizeExperience({
    schemaVersion: config?.experienceSchemaVersion,
    personality: config?.shopkeeperPersonality,
    designVariant: config?.invitationDesign,
    avatarEnabled: config?.avatarEnabled,
    motionEnabled: config?.motionEnabled,
    characterStyle: config?.characterStyle,
    essentialMotionOnly: config?.essentialMotionOnly,
    localeMode: config?.experienceLocale,
    customGreeting: config?.invitationGreeting,
    ctaLabel: config?.invitationCtaLabel,
    accentColor: config?.invitationAccentColor,
    avatarSize: config?.invitationAvatarSize,
    compact: config?.invitationCompact,
    position: config?.invitationPosition,
    draftVersion: config?.experienceDraftVersion,
    publishedVersion: config?.experiencePublishedVersion,
  })
}

export function fromDb(config: any, channel: ExperienceChannel = 'published'): BargainExperienceConfig {
  const flat = fromFlat(config)
  const snapshot = channel === 'draft' ? config?.experienceDraft : config?.experiencePublished
  // Existing stores predate the experience columns: preserve the persona they
  // already had (aiPersona) until the merchant publishes an experience.
  if (!snapshot && config?.aiPersona) {
    flat.personality = resolveShopkeeperPersonality(undefined, config.aiPersona)
  }
  const experience = snapshot && typeof snapshot === 'object'
    ? sanitizeExperience(snapshot, flat)
    : flat
  return {
    ...experience,
    draftVersion: asVersion(config?.experienceDraftVersion, experience.draftVersion),
    publishedVersion: asVersion(config?.experiencePublishedVersion, experience.publishedVersion),
  }
}

export function publishedPersonality(config: any): ShopkeeperPersonality {
  return fromDb(config, 'published').personality
}

export async function getExperienceConfig(storeId: string, channel: ExperienceChannel = 'draft') {
  const config = await prisma.bargainConfig.upsert({
    where: { storeId },
    create: { storeId, enabled: true },
    update: {},
  })
  return { config: fromDb(config, channel), raw: config }
}

export function experienceMirror(exp: BargainExperienceConfig) {
  return {
    experienceSchemaVersion: exp.schemaVersion,
    shopkeeperPersonality: exp.personality,
    invitationDesign: exp.designVariant,
    avatarEnabled: exp.avatarEnabled,
    motionEnabled: exp.motionEnabled,
    characterStyle: exp.characterStyle,
    essentialMotionOnly: exp.essentialMotionOnly,
    invitationCtaLabel: exp.ctaLabel,
    invitationCopy: null,
    invitationGreeting: exp.customGreeting,
    invitationAccentColor: exp.accentColor,
    invitationAvatarSize: exp.avatarSize,
    invitationCompact: exp.compact,
    invitationPosition: exp.position,
    experienceLocale: exp.localeMode,
  }
}

export function toDbUpdate(exp: Partial<BargainExperienceConfig>, action: 'draft' | 'publish', current: any) {
  const currentDraft = fromDb(current, 'draft')
  const next = sanitizeExperience(exp, currentDraft)
  const draftVersion = asVersion(current?.experienceDraftVersion, 1) + 1
  const publishedVersion = asVersion(current?.experiencePublishedVersion, 1)
  const draft = { ...next, draftVersion, publishedVersion }
  const update: any = {
    experienceDraft: draft,
    experienceDraftVersion: draftVersion,
  }
  if (action === 'publish') {
    const published = { ...next, draftVersion, publishedVersion: publishedVersion + 1 }
    Object.assign(update, {
      experiencePublished: published,
      experiencePublishedVersion: publishedVersion + 1,
      ...experienceMirror(published),
    })
  }
  return update
}

export function defaultsUpdate(current: any) {
  const draftVersion = asVersion(current?.experienceDraftVersion, 1) + 1
  const publishedVersion = asVersion(current?.experiencePublishedVersion, 1) + 1
  const defaults = { ...DEFAULT_BARGAIN_EXPERIENCE, draftVersion, publishedVersion }
  return {
    experienceDraft: defaults,
    experiencePublished: defaults,
    experienceDraftVersion: draftVersion,
    experiencePublishedVersion: publishedVersion,
    ...experienceMirror(defaults),
    invitationCtaLabel: null,
    invitationGreeting: null,
    invitationAccentColor: null,
  }
}


export function applyShopkeeperPersonality(current: any, personality: ShopkeeperPersonality) {
  const patch: any = {
    shopkeeperPersonality: personality,
    aiPersona: legacyPersonaFor(personality),
  }
  const publishedRaw = current?.experiencePublished
  const draftRaw = current?.experienceDraft
  if (!publishedRaw && !draftRaw) return patch

  const draftVersion = asVersion(current?.experienceDraftVersion, 1)
  const publishedVersion = asVersion(current?.experiencePublishedVersion, 1)
  const publishedChanged = Boolean(
    publishedRaw && typeof publishedRaw === 'object' && publishedPersonality(current) !== personality,
  )
  const draftChanged = Boolean(
    draftRaw && typeof draftRaw === 'object' && fromDb(current, 'draft').personality !== personality,
  )
  if (!publishedChanged && !draftChanged) return patch

  const nextDraftVersion = draftVersion + (draftChanged ? 1 : 0)
  const nextPublishedVersion = publishedVersion + (publishedChanged ? 1 : 0)

  if (draftChanged) {
    patch.experienceDraft = {
      ...sanitizeExperience({ ...draftRaw, personality }, fromDb(current, 'draft')),
      personality,
      draftVersion: nextDraftVersion,
      publishedVersion: nextPublishedVersion,
    }
    patch.experienceDraftVersion = nextDraftVersion
  }

  if (publishedChanged) {
    const published = {
      ...sanitizeExperience({ ...publishedRaw, personality }, fromDb(current, 'published')),
      personality,
      draftVersion: nextDraftVersion,
      publishedVersion: nextPublishedVersion,
    }
    patch.experiencePublished = published
    patch.experiencePublishedVersion = nextPublishedVersion
    Object.assign(patch, experienceMirror(published))
  }

  return patch
}
