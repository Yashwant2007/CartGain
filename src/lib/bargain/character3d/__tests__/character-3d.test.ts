import { buildCharacter } from '@/lib/bargain/character3d/build'
import { buildClipLibrary } from '@/lib/bargain/character3d/clips'
import { BONE_DEFS } from '@/lib/bargain/character3d/rig'
import { characterSpecFor, ALL_CHARACTER_SPECS } from '@/lib/bargain/character3d/specs'
import { planForEvent, sanitizePlan } from '@/lib/bargain/character3d/machine'
import { toCharacter3DState } from '@/lib/bargain/character3d/state-map'
import {
  CHARACTER_3D_STATES,
  isCharacter3DState,
} from '@/lib/bargain/character3d/types'
import { AVATAR_STATES } from '@/lib/bargain/experience/avatar-state'
import type { ShopkeeperPersonality } from '@/lib/bargain/experience/types'

const PERSONALITIES: ShopkeeperPersonality[] = [
  'friendly_shopkeeper',
  'strict_shopkeeper',
  'playful_shopkeeper',
]

describe('character3d pipeline', () => {
  it('gives each personality a distinct rig spec', () => {
    const ids = new Set(PERSONALITIES.map((personality) => characterSpecFor(personality).id))
    expect(ids.size).toBe(3)
    for (const personality of PERSONALITIES) {
      expect(characterSpecFor(personality).personality).toBe(personality)
    }
    expect(ALL_CHARACTER_SPECS).toHaveLength(3)
  })

  it('builds a real skinned character for every spec', () => {
    for (const spec of ALL_CHARACTER_SPECS) {
      const built = buildCharacter(spec)
      expect(built.height).toBeGreaterThan(0)
      expect(built.width).toBeGreaterThan(0)
      expect(Object.keys(built.bones)).toHaveLength(BONE_DEFS.length)
      expect(built.meshes.length).toBeGreaterThanOrEqual(6)
      expect(() => built.dispose()).not.toThrow()
    }
  })

  it('authors a clip for every skeletal state', () => {
    const clips = buildClipLibrary(1)
    expect(Object.keys(clips).sort()).toEqual([...CHARACTER_3D_STATES].sort())
    for (const state of CHARACTER_3D_STATES) {
      expect(clips[state].duration).toBeGreaterThan(0)
      expect(clips[state].tracks.length).toBeGreaterThan(0)
    }
  })

  it('maps conversation events onto allowed skeletal plans', () => {
    expect(planForEvent('strict_shopkeeper', 'widget_opened')).toEqual(['walk', 'enter'])
    expect(planForEvent('playful_shopkeeper', 'deal_accepted')).toEqual(['celebrate'])
    expect(planForEvent('friendly_shopkeeper', 'greeting')).toEqual(['wave'])
    expect(planForEvent('strict_shopkeeper', 'greeting')).toEqual(['greet'])
    expect(planForEvent('playful_shopkeeper', 'customer_message', {
      customerMessage: 'What features does this product have?',
      frameReady: true,
    })).toEqual(['smile', 'point'])
    expect(planForEvent('friendly_shopkeeper', 'customer_message', {
      customerMessage: 'What features does this product have?',
      frameReady: true,
    })).toEqual(['explain', 'point'])
    expect(planForEvent('strict_shopkeeper', 'customer_message', {
      customerMessage: 'What features does this product have?',
      frameReady: true,
    })).toEqual(['point'])

    // Frame states require a measured frame and the playful character.
    expect(sanitizePlan('playful_shopkeeper', ['climb', 'point'], { frameReady: false })).toEqual(['point'])
    expect(sanitizePlan('strict_shopkeeper', ['hang'], { frameReady: true })).toEqual(['idle'])
    expect(sanitizePlan('playful_shopkeeper', ['hang'], { frameReady: true })).toEqual(['hang'])
  })

  it('plans every required real storefront event into supported clips', () => {
    const events = [
      'widget_opened', 'greeting', 'customer_typing', 'customer_message',
      'ai_thinking', 'ai_reply', 'counter_offer', 'deal_accepted',
      'deal_rejected', 'checkout_started', 'widget_closed',
    ] as const
    for (const personality of PERSONALITIES) {
      for (const event of events) {
        const plan = sanitizePlan(personality, planForEvent(personality, event, {
          frameReady: true,
          customerMessage: event === 'customer_message' ? 'Can you tell me more about this product?' : undefined,
          originalPrice: 100,
          decision: event === 'ai_reply' ? 'counter' : undefined,
          counterOffer: event === 'ai_reply' ? 90 : undefined,
          ended: event === 'deal_accepted' ? 'accepted' : event === 'deal_rejected' ? 'rejected' : undefined,
        }), { frameReady: true })
        expect(plan.length).toBeGreaterThan(0)
        expect(new Set(plan).size).toBe(plan.length)
        for (const state of plan) expect(CHARACTER_3D_STATES).toContain(state)
      }
    }
  })

  it('bridges every conversation avatar state to a valid 3D state', () => {
    for (const state of AVATAR_STATES) {
      expect(isCharacter3DState(toCharacter3DState(state))).toBe(true)
    }
    expect(toCharacter3DState(undefined)).toBe('idle')
    expect(toCharacter3DState('celebrating', 'playful_shopkeeper')).toBe('celebrate')
  })
})
