import type { AvatarState } from './avatar-state'
import type { ExpressionState } from './expressions'

export const VRM_AVATAR_VARIANTS = ['meera', 'kabir', 'verma'] as const
export type VrmAvatarVariant = (typeof VRM_AVATAR_VARIANTS)[number]

export interface VrmAvatarMeta {
  id: VrmAvatarVariant
  name: string
  role: string
  accent: string
  motion: 'soft' | 'precise' | 'bouncy'
  modelUrl: string
  clipUrl: string
  initials: string
}

export const VRM_AVATARS: Record<VrmAvatarVariant, VrmAvatarMeta> = {
  meera: {
    id: 'meera',
    name: 'Meera',
    role: 'Warm shopkeeper',
    accent: '#f59e0b',
    motion: 'soft',
    modelUrl: '/assets/shopkeepers/vrm/meera.vrm',
    clipUrl: '/assets/shopkeepers/vrm/clips_meera.glb',
    initials: 'M',
  },
  kabir: {
    id: 'kabir',
    name: 'Kabir',
    role: 'Calm shopkeeper',
    accent: '#0ea5e9',
    motion: 'precise',
    modelUrl: '/assets/shopkeepers/vrm/kabir.vrm',
    clipUrl: '/assets/shopkeepers/vrm/clips_kabir.glb',
    initials: 'K',
  },
  verma: {
    id: 'verma',
    name: 'Verma',
    role: 'Playful shopkeeper',
    accent: '#d946ef',
    motion: 'bouncy',
    modelUrl: '/assets/shopkeepers/vrm/verma.vrm',
    clipUrl: '/assets/shopkeepers/vrm/clips_verma.glb',
    initials: 'V',
  },
}

export function isVrmAvatarVariant(value: unknown): value is VrmAvatarVariant {
  return typeof value === 'string' && (VRM_AVATAR_VARIANTS as readonly string[]).includes(value)
}

export type VrmPreset =
  | 'neutral'
  | 'happy'
  | 'angry'
  | 'sad'
  | 'relaxed'
  | 'surprised'
  | 'blink'

const EXPRESSION_PRESETS: Record<ExpressionState, VrmPreset> = {
  idle: 'neutral',
  listening: 'relaxed',
  thinking: 'neutral',
  curious: 'surprised',
  surprised: 'surprised',
  amused: 'happy',
  skeptical: 'angry',
  negotiating: 'relaxed',
  disappointed: 'sad',
  happy: 'happy',
  celebrating: 'happy',
  declining: 'angry',
  error: 'angry',
  focused: 'neutral',
  concerned: 'sad',
  uncertain: 'surprised',
  determined: 'angry',
  encouraging: 'happy',
  impressed: 'happy',
  relieved: 'relaxed',
  warning: 'angry',
}

export function vrmPresetForExpression(expression: ExpressionState): VrmPreset {
  return EXPRESSION_PRESETS[expression] ?? 'neutral'
}

export interface VrmClipSelection {
  name: string
  loop: boolean
}

const STATE_CLIPS: Record<AvatarState, VrmClipSelection> = {
  idle: { name: 'Idle_Breathing', loop: true },
  entering: { name: 'Enter', loop: false },
  greeting: { name: 'Wave', loop: false },
  listening: { name: 'Listen', loop: true },
  typing: { name: 'Hold_Screen_Loop', loop: true },
  thinking: { name: 'Think', loop: true },
  calculating: { name: 'Think', loop: true },
  surprised: { name: 'Surprised', loop: false },
  confused: { name: 'Shrug', loop: false },
  happy: { name: 'Smile', loop: false },
  disappointed: { name: 'Disappointed', loop: false },
  negotiating: { name: 'Lean_Counter', loop: true },
  recommending: { name: 'Point', loop: false },
  pointing: { name: 'Point', loop: false },
  walking: { name: 'Shift_Position', loop: false },
  celebrating: { name: 'Celebrate', loop: false },
  guiding_to_checkout: { name: 'Hold_Screen', loop: false },
  goodbye: { name: 'Goodbye', loop: false },
}

export function vrmClipForState(state: AvatarState | undefined): VrmClipSelection {
  return (state && STATE_CLIPS[state]) || STATE_CLIPS.idle
}
