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

export const INVITATION_POSITIONS = ['bottom-right', 'bottom-left', 'inline'] as const
export type InvitationPosition = (typeof INVITATION_POSITIONS)[number]

export interface BargainExperienceConfig {
  schemaVersion: number
  personality: ShopkeeperPersonality
  designVariant: InvitationDesign
  avatarEnabled: boolean
  motionEnabled: boolean
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
  description: string
  exampleDialogue: string[]
}

export const PERSONALITY_META: PersonalityMeta[] = [
  {
    id: 'friendly_shopkeeper',
    name: 'Friendly Shopkeeper',
    description: 'Welcoming, warm, patient, and trustworthy. Explains value and offers alternatives.',
    exampleDialogue: [
      "Hey there! 😊 Found something you like? Let's see if we can find a deal that works for you.",
      "That's a little lower than I can manage, but let me see what I can do!",
    ],
  },
  {
    id: 'strict_shopkeeper',
    name: 'Strict Shopkeeper',
    description: 'Confident, composed, firm, and commercially disciplined. Clear counters without hostility.',
    exampleDialogue: [
      "Welcome! Ready to negotiate? Make me a reasonable offer and let's see what we can do.",
      "That's below what I can consider. I can offer you a better price within my available limits.",
    ],
  },
  {
    id: 'playful_shopkeeper',
    name: 'Playful Shopkeeper',
    description: 'Witty, expressive, and fun with restrained humor. Celebrates deals without spamming jokes.',
    exampleDialogue: [
      "👀 You've got a price in mind? Let's see if your bargaining skills are as good as you think!",
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
