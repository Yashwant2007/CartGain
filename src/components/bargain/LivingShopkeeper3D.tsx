'use client'

/**
 * LivingShopkeeper3D
 *
 * A skeletal 3D shopkeeper rendered with Three.js inside the bargain chat.
 * Loaded lazily (ssr: false) so three.js never blocks the storefront shell.
 *
 * The component owns a contained, transparent WebGL canvas. It builds the real
 * rig + skinned meshes from `character3d/build`, plays authored skeletal clips
 * from `character3d/clips` through an AnimationMixer, and is driven only by the
 * conversation state it receives. Presentation only — it never reads or
 * changes pricing.
 */

import { useEffect, useRef } from 'react'
import {
  AnimationAction,
  AnimationMixer,
  DirectionalLight,
  HemisphereLight,
  LoopOnce,
  LoopRepeat,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three'
import type { ShopkeeperPersonality } from '@/lib/bargain/experience/types'
import { characterSpecFor } from '@/lib/bargain/character3d/specs'
import { buildCharacter } from '@/lib/bargain/character3d/build'
import { buildClipLibrary } from '@/lib/bargain/character3d/clips'
import { solveTwoBone, type Vec3 } from '@/lib/bargain/character3d/ik'
import { sanitizePlan } from '@/lib/bargain/character3d/machine'
import {
  buildFrameGeometry,
  stageGutterWidth,
  type FrameInput,
  type Rect,
} from '@/lib/bargain/character3d/frame'
import {
  qualitySettingsFor,
  type Character3DState,
  type CharacterQuality,
} from '@/lib/bargain/character3d/types'

export interface LivingShopkeeper3DProps {
  personality: ShopkeeperPersonality
  /** Current skeletal state from the conversation state machine. */
  state: Character3DState
  /** Optional conversation panel whose edges the character may grip. */
  frameRef?: React.RefObject<HTMLElement | null> | null
  /** Elements the character must never overlap. Only used with `frameRef`. */
  forbiddenRefs?: (React.RefObject<HTMLElement | null> | null)[]
  motionEnabled?: boolean
  essentialMotionOnly?: boolean
  quality?: CharacterQuality
  /** Square canvas edge in CSS pixels. Matches the 2D xl avatar (96px). */
  size?: number
  onStateChange?: (state: Character3DState) => void
  /** Called when WebGL is unavailable so the caller can fall back to 2D. */
  onUnavailable?: () => void
}

const LOOPING: readonly Character3DState[] = [
  'idle',
  'walk',
  'run',
  'listen',
  'think',
  'look_at_customer',
  'sit',
  'climb',
  'hang',
  'peek',
]
const FRAME_STATES: readonly Character3DState[] = ['sit', 'hang', 'peek', 'climb']
const FOV = 42

function looping(state: Character3DState): boolean {
  return LOOPING.includes(state)
}

export default function LivingShopkeeper3D(props: LivingShopkeeper3DProps) {
  const {
    personality,
    state,
    frameRef = null,
    forbiddenRefs = [],
    motionEnabled = true,
    essentialMotionOnly = false,
    quality = 'medium',
    size = 96,
    onStateChange,
    onUnavailable,
  } = props

  const enabled = motionEnabled && !essentialMotionOnly
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const controllerRef = useRef<{ play: (state: Character3DState) => void } | null>(null)
  const stateRef = useRef(state)
  const onStateChangeRef = useRef(onStateChange)
  const onUnavailableRef = useRef(onUnavailable)

  stateRef.current = state
  onStateChangeRef.current = onStateChange
  onUnavailableRef.current = onUnavailable

  // ── Scene, rig and render loop ──────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    if (!canvas) return

    const settings = qualitySettingsFor(quality)
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({
        canvas,
        alpha: true,
        antialias: settings.antialias,
        premultipliedAlpha: false,
        powerPreference: 'low-power',
      })
    } catch {
      onUnavailableRef.current?.()
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.maxPixelRatio))
    renderer.setSize(size, size, false)
    renderer.setClearColor(0x000000, 0)

    const scene = new Scene()
    const camera = new PerspectiveCamera(FOV, 1, 0.01, 50)
    const spec = characterSpecFor(personality)
    const character = buildCharacter(spec)
    const { group, bones, height, dispose } = character
    scene.add(group)

    const target = new Vector3(0, height * 0.52, 0)
    const fit = height * 1.16
    const distance = fit / (2 * Math.tan((FOV * Math.PI) / 180 / 2))
    camera.position.set(0, target.y + height * 0.04, distance)
    camera.lookAt(target)

    const hemi = new HemisphereLight(0xffffff, 0xdfe6f0, 1.1)
    hemi.position.set(0, 3, 2)
    scene.add(hemi)
    const key = new DirectionalLight(0xffffff, 1.4)
    key.position.set(2, 3.5, 3)
    scene.add(key)
    const rim = new DirectionalLight(0x93a4ff, 0.55)
    rim.position.set(-2, 2, -2)
    scene.add(rim)

    const clips = buildClipLibrary(height)
    const mixer = new AnimationMixer(group)
    const actions = new Map<Character3DState, AnimationAction>()
    let current: Character3DState = 'idle'
    let disposed = false

    const play = (requested: Character3DState): void => {
      if (disposed) return
      const frameReady = Boolean(frameRef?.current)
      const [next] = sanitizePlan(personality, [requested], { frameReady })
      if (!next) return
      const clip = clips[next]
      if (!clip) return
      let action = actions.get(next)
      if (!action) {
        action = mixer.clipAction(clip)
        actions.set(next, action)
      }
      const active = action
      const previous = actions.get(current)
      active.reset()
      active.clampWhenFinished = !looping(next)
      active.loop = looping(next) ? LoopRepeat : LoopOnce
      active.enabled = true
      if (previous && previous !== active) {
        previous.fadeOut(0.18)
        active.fadeIn(0.18)
      }
      active.play()
      current = next
      onStateChangeRef.current?.(next)
    }

    const onFinished = (): void => {
      if (!looping(current)) play('idle')
    }
    mixer.addEventListener('finished', onFinished)

    const restDir = new Vector3(0, -1, 0)
    const upperArmLen = height * 0.175
    const forearmLen = height * 0.155

    const aimBone = (bone: Object3D, dir: Vec3, parentWorldQuat: Quaternion): void => {
      const desired = new Quaternion().setFromUnitVectors(
        restDir,
        new Vector3(dir.x, dir.y, dir.z).normalize(),
      )
      bone.quaternion.copy(parentWorldQuat.clone().invert().multiply(desired))
    }

    const applyArmIk = (side: 'L' | 'R', handTarget: { x: number; y: number; z: number }): void => {
      const shoulder = bones[`shoulder${side}`]
      const upperArm = bones[`upperArm${side}`]
      const forearm = bones[`forearm${side}`]
      if (!shoulder || !upperArm || !forearm) return
      const root = new Vector3()
      shoulder.getWorldPosition(root)
      const parentWorldQuat = new Quaternion()
      shoulder.getWorldQuaternion(parentWorldQuat)
      const pole = { x: root.x, y: root.y, z: root.z - 0.6 }
      const solved = solveTwoBone(
        root,
        new Vector3(handTarget.x, handTarget.y, handTarget.z),
        upperArmLen,
        forearmLen,
        pole,
      )
      aimBone(upperArm, solved.upperDir, parentWorldQuat)
      const forearmWorldQuat = new Quaternion()
      upperArm.getWorldQuaternion(forearmWorldQuat)
      aimBone(forearm, solved.lowerDir, forearmWorldQuat)
    }

    const frameTargets = (): FrameInput | null => {
      const chat = frameRef?.current
      if (!chat) return null
      const rect = chat.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      const forbidden: Rect[] = []
      for (const ref of forbiddenRefs) {
        const el = ref?.current
        if (!el) continue
        const r = el.getBoundingClientRect()
        forbidden.push({ x: r.left, y: r.top, width: r.width, height: r.height })
      }
      return {
        chat: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        stage: {
          x: rect.right,
          y: rect.top,
          width: stageGutterWidth(rect.width, true),
          height: rect.height,
        },
        characterHeight: 96,
        characterWidth: 48,
        forbidden,
      }
    }

    const applyFrameIk = (): void => {
      if (!frameRef?.current || !FRAME_STATES.includes(current)) return
      const targets = frameTargets()
      if (!targets) return
      const geometry = buildFrameGeometry(targets)
      const toWorld = (p: { x: number; y: number }): Vec3 => ({
        x: (p.x - (window.innerWidth / 2)) / 220,
        y: -(p.y - (window.innerHeight / 2)) / 220,
        z: 0,
      })
      const hands =
        current === 'hang'
          ? { left: geometry.gripTopLeft, right: geometry.gripTopRight }
          : current === 'climb'
            ? { left: geometry.gripSideLeft, right: geometry.gripSideRight }
            : { left: geometry.seat, right: geometry.seat }
      applyArmIk('L', toWorld(hands.left))
      applyArmIk('R', toWorld(hands.right))
    }

    play(stateRef.current)

    let raf = 0
    let last = 0
    const frameInterval = 1000 / settings.fps

    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick)
      if (now - last < frameInterval) return
      const delta = last === 0 ? 0.016 : Math.min((now - last) / 1000, 0.05)
      last = now
      applyFrameIk()
      mixer.update(delta)
      renderer.render(scene, camera)
    }

    const onResize = (): void => {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.maxPixelRatio))
      renderer.setSize(size, size, false)
    }

    const onVisibility = (): void => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else if (!raf && !disposed) {
        last = 0
        raf = requestAnimationFrame(tick)
      }
    }

    controllerRef.current = { play }
    raf = requestAnimationFrame(tick)
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      mixer.removeEventListener('finished', onFinished)
      mixer.stopAllAction()
      actions.clear()
      controllerRef.current = null
      dispose()
      renderer.dispose()
    }
  }, [enabled, personality, quality, size, frameRef, forbiddenRefs])

  // ── Conversation events drive the mixer, never a timer ─────────────────
  useEffect(() => {
    if (!enabled) return
    controllerRef.current?.play(state)
  }, [enabled, state])

  if (!enabled) return null

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      aria-hidden="true"
      data-shopkeeper-3d="true"
      style={{
        display: 'block',
        width: `${size}px`,
        height: `${size}px`,
        background: 'transparent',
        pointerEvents: 'none',
      }}
    />
  )
}
