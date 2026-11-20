/**
 * @jest-environment jsdom
 */
import { describe, expect, it, beforeEach } from '@jest/globals'
import { render } from '@testing-library/react'
import { AnimationClip, Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, QuaternionKeyframeTrack, Vector3 } from 'three'
import { ShopkeeperAvatar } from '@/components/bargain/ShopkeeperAvatar'
import ShopkeeperStage from '@/components/bargain/ShopkeeperStage'
import { AVATAR_STATES } from '@/lib/bargain/experience/avatar-state'
import { gestureFor } from '@/lib/bargain/experience/character'
import type { ShopkeeperPersonality } from '@/lib/bargain/experience/types'
import { applyRobotPersonality, buildProceduralRobot, customClips, fitRobotToStage, prepareAssetClips } from '@/components/bargain/LivingShopkeeper3D'

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
  it('keeps a complete procedural robot available as an explicitly marked development fallback', () => {
    const robot = buildProceduralRobot('friendly_shopkeeper')
    const names = new Set<string>()
    let meshCount = 0
    robot.traverse((node) => {
      names.add(node.name)
      if ((node as { isMesh?: boolean }).isMesh) meshCount++
    })
    expect(robot.name).toBe('CartGainRobotRig')
    expect(meshCount).toBeGreaterThan(35)
    for (const part of ['Head', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'AntennaTip', 'LeftHandIndex1', 'RightHandThumb1']) {
      expect(names.has(part)).toBe(true)
    }
    const clips = customClips(robot, 'playful_shopkeeper')
    expect(clips.has('greet')).toBe(true)
    expect(clips.has('walk')).toBe(true)
    expect(clips.has('think')).toBe(true)
    expect(clips.has('climb')).toBe(true)
    expect(clips.has('hang')).toBe(true)
    expect((clips.get('greet')?.tracks.length ?? 0)).toBeGreaterThan(0)
  })

  it('gives each personality a distinct visual signature and idle posture', () => {
    const friendly = buildProceduralRobot('friendly_shopkeeper')
    const strict = buildProceduralRobot('strict_shopkeeper')
    const playful = buildProceduralRobot('playful_shopkeeper')
    const namesFor = (robot: ReturnType<typeof buildProceduralRobot>) => {
      const names: string[] = []
      robot.traverse((node) => names.push(node.name))
      return names
    }
    expect(namesFor(friendly)).toContain('PartnerCollar')
    expect(namesFor(friendly)).toContain('LeftCheekLight')
    expect(namesFor(strict)).toContain('ProfessionalPlacket')
    expect(namesFor(strict)).toContain('LeftPrecisionBrow')
    expect(namesFor(playful)).toContain('LeftAudioFin')
    expect(namesFor(playful)).toContain('SideAntennaTip')
    const idleValues = (robot: ReturnType<typeof buildProceduralRobot>, persona: ShopkeeperPersonality) =>
      customClips(robot, persona).get('idle')?.tracks.map((track) => Array.from(track.values))
    expect(idleValues(friendly, 'friendly_shopkeeper')).not.toEqual(idleValues(strict, 'strict_shopkeeper'))
    expect(idleValues(playful, 'playful_shopkeeper')).not.toEqual(idleValues(strict, 'strict_shopkeeper'))
  })

  it('adapts documented GLB clip names to the planner without changing its states', () => {
    const root = new Group()
    const head = new Object3D()
    head.name = 'Head'
    root.add(head)
    const talk = new AnimationClip('talk', 1, [
      new QuaternionKeyframeTrack('Head.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.1, 0, 0.995]),
    ])
    const goodbye = new AnimationClip('goodbye', 0.8, [
      new QuaternionKeyframeTrack('Head.quaternion', [0, 0.8], [0, 0, 0, 1, 0.1, 0, 0, 0.995]),
    ])
    const clips = prepareAssetClips(root, [talk, goodbye])
    expect(clips.get('talk')?.name).toBe('talk')
    expect(clips.get('goodbye')?.name).toBe('goodbye')
    expect(clips.get('talk')?.tracks).toHaveLength(1)
  })

  it('maps the supplied robot clip names to real conversation states', () => {
    const root = new Group()
    for (const name of ['Hips', 'Head', 'UpperArm_R', 'LowerArm_R', 'Hand_R']) {
      const node = new Object3D()
      node.name = name
      root.add(node)
    }
    const track = (clip: string) => new AnimationClip(clip, 1, [
      new QuaternionKeyframeTrack('Hips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.1, 0, 0.995]),
    ])
    const clips = prepareAssetClips(root, [
      'Idle_Breathing', 'Enter', 'Shift_Position', 'Look_At_Customer', 'Talk', 'Listen', 'Think',
      'Point', 'Open_Hand', 'Wave', 'Surprised', 'Disappointed', 'Smile', 'Celebrate', 'Goodbye', 'Hang', 'Climb',
    ].map(track))
    for (const state of ['idle', 'enter', 'walk', 'look_at_customer', 'talk', 'listen', 'think', 'point', 'explain', 'wave', 'surprised', 'disappointed', 'smile', 'celebrate', 'goodbye', 'hang', 'climb'] as const) {
      expect(clips.has(state)).toBe(true)
    }
    expect(clips.get('walk')?.name).toBe('walk')
    expect(clips.get('explain')?.name).toBe('explain')
  })

  it('fits the rig to the stage and applies personality accents without creating separate models', () => {
    const root = new Group()
    const sourceMaterial = new MeshStandardMaterial({ color: 0xffffff })
    sourceMaterial.name = 'CG_Accents'
    root.add(new Mesh(new BoxGeometry(1, 1, 1), sourceMaterial))
    fitRobotToStage(root)
    const bounds = new Box3().setFromObject(root)
    expect(bounds.getSize(new Vector3()).y).toBeCloseTo(1.78, 2)
    expect(bounds.min.y).toBeCloseTo(0, 5)
    applyRobotPersonality(root, 'friendly_shopkeeper')
    const mesh = root.children[0] as Mesh
    expect((mesh.material as MeshStandardMaterial).color.getHex()).toBe(0x13a99a)
    expect(sourceMaterial.color.getHex()).toBe(0xffffff)
  })

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

  it('does not substitute a flat character when the 3D stage is not enabled', () => {
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
    expect(container.querySelector('.cg-avatar, .cg-sa')).toBeNull()
    expect(container.querySelector('.cg-stage')?.getAttribute('data-avatar-renderer')).toBe('disabled')
  })

  it('renders a merchant-selected v2 shopkeeper sprite', () => {
    const { container } = render(
      <ShopkeeperStage
        personality="friendly_shopkeeper"
        expression="negotiating"
        state="negotiating"
        avatarVariant="morgan"
        name="Morgan"
        status="Online"
        line=""
      />,
    )
    expect(container.querySelector('.cg-stage')?.getAttribute('data-avatar-renderer')).toBe('v2-sprite')
    expect(container.querySelector('.cg-stage')?.getAttribute('data-avatar-variant')).toBe('morgan')
    expect(container.querySelector('.cg-v2')?.getAttribute('data-v2-cell')).toBe('countering')
    expect(container.querySelector('.cg-v2-art')?.getAttribute('style')).toContain('morgan-expressions.png')
    const css = Array.from(container.querySelectorAll('style')).map((node) => node.textContent ?? '').join('\n')
    expect(css).toMatch(/\.cg-v2 \{[^}]*height: 194px;/)
    expect(css).toMatch(/\.cg-v2-art \{[^}]*border-radius: 50%; clip-path: ellipse\(50% 50% at 50% 50%\)/)
  })
})
