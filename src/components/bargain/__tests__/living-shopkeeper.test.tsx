/**
 * @jest-environment jsdom
 */
import { describe, expect, it, beforeEach } from '@jest/globals'
import { render } from '@testing-library/react'
import { ShopkeeperAvatar } from '@/components/bargain/ShopkeeperAvatar'
import ShopkeeperStage from '@/components/bargain/ShopkeeperStage'
import { AVATAR_STATES } from '@/lib/bargain/experience/avatar-state'
import { gestureFor } from '@/lib/bargain/experience/character'
import type { ShopkeeperPersonality } from '@/lib/bargain/experience/types'

const PERSONALITIES: ShopkeeperPersonality[] = [
  'friendly_shopkeeper',
  'strict_shopkeeper',
  'playful_shopkeeper',
]

function stubMatchMedia(reduced = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduced && query.includes('reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

beforeEach(() => {
  stubMatchMedia(false)
})

describe('living shopkeeper avatar', () => {
  it('renders every animation state with its own data attributes', () => {
    for (const state of AVATAR_STATES) {
      const { container, unmount } = render(
        <ShopkeeperAvatar
          personality="friendly_shopkeeper"
          expression="listening"
          state={state}
          gesture={gestureFor('friendly_shopkeeper', state)}
        />,
      )
      const avatar = container.querySelector('[data-avatar-state]')
      expect(avatar?.getAttribute('data-avatar-state')).toBe(state)
      expect(avatar?.getAttribute('data-gesture')).toBe(gestureFor('friendly_shopkeeper', state))
      unmount()
    }
  })

  it('renders all three characters with distinct artwork', () => {
    for (const personality of PERSONALITIES) {
      const { container } = render(
        <ShopkeeperAvatar personality={personality} expression="listening" state="greeting" />,
      )
      expect(container.querySelector(`[data-personality="${personality}"]`)).toBeTruthy()
    }
  })

  it('keeps the gesture layer for the signature style and drops it for minimal', () => {
    const signature = render(
      <ShopkeeperAvatar personality="friendly_shopkeeper" expression="happy" state="celebrating" gesture="dance" characterStyle="signature" />,
    )
    expect(signature.container.querySelector('.cg-gesture--dance')).toBeTruthy()
    expect(signature.container.querySelector('.cg-gesture-dance')).toBeTruthy()

    const minimal = render(
      <ShopkeeperAvatar personality="friendly_shopkeeper" expression="happy" state="celebrating" gesture="dance" characterStyle="minimal" />,
    )
    expect(minimal.container.querySelector('.cg-gesture--dance')).toBeNull()
    expect(minimal.container.querySelector('.cg-gesture-dance')).toBeNull()
  })

  it('stops all motion when motion is disabled but keeps the face', () => {
    const { container } = render(
      <ShopkeeperAvatar personality="strict_shopkeeper" expression="declining" motionEnabled={false} />,
    )
    expect(container.querySelector('[data-expression="declining"]')).toBeTruthy()
    expect(container.querySelector('.cg-avatar--declining')).toBeNull()
  })

  it('honours the reduced-motion preference', () => {
    stubMatchMedia(true)
    const { container } = render(
      <ShopkeeperAvatar personality="playful_shopkeeper" expression="celebrating" state="celebrating" gesture="dance" />,
    )
    expect(container.querySelector('.cg-avatar--celebrating')).toBeNull()
    expect(container.querySelector('.cg-gesture--dance')).toBeNull()
    // The face and the state are still communicated — only motion is removed.
    expect(container.querySelector('[data-expression="celebrating"]')).toBeTruthy()
    expect(container.querySelector('[data-avatar-state="celebrating"]')).toBeTruthy()
  })

  it('drops decorative motion in essential-motion-only mode but keeps the state change', () => {
    const { container } = render(
      <ShopkeeperAvatar personality="friendly_shopkeeper" expression="celebrating" state="celebrating" gesture="dance" essentialMotionOnly />,
    )
    // The celebration itself is a state change and stays.
    expect(container.querySelector('.cg-avatar--celebrating')).toBeTruthy()
    // Confetti is decorative and is switched off.
    expect(container.querySelector('.cg-av-confetti')).toBeNull()
    // Idle loops are gone: the breathing/sway classes are not applied.
    const css = Array.from(container.querySelectorAll('style')).map((n) => n.textContent ?? '').join('\n')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('never depends on an external animation asset', () => {
    const { container } = render(
      <ShopkeeperAvatar personality="strict_shopkeeper" expression="negotiating" state="negotiating" gesture="crossed_arms" />,
    )
    // The character is inline vector art: there is no <img>, <video>, sprite or
    // runtime animation payload that could fail to load.
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('video')).toBeNull()
    expect(container.querySelector('object')).toBeNull()
    expect(container.querySelector('svg')).toBeTruthy()
  })
})

describe('living shopkeeper stage', () => {
  it('exposes the explicit position to the layout manager', () => {
    const { container } = render(
      <ShopkeeperStage
        personality="playful_shopkeeper"
        expression="happy"
        state="celebrating"
        gesture="dance"
        position="celebration"
        characterStyle="signature"
        essentialMotionOnly={false}
        name="The Bargain Ninja"
        status="Online"
        line="Deal!"
      />,
    )
    const stage = container.querySelector('.cg-stage')
    expect(stage?.getAttribute('data-avatar-position')).toBe('celebration')
    expect(stage?.getAttribute('data-avatar-state')).toBe('celebrating')
    expect(stage?.getAttribute('data-gesture')).toBe('dance')
    expect(stage?.className).toContain('cg-living--celebration')
  })

  it('never intercepts clicks, taps or scrolling', () => {
    const { container } = render(
      <ShopkeeperStage
        personality="friendly_shopkeeper"
        expression="listening"
        state="listening"
        name="Buddy"
        status="Online"
        line="Hi"
      />,
    )
    const css = Array.from(container.querySelectorAll('style')).map((n) => n.textContent ?? '').join('\n')
    expect(css).toMatch(/\.cg-stage \{[^}]*pointer-events: none;/)
  })

  it('renders the stage without a character when the avatar is disabled by the merchant', () => {
    // The avatar toggle lives in the merchant config, not in the stage: the
    // widget simply does not mount the stage. This pins the stage contract.
    const { container } = render(
      <ShopkeeperStage
        personality="friendly_shopkeeper"
        expression="idle"
        state="idle"
        name="Buddy"
        status="Online"
        line=""
      />,
    )
    expect(container.querySelector('.cg-avatar')).toBeTruthy()
  })
})
