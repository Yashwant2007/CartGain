import { describe, it, expect } from '@jest/globals'
import type { ShopkeeperPersonality } from '@/lib/bargain/experience/types'
import {
  planForEvent,
  isPlanAllowed,
  sanitizePlan,
  AMBIENT_CYCLES,
  FRAME_STATES,
  requiresFrame,
} from '@/lib/bargain/character3d/machine'
import type { Character3DState } from '@/lib/bargain/character3d/types'

const ctx = { frameReady: true } as const

describe('character3d state machine', () => {
  it('opens with enter, then settles', () => {
    expect(planForEvent('strict_shopkeeper', 'widget_opened', {})).toEqual(['enter'])
  })

  it('greets by personality', () => {
    expect(planForEvent('strict_shopkeeper', 'greeting', {})).toEqual(['greet'])
    expect(planForEvent('friendly_shopkeeper', 'greeting', {})).toEqual(['wave'])
    expect(planForEvent('playful_shopkeeper', 'greeting', {})).toEqual(['peek', 'wave'])
  })

  it('reacts to a lowball offer with surprise/disappointment', () => {
    const low = { customerMessage: '100', originalPrice: 1000 }
    expect(planForEvent('playful_shopkeeper', 'customer_message', low)).toEqual(['surprised'])
    expect(planForEvent('strict_shopkeeper', 'customer_message', low)).toEqual(['disappointed'])
  })

  it('goes into salesperson mode on a product question', () => {
    expect(planForEvent('friendly_shopkeeper', 'customer_message', { customerMessage: 'what material is this?' })).toEqual([
      'explain',
      'point',
    ])
    expect(planForEvent('playful_shopkeeper', 'customer_message', { customerMessage: 'what material is this?' })).toEqual([
      'jump',
      'point',
    ])
  })

  it('celebrates on accept, guides on checkout', () => {
    expect(planForEvent('strict_shopkeeper', 'deal_accepted', {})).toEqual(['celebrate'])
    expect(planForEvent('playful_shopkeeper', 'deal_accepted', {})).toEqual(['jump', 'celebrate'])
    expect(planForEvent('strict_shopkeeper', 'checkout_started', {})).toEqual(['guide'])
  })

  it('exits on session end', () => {
    expect(planForEvent('friendly_shopkeeper', 'session_ended', {})).toEqual(['exit'])
  })

  it('sanitizes plans requiring a frame when none is ready', () => {
    expect(sanitizePlan('playful_shopkeeper', ['peek', 'wave'], { frameReady: false })).toEqual([
      'wave',
    ])
    expect(sanitizePlan('strict_shopkeeper', ['sit'], { frameReady: true })).toEqual(['idle'])
  })

  it('only allows frame states for the playful character', () => {
    expect(isPlanAllowed('playful_shopkeeper', ['sit'], { frameReady: true })).toBe(true)
    expect(isPlanAllowed('strict_shopkeeper', ['sit'], { frameReady: true })).toBe(false)
    expect(isPlanAllowed('friendly_shopkeeper', ['hang'], { frameReady: true })).toBe(false)
  })

  it('ambient cycles are personality specific', () => {
    expect(AMBIENT_CYCLES['strict_shopkeeper']).toEqual([])
    expect(AMBIENT_CYCLES['friendly_shopkeeper']).toEqual(['walk', 'idle'])
    expect(AMBIENT_CYCLES['playful_shopkeeper']).toEqual([
      'peek', 'sit', 'hang', 'climb', 'walk', 'idle',
    ])
  })

  it('frame states require a measured frame', () => {
    for (const state of FRAME_STATES) {
      expect(requiresFrame(state)).toBe(true)
    }
    expect(requiresFrame('idle')).toBe(false)
    expect(requiresFrame('celebrate')).toBe(false)
  })

  it('every personality is covered', () => {
    const personalities: ShopkeeperPersonality[] = [
      'strict_shopkeeper',
      'friendly_shopkeeper',
      'playful_shopkeeper',
    ]
    for (const p of personalities) {
      expect(planForEvent(p, 'widget_opened', {})[0]).toBe('enter')
      expect(Array.isArray(AMBIENT_CYCLES[p])).toBe(true)
    }
  })
})
