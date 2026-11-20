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

export const AVATAR_VARIANTS = ['robot', 'morgan', 'riley', 'alex', 'signature', 'minimal'] as const
export type AvatarVariant = (typeof AVATAR_VARIANTS)[number]

export const MERCHANT_AVATAR_VARIANTS = ['robot', 'morgan', 'riley', 'alex'] as const

export const INVITATION_POSITIONS = ['bottom-right', 'bottom-left', 'inline'] as const
export type InvitationPosition = (typeof INVITATION_POSITIONS)[number]

export interface BargainExperienceConfig {
  schemaVersion: number
  personality: ShopkeeperPersonality
  designVariant: InvitationDesign
  avatarEnabled: boolean
  motionEnabled: boolean
  /** Selected merchant-facing avatar: robot or one of the three v2 characters. */
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
  draftVersion: number
  publishedVersion: number
}

export const DEFAULT_BARGAIN_EXPERIENCE: BargainExperienceConfig = {
  schemaVersion: 1,
  personality: 'friendly_shopkeeper',
  designVariant: 'smart-assistant',
  avatarEnabled: true,
  motionEnabled: true,
  avatarVariant: 'robot',
  characterStyle: 'signature',
  essentialMotionOnly: false,
  localeMode: 'store-default',
  customGreeting: null,
  ctaLabel: null,
  accentColor: null,
  avatarSize: 'md',
  compact: false,
  position: 'bottom-right',
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
  { id: 'smart-assistant', name: 'Smart Deal Assistant', positioning: 'Premium, clean, professional for D2C brands', defaultCopy: "Got a price in mind? 💬 Let's talk.", defaultCta: 'Make an offer' },
  { id: 'playful-bargain-club', name: 'Playful Bargain Club', positioning: 'Energetic for younger/casual brands', defaultCopy: 'Think you can beat this price? 😏', defaultCta: 'Challenge the price' },
  { id: 'unlock-your-deal', name: 'Unlock Your Deal', positioning: 'Refined for beauty, gifting, premium products', defaultCopy: 'Your personal deal awaits ✨', defaultCta: 'Unlock your deal' },
  { id: 'human-shopkeeper', name: 'Human Shopkeeper', positioning: 'Conversational, friendly, localized experiences', defaultCopy: 'Bhai, price ki baat karein? 😄', defaultCta: "Let's negotiate" },
]
