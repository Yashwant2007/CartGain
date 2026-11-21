import { sanitizeExperience } from '../config'
import { MERCHANT_AVATAR_VARIANTS } from '../types'
import {
  VRM_AVATARS,
  VRM_AVATAR_VARIANTS,
  isVrmAvatarVariant,
  vrmClipForState,
  vrmPresetForExpression,
} from '../vrm-shopkeepers'

describe('VRM shopkeeper variants', () => {
  it('registers three additive merchant options without replacing existing ones', () => {
    expect(MERCHANT_AVATAR_VARIANTS).toEqual(expect.arrayContaining(['robot', 'morgan', 'riley', 'alex', 'meera', 'kabir', 'verma']))
    expect(VRM_AVATAR_VARIANTS).toHaveLength(3)
    for (const variant of VRM_AVATAR_VARIANTS) {
      const meta = VRM_AVATARS[variant]
      expect(meta.modelUrl).toMatch(/^\/assets\/shopkeepers\/vrm\/.+\.vrm$/)
      expect(meta.clipUrl).toMatch(/^\/assets\/shopkeepers\/vrm\/clips_.+\.glb$/)
    }
  })

  it('only accepts the registered VRM variant ids', () => {
    expect(isVrmAvatarVariant('meera')).toBe(true)
    expect(isVrmAvatarVariant('kabir')).toBe(true)
    expect(isVrmAvatarVariant('verma')).toBe(true)
    expect(isVrmAvatarVariant('robot')).toBe(false)
    expect(isVrmAvatarVariant(null)).toBe(false)
  })

  it('preserves meaningful VRM expressions and motion clips for every avatar state', () => {
    expect(vrmPresetForExpression('celebrating')).toBe('happy')
    expect(vrmPresetForExpression('disappointed')).toBe('sad')
    expect(vrmPresetForExpression('warning')).toBe('angry')
    expect(vrmClipForState('entering')).toEqual({ name: 'Enter', loop: false })
    expect(vrmClipForState('celebrating')).toEqual({ name: 'Celebrate', loop: false })
    expect(vrmClipForState('negotiating')).toEqual({ name: 'Lean_Counter', loop: true })
    expect(vrmClipForState('idle')).toEqual({ name: 'Idle_Breathing', loop: true })
  })

  it('accepts a VRM variant through experience sanitization', () => {
    const experience = sanitizeExperience({ avatarVariant: 'meera', personality: 'strict_shopkeeper' })
    expect(experience.avatarVariant).toBe('meera')
    expect(experience.personality).toBe('strict_shopkeeper')
  })
})
