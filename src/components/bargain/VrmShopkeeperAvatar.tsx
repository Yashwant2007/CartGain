'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type * as Three from 'three'
import type { AvatarState } from '@/lib/bargain/experience/avatar-state'
import type { ExpressionState } from '@/lib/bargain/experience/expressions'
import {
  VRM_AVATARS,
  isVrmAvatarVariant,
  vrmClipForState,
  vrmPresetForExpression,
  type VrmAvatarVariant,
  type VrmPreset,
} from '@/lib/bargain/experience/vrm-shopkeepers'
import { REACTION_EXPRESSION, REACTION_MOTION, REACTION_STATE, type BargainReaction } from '@/lib/bargain/experience/reactions'

interface Props {
  variant: VrmAvatarVariant | string
  expression: ExpressionState
  state?: AvatarState
  reaction?: BargainReaction | null
  eventSequence?: number
  motionEnabled?: boolean
  essentialMotionOnly?: boolean
}

interface MorphBinding {
  mesh: Three.Mesh
  index: number
  weight: number
}

interface Runtime {
  mixer: Three.AnimationMixer
  renderer: Three.WebGLRenderer
  clips: Map<string, Three.AnimationClip>
  binds: Map<VrmPreset, MorphBinding[]>
  current: Map<string, number>
  active: Three.AnimationAction | null
  activeKey: string
  loopRepeat: Three.AnimationActionLoopStyles
  loopOnce: Three.AnimationActionLoopStyles
}

const VRM_CSS = `
.cg-vrm { position: relative; width: 168px; height: 194px; flex-shrink: 0; pointer-events: none; }
.cg-vrm-glow { position: absolute; inset: 10px 6px 26px; border-radius: 50%; background: radial-gradient(ellipse at center, color-mix(in srgb, var(--cg-vrm-accent) 20%, transparent), transparent 70%); opacity: .7; }
.cg-vrm-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.cg-vrm-canvas canvas { display: block; width: 100% !important; height: 100% !important; }
.cg-vrm-fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; border-radius: 18px; background: radial-gradient(circle at 50% 35%, #ffffff, #eef2ff 70%, #e0e7ff); color: var(--cg-vrm-accent); font-size: 42px; font-weight: 700; }
@media (max-width: 480px) { .cg-vrm { width: 134px; height: 158px; } }
@media (prefers-reduced-motion: reduce) { .cg-vrm-glow { animation: none !important; } }
`

function keyForBinding(mesh: Three.Mesh, index: number): string {
  return `${mesh.uuid}:${index}`
}

export default function VrmShopkeeperAvatar({
  variant,
  expression: baseExpression,
  state: baseState,
  reaction = null,
  eventSequence,
  motionEnabled = true,
  essentialMotionOnly = false,
}: Props) {
  const resolved = isVrmAvatarVariant(variant) ? variant : 'meera'
  const meta = VRM_AVATARS[resolved]
  const expression = reaction && (!baseExpression || baseExpression === 'idle')
    ? REACTION_EXPRESSION[reaction]
    : baseExpression ?? 'idle'
  const state = reaction && (!baseState || baseState === 'idle')
    ? REACTION_STATE[reaction]
    : baseState
  const reactionMotion = reaction ? REACTION_MOTION[reaction] : null
  const hostRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<Runtime | null>(null)
  const desiredRef = useRef({
    expression: vrmPresetForExpression(expression),
    state: state ?? 'idle',
    eventSequence,
    motionEnabled,
    essentialMotionOnly,
    reducedMotion: false,
  })
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(query.matches)
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  function playDesiredAnimation() {
    const runtime = runtimeRef.current
    if (!runtime) return
    const desired = desiredRef.current
    const selection = vrmClipForState(desired.state)
    const staticPose = !desired.motionEnabled || desired.reducedMotion || (desired.essentialMotionOnly && selection.loop)
    const clipName = staticPose ? 'Idle_Breathing' : selection.name
    const clip = runtime.clips.get(clipName) ?? runtime.clips.get('Idle_Breathing')
    if (!clip) return
    const loop = staticPose || selection.loop
    const key = `${clipName}:${loop ? 'loop' : desired.eventSequence ?? 0}`
    if (runtime.active && runtime.activeKey === key && !staticPose) return
    runtime.mixer.stopAllAction()
    const action = runtime.mixer.clipAction(clip)
    action.reset()
    action.setLoop(loop ? runtime.loopRepeat : runtime.loopOnce, loop ? Infinity : 1)
    action.clampWhenFinished = !loop
    action.fadeIn(0.18).play()
    if (staticPose) {
      runtime.mixer.update(0)
      action.paused = true
    }
    runtime.active = action
    runtime.activeKey = key
  }

  useEffect(() => {
    let cancelled = false
    let frame = 0
    let resize: (() => void) | null = null
    let resizeObserver: ResizeObserver | null = null

    async function mount() {
      const THREE = await import('three')
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      if (cancelled || !hostRef.current) return

      const loader = new GLTFLoader()
      const [model, animationData] = await Promise.all([
        loader.loadAsync(meta.modelUrl),
        loader.loadAsync(meta.clipUrl),
      ])
      if (cancelled || !hostRef.current) return

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setClearColor(0x000000, 0)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.domElement.className = 'cg-vrm-canvas'
      renderer.domElement.setAttribute('aria-hidden', 'true')
      hostRef.current.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 20)
      camera.position.set(0, 1.28, 2.4)
      camera.lookAt(0, 1.22, 0)
      scene.add(new THREE.HemisphereLight(0xffffff, 0xb7c7e8, 2.1))
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.4)
      keyLight.position.set(2.5, 4, 3)
      scene.add(keyLight)
      const rimLight = new THREE.DirectionalLight(0xbfdbfe, 1.2)
      rimLight.position.set(-2.5, 2.2, -2.5)
      scene.add(rimLight)

      const root = new THREE.Group()
      root.add(model.scene)
      scene.add(root)

      const parser = model.parser as unknown as {
        associations?: Map<Three.Object3D, { nodes?: number; meshes?: number }>
        json?: {
          nodes?: Array<{ mesh?: number }>
          extensions?: { VRMC_vrm?: { expressions?: { preset?: Record<string, unknown> } } }
        }
      }
      const nodeMeshes = new Map<number, number>()
      const gltfNodes = parser.json?.nodes ?? []
      gltfNodes.forEach((node, index) => {
        if (typeof node.mesh === 'number') nodeMeshes.set(index, node.mesh)
      })
      const meshObjects = new Map<number, Three.Mesh[]>()
      model.scene.traverse(object => {
        const association = parser.associations?.get(object)
        const mesh = object as Three.Mesh
        if (association?.meshes === undefined || !mesh.morphTargetInfluences) return
        const existing = meshObjects.get(association.meshes) ?? []
        existing.push(mesh)
        meshObjects.set(association.meshes, existing)
      })

      const binds = new Map<VrmPreset, MorphBinding[]>()
      const presets = parser.json?.extensions?.VRMC_vrm?.expressions?.preset ?? {}
      const supported = ['neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised', 'blink']
      for (const [presetName, rawPreset] of Object.entries(presets)) {
        if (!supported.includes(presetName)) continue
        const preset = rawPreset as { morphTargetBinds?: Array<{ node: number; index: number; weight: number }> }
        const entries: MorphBinding[] = []
        for (const binding of preset.morphTargetBinds ?? []) {
          const meshIndex = nodeMeshes.get(binding.node)
          const meshes = meshIndex === undefined ? [] : meshObjects.get(meshIndex) ?? []
          for (const mesh of meshes) {
            if (!mesh.morphTargetInfluences || binding.index >= mesh.morphTargetInfluences.length) continue
            entries.push({ mesh, index: binding.index, weight: binding.weight ?? 1 })
          }
        }
        binds.set(presetName as VrmPreset, entries)
      }

      const clips = new Map<string, Three.AnimationClip>()
      for (const clip of animationData.animations) {
        const tracks = clip.tracks.filter(track => !track.name.includes('morphTargetInfluences'))
        clips.set(clip.name, new THREE.AnimationClip(clip.name, clip.duration, tracks))
      }
      const runtime: Runtime = {
        mixer: new THREE.AnimationMixer(model.scene),
        renderer,
        clips,
        binds,
        current: new Map(),
        active: null,
        activeKey: '',
        loopRepeat: THREE.LoopRepeat,
        loopOnce: THREE.LoopOnce,
      }
      runtimeRef.current = runtime

      resize = () => {
        const host = hostRef.current
        if (!host) return
        const width = Math.max(1, host.clientWidth || 168)
        const height = Math.max(1, host.clientHeight || 194)
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
      }
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(hostRef.current)
      }
      window.addEventListener('resize', resize, { passive: true })
      resize()

      const clock = new THREE.Clock()
      const targets = new Map<string, { mesh: Three.Mesh; index: number; value: number }>()
      const draw = () => {
        frame = requestAnimationFrame(draw)
        const delta = Math.min(clock.getDelta(), 0.05)
        const desired = desiredRef.current
        targets.clear()
        for (const [preset, entries] of Array.from(binds.entries())) {
          const targetValue = preset === desired.expression ? 1 : 0
          for (const entry of entries) {
            const id = keyForBinding(entry.mesh, entry.index)
            const value = entry.weight * targetValue
            const existing = targets.get(id)
            if (existing) existing.value += value
            else targets.set(id, { mesh: entry.mesh, index: entry.index, value })
          }
        }
        const blend = 1 - Math.pow(0.001, delta)
        for (const [id, target] of Array.from(targets.entries())) {
          const previous = runtime.current.get(id) ?? 0
          const next = previous + (target.value - previous) * blend
          runtime.current.set(id, next)
          target.mesh.morphTargetInfluences![target.index] = next
        }
        runtime.mixer.update(delta)
        renderer.render(scene, camera)
      }
      draw()
      setStatus('ready')
      playDesiredAnimation()
    }

    mount().catch(() => {
      if (!cancelled) setStatus('error')
    })

    return () => {
      cancelled = true
      if (resize) window.removeEventListener('resize', resize)
      resizeObserver?.disconnect()
      cancelAnimationFrame(frame)
      const runtime = runtimeRef.current
      runtime?.mixer.stopAllAction()
      runtime?.renderer.dispose()
      runtime?.renderer.forceContextLoss()
      runtime?.renderer.domElement.remove()
      runtimeRef.current = null
    }
  }, [meta])

  useEffect(() => {
    desiredRef.current = {
      expression: vrmPresetForExpression(expression),
      state: state ?? 'idle',
      eventSequence,
      motionEnabled,
      essentialMotionOnly,
      reducedMotion,
    }
    playDesiredAnimation()
  }, [expression, state, eventSequence, motionEnabled, essentialMotionOnly, reducedMotion])

  return (
    <div
      ref={hostRef}
      className={`cg-vrm cg-vrm--${meta.motion}`}
      role="img"
      aria-label={`${meta.name}, ${meta.role}, ${reaction ? `${reaction.replace('_', ' ')} reaction` : `${expression} expression`}`}
      data-vrm-variant={resolved}
      data-vrm-state={state ?? 'idle'}
      data-vrm-expression={expression}
      data-vrm-reaction={reaction ?? ''}
      data-vrm-reaction-motion={reactionMotion ?? ''}
      data-vrm-status={status}
      style={{ '--cg-vrm-accent': meta.accent } as CSSProperties}
    >
      <style dangerouslySetInnerHTML={{ __html: VRM_CSS }} />
      <span className="cg-vrm-glow" aria-hidden="true" />
      {status === 'ready' ? null : <span className="cg-vrm-fallback" aria-hidden="true">{meta.initials}</span>}
    </div>
  )
}
