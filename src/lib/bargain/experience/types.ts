export const SHOPKEEPER_PERSONALITIES = [
  'friendly_shopkeeper',
  'strict_shopkeeper',
  'playful_shopkeeper',
] as const
export type ShopkeeperPersonality = (typeof SHOPKEEPER_PERSONALITIES)[number]

export const INVITATION_DESIGNS = [
  'smart-assistant',
  'playful-bargain-club',
  'unlock-your-deal',
  'human-shopkeeper',
] as const
export type InvitationDesign = (typeof INVITATION_DESIGNS)[number]

export const AVATAR_SIZES = ['sm', 'md', 'lg'] as const
export type AvatarSize = (typeof AVATAR_SIZES)[number]

/**
 * Supported visual styles for the living shopkeeper.
 * - `signature`: the full original character (apron, accessory, hands/body gestures)
 * - `minimal`:   a flat, lightweight rendering with no gesture layer (fastest,
 *                best for very low-end devices and for merchants who want a
 *                calmer storefront).
 */
export const CHARACTER_STYLES = ['signature', 'minimal'] as const
export type CharacterStyle = (typeof CHARACTER_STYLES)[number]

export const AVATAR_VARIANTS = ['robot', 'morgan', 'riley', 'alex', 'meera', 'kabir', 'verma', 'signature', 'minimal'] as const
export type AvatarVariant = (typeof AVATAR_VARIANTS)[number]

export const MERCHANT_AVATAR_VARIANTS = ['robot', 'morgan', 'riley', 'alex', 'meera', 'kabir', 'verma'] as const

export const INVITATION_POSITIONS = ['bottom-right', 'bottom-left', 'inline'] as const
export type InvitationPosition = (typeof INVITATION_POSITIONS)[number]

export const INVITATION_FONTS = ['system', 'rounded', 'serif'] as const
export type InvitationFont = (typeof INVITATION_FONTS)[number]

export const INVITATION_TEXT_ALIGNS = ['left', 'center'] as const
export type InvitationTextAlign = (typeof INVITATION_TEXT_ALIGNS)[number]

export interface InvitationIndicators {
  quickReply: boolean
  noPressure: boolean
  smartDeals: boolean
}

export interface BargainExperienceConfig {
  schemaVersion: number
  personality: ShopkeeperPersonality
  designVariant: InvitationDesign
  avatarEnabled: boolean
  motionEnabled: boolean
  /** Selected merchant-facing avatar: robot, v2 sprite, or VRM shopkeeper. */
  avatarVariant: AvatarVariant
  /** Visual rendering style of the character (see CHARACTER_STYLES). */
  characterStyle: CharacterStyle
  /** When true only state-changing (essential) motion runs — no idle loops. */
  essentialMotionOnly: boolean
  localeMode: string
  customGreeting: string | null
  ctaLabel: string | null
  accentColor: string | null
  avatarSize: AvatarSize
  compact: boolean
  position: InvitationPosition
  invitationVisible: boolean
  invitationHeadline: string | null
  invitationSubtitle: string | null
  invitationCtaVisible: boolean
  invitationSparkleVisible: boolean
  invitationTextAlign: InvitationTextAlign
  invitationIndicators: InvitationIndicators
  accentSecondaryColor: string | null
  backgroundColor: string | null
  textColor: string | null
  buttonColor: string | null
  borderColor: string | null
  fontFamily: InvitationFont
  draftVersion: number
  publishedVersion: number
}

export const DEFAULT_BARGAIN_EXPERIENCE: BargainExperienceConfig = {
  schemaVersion: 1,
  personality: 'friendly_shopkeeper',
  designVariant: 'smart-assistant',
  avatarEnabled: true,
  motionEnabled: true,
  avatarVariant: 'morgan',
  characterStyle: 'signature',
  essentialMotionOnly: false,
  localeMode: 'store-default',
  customGreeting: null,
  ctaLabel: null,
  avatarSize: 'md',
  compact: false,
  position: 'bottom-right',
  invitationVisible: true,
  invitationHeadline: null,
  invitationSubtitle: null,
  invitationCtaVisible: true,
  invitationSparkleVisible: true,
  invitationTextAlign: 'left',
  invitationIndicators: { quickReply: true, noPressure: true, smartDeals: true },
  accentColor: '#7c3aed',
  accentSecondaryColor: '#a78bfa',
  backgroundColor: '#faf9ff',
  textColor: '#111827',
  buttonColor: '#7c3aed',
  borderColor: '#ddd6fe',
  fontFamily: 'system',
  draftVersion: 1,
  publishedVersion: 1,
}

export interface PersonalityMeta {
  id: ShopkeeperPersonality
  name: string
  /** The character's in-world role, e.g. "The Deal Master". */
  title: string
  description: string
  exampleDialogue: string[]
}

export const PERSONALITY_META: PersonalityMeta[] = [
  {
    id: 'friendly_shopkeeper',
    name: 'Morgan',
    title: 'The Friendly Shopkeeper',
    description: 'Warm, patient, and genuinely helpful. Explains value, offers alternatives, and keeps the mood easy.',
    exampleDialogue: [
      "Hey there! 😊 Found something you like? Let's see if we can find a deal that works for you.",
      "That's a little lower than I can manage, but let me see what I can do!",
    ],
  },
  {
    id: 'strict_shopkeeper',
    name: 'Alex',
    title: 'The Strict Shopkeeper',
    description: 'Composed, precise, and commercially disciplined. Firm counters with a respectful, professional tone.',
    exampleDialogue: [
      "Welcome. Make me a reasonable offer and I will see what is possible.",
      "That is below what I can consider. I can offer a better price within my available limits.",
    ],
  },
  {
    id: 'playful_shopkeeper',
    name: 'Riley',
    title: 'The Playful Shopkeeper',
    description: 'Witty, energetic, and expressive with one tasteful emoji at a time. Teases lightly and celebrates deals.',
    exampleDialogue: [
      "👀 Got a price in mind? Let's see if your bargaining skills are as good as you think!",
      "Whoa 😂 That's a bold opening! Let's meet somewhere more realistic.",
    ],
  },
]

export interface DesignVariantMeta {
  id: InvitationDesign
  name: string
  positioning: string
  defaultCopy: string
  defaultCta: string
}

export const DESIGN_VARIANT_META: DesignVariantMeta[] = [
  { id: 'smart-assistant', name: 'Smart Deal Assistant', positioning: 'Premium, clean, professional for D2C brands', defaultCopy: "Got a price in mind? Let's chat and make a better deal! 🚀", defaultCta: 'Make an offer' },
  { id: 'playful-bargain-club', name: 'Playful Bargain Club', positioning: 'Energetic for younger/casual brands', defaultCopy: 'Think you can beat this price? 😏', defaultCta: 'Challenge the price' },
  { id: 'unlock-your-deal', name: 'Unlock Your Deal', positioning: 'Refined for beauty, gifting, premium products', defaultCopy: 'Your personal deal awaits ✨', defaultCta: 'Unlock your deal' },
  { id: 'human-shopkeeper', name: 'Human Shopkeeper', positioning: 'Conversational, friendly, localized experiences', defaultCopy: 'Bhai, price ki baat karein? 😄', defaultCta: "Let's negotiate" },
]

interface InvitationDesignPreset {
  headline: string | null
  subtitle: string | null
  cta: string | null
  accent: string
  secondary: string
  background: string
  text: string
  button: string
  border: string
  font: InvitationFont
}

export const INVITATION_DESIGN_PRESETS: Record<InvitationDesign, InvitationDesignPreset> = {
  'smart-assistant': {
    headline: null,
    subtitle: null,
    cta: null,
    accent: '#7c3aed',
    secondary: '#a78bfa',
    background: '#faf9ff',
    text: '#111827',
    button: '#7c3aed',
    border: '#ddd6fe',
    font: 'system',
  },
  'playful-bargain-club': {
    headline: 'Think you can beat this price? 😏',
    subtitle: 'A cheeky little negotiation, no pressure at all.',
    cta: 'Challenge the price',
    accent: '#f97316',
    secondary: '#fbbf24',
    background: '#fff8ed',
    text: '#7c2d12',
    button: '#ea580c',
    border: '#fed7aa',
    font: 'rounded',
  },
  'unlock-your-deal': {
    headline: 'Your personal deal awaits ✨',
    subtitle: "Tell us what feels right — we'll do our best.",
    cta: 'Unlock your deal',
    accent: '#b8860b',
    secondary: '#f6d365',
    background: '#fffcf4',
    text: '#3f2d10',
    button: '#b8860b',
    border: '#fde68a',
    font: 'serif',
  },
  'human-shopkeeper': {
    headline: 'Bhai, price ki baat karein? 😄',
    subtitle: 'Batao, kya price chalega?',
    cta: "Let's negotiate",
    accent: '#0f766e',
    secondary: '#5eead4',
    background: '#f0fdfa',
    text: '#134e4a',
    button: '#0f766e',
    border: '#99f6e4',
    font: 'system',
  },
}

export function applyInvitationDesignPreset(
  config: BargainExperienceConfig,
  design: InvitationDesign,
): BargainExperienceConfig {
  const preset = INVITATION_DESIGN_PRESETS[design]
  return {
    ...config,
    designVariant: design,
    invitationVisible: true,
    invitationHeadline: preset.headline,
    invitationSubtitle: preset.subtitle,
    invitationCtaVisible: true,
    invitationSparkleVisible: true,
    invitationTextAlign: 'left',
    invitationIndicators: { quickReply: true, noPressure: true, smartDeals: true },
    customGreeting: null,
    ctaLabel: preset.cta,
    accentColor: preset.accent,
    accentSecondaryColor: preset.secondary,
    backgroundColor: preset.background,
    textColor: preset.text,
    buttonColor: preset.button,
    borderColor: preset.border,
    fontFamily: preset.font,
  }
}
