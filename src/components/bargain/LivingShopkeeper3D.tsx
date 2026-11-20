'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  AnimationClip,
  AnimationMixer,
  Box3,
  BoxGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
  type AnimationAction,
  type Object3D,
} from 'three'
import type { ShopkeeperPersonality } from '@/lib/bargain/experience/types'
import type { Character3DState, CharacterQuality } from '@/lib/bargain/character3d/types'
import { qualitySettingsFor } from '@/lib/bargain/character3d/types'
import { buildClipLibrary } from '@/lib/bargain/character3d/clips'
import type { LivingEvent, LivingEventContext } from '@/lib/bargain/experience/avatar-state'
import { planForEvent, sanitizePlan } from '@/lib/bargain/character3d/machine'
import { buildFrameGeometry, overlapsForbidden, pixelsToWorld, type Rect } from '@/lib/bargain/character3d/frame'
import { solveTwoBone, vec } from '@/lib/bargain/character3d/ik'

export interface LivingShopkeeper3DProps {
  personality: ShopkeeperPersonality
  state: Character3DState
  event?: LivingEvent
  eventSequence?: number
  eventContext?: LivingEventContext
  frameRef?: React.RefObject<HTMLElement | null> | null
  spatialTarget?: { left: number; top: number; right: number; bottom: number; x: number; y: number; width: number; height: number } | null
  forbiddenRefs?: (React.RefObject<HTMLElement | null> | null)[]
  motionEnabled?: boolean
  essentialMotionOnly?: boolean
  quality?: CharacterQuality
  size?: number
  onStateChange?: (state: Character3DState) => void
  onUnavailable?: () => void
}

type Offset = readonly [number, number, number]

export function buildProceduralRobot(personality: ShopkeeperPersonality) {
  const root = new Group()
  root.name = 'CartGainRobotRig'
  const friendly = personality === 'friendly_shopkeeper'
  const strict = personality === 'strict_shopkeeper'
  const playful = personality === 'playful_shopkeeper'
  const accent = friendly ? 0x39bba9 : strict ? 0x438ce0 : 0xff7954
  const shell = new MeshPhysicalMaterial({ color: friendly ? 0xfffcf7 : 0xf3f7fb, metalness: strict ? 0.32 : 0.2, roughness: strict ? 0.22 : 0.28, clearcoat: 0.85, clearcoatRoughness: 0.16 })
  const joint = new MeshPhysicalMaterial({ color: strict ? 0xb8c6d6 : 0xcbd5df, metalness: 0.48, roughness: 0.28 })
  const accentMat = new MeshPhysicalMaterial({ color: accent, metalness: 0.3, roughness: 0.2, emissive: accent, emissiveIntensity: 0.24, clearcoat: 0.8 })
  const dark = new MeshPhysicalMaterial({ color: 0x082431, metalness: 0.15, roughness: 0.16, clearcoat: 1 })
  const glow = new MeshBasicMaterial({ color: friendly ? 0x72fff2 : strict ? 0x8ec5ff : 0xffd16f })
  const legMat = new MeshPhysicalMaterial({ color: 0xdce5ec, metalness: 0.35, roughness: 0.3 })
  const sphere = (parent: Group, name: string, scale: Offset, pos: Offset, material: MeshPhysicalMaterial | MeshBasicMaterial) => {
    const mesh = new Mesh(new SphereGeometry(1, 32, 24), material)
    mesh.name = name; mesh.scale.set(...scale); mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh
  }
  const capsule = (parent: Group, name: string, radius: number, length: number, pos: Offset, material = shell) => {
    const mesh = new Mesh(new CapsuleGeometry(radius, length, 8, 18), material)
    mesh.name = name; mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh
  }
  const link = (parent: Group, name: string, a: Vector3, b: Vector3, radius: number, material: MeshPhysicalMaterial) => {
    const direction = b.clone().sub(a)
    const mesh = new Mesh(new CylinderGeometry(radius * 0.72, radius, direction.length(), 16), material)
    mesh.name = name; mesh.position.copy(a).add(b).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()); parent.add(mesh); return mesh
  }

  const hips = new Group(); hips.name = 'Hips'; hips.position.y = 0.91; root.add(hips)
  sphere(hips, 'PelvisShell', [0.23, 0.17, 0.18], [0, 0, 0], joint)
  const spine = new Group(); spine.name = 'Spine'; spine.position.y = 0.08; hips.add(spine)
  capsule(spine, 'Waist', 0.18, 0.14, [0, 0.09, 0], joint)
  const chest = new Group(); chest.name = 'Spine02'; chest.position.y = 0.22; spine.add(chest)
  capsule(chest, 'ArmoredTorso', strict ? 0.255 : playful ? 0.29 : 0.275, strict ? 0.26 : 0.2, [0, 0.12, 0], shell)
  sphere(chest, 'ChestBadge', [0.13, 0.055, 0.025], [0, 0.12, 0.251], accentMat)
  sphere(chest, 'Collar', [0.18, 0.045, 0.12], [0, 0.31, 0], joint)
  if (friendly) {
    const softCollar = new Mesh(new TorusGeometry(0.14, 0.025, 10, 32), accentMat)
    softCollar.name = 'PartnerCollar'; softCollar.rotation.x = Math.PI / 2; softCollar.position.set(0, 0.31, 0.015); chest.add(softCollar)
    sphere(chest, 'PartnerHeart', [0.038, 0.032, 0.018], [0, 0.12, 0.278], new MeshBasicMaterial({ color: 0xffc58f }))
  }
  if (strict) {
    const placket = new Mesh(new BoxGeometry(0.052, 0.2, 0.028), accentMat)
    placket.name = 'ProfessionalPlacket'; placket.position.set(0, 0.105, 0.255); chest.add(placket)
    for (const side of [-1, 1]) {
      const pad = new Mesh(new OctahedronGeometry(0.12, 1), joint)
      pad.name = side < 0 ? 'LeftShoulderEpaulet' : 'RightShoulderEpaulet'
      pad.scale.set(1.05, 0.72, 0.72); pad.position.set(side * 0.29, 0.27, 0); chest.add(pad)
    }
  }
  if (playful) {
    sphere(chest, 'PlayfulChestOrb', [0.065, 0.065, 0.035], [0.12, 0.12, 0.255], new MeshBasicMaterial({ color: 0xffbd55 }))
    sphere(chest, 'PlayfulShoulderBadge', [0.075, 0.075, 0.03], [-0.27, 0.24, 0.01], accentMat)
  }
  const neck = new Group(); neck.name = 'Neck'; neck.position.y = 0.32; chest.add(neck)
  capsule(neck, 'NeckJoint', 0.085, 0.08, [0, 0.02, 0], joint)
  const head = new Group(); head.name = 'Head'; head.position.y = 0.09; neck.add(head)
  sphere(head, 'HeadShell', playful ? [0.305, 0.28, 0.245] : strict ? [0.27, 0.25, 0.23] : [0.29, 0.27, 0.24], [0, 0.13, 0], shell)
  sphere(head, 'FacePanel', [0.222, 0.16, 0.075], [0, 0.125, 0.194], dark)
  const eyeScale = playful ? 1.16 : strict ? 0.9 : 1
  const leftEye = sphere(head, 'LeftEye', [0.046 * eyeScale, 0.061 * eyeScale, 0.025], [-0.084, 0.148, 0.259], glow)
  const rightEye = sphere(head, 'RightEye', [0.046 * eyeScale, 0.061 * eyeScale, 0.025], [0.084, 0.148, 0.259], glow)
  sphere(head, 'EyeGlintL', [0.012, 0.018, 0.01], [-0.096, 0.17, 0.282], new MeshBasicMaterial({ color: 0xffffff }))
  sphere(head, 'EyeGlintR', [0.012, 0.018, 0.01], [0.072, 0.17, 0.282], new MeshBasicMaterial({ color: 0xffffff }))
  if (strict) {
    for (const side of [-1, 1]) {
      const brow = new Mesh(new CapsuleGeometry(0.012, 0.06, 5, 10), accentMat)
      brow.name = side < 0 ? 'LeftPrecisionBrow' : 'RightPrecisionBrow'
      brow.rotation.z = Math.PI / 2 + side * -0.12; brow.position.set(side * 0.084, 0.224, 0.27); head.add(brow)
    }
  }
  if (friendly) {
    sphere(head, 'LeftCheekLight', [0.022, 0.014, 0.01], [-0.155, 0.058, 0.261], new MeshBasicMaterial({ color: 0xffb27d }))
    sphere(head, 'RightCheekLight', [0.022, 0.014, 0.01], [0.155, 0.058, 0.261], new MeshBasicMaterial({ color: 0xffb27d }))
  }
  if (playful) {
    sphere(head, 'LeftAudioFin', [0.065, 0.1, 0.065], [-0.27, 0.12, 0], accentMat)
    sphere(head, 'RightAudioFin', [0.065, 0.1, 0.065], [0.27, 0.12, 0], joint)
    link(head, 'SideAntenna', new Vector3(-0.15, 0.35, 0), new Vector3(-0.2, 0.47, 0), 0.016, joint)
    sphere(head, 'SideAntennaTip', [0.048, 0.048, 0.048], [-0.2, 0.48, 0], new MeshBasicMaterial({ color: 0xffbd55 }))
  }
  const mouthCurve = strict
    ? new CatmullRomCurve3([new Vector3(-0.052, 0.054, 0.274), new Vector3(0, 0.052, 0.282), new Vector3(0.052, 0.054, 0.274)])
    : new CatmullRomCurve3([new Vector3(-0.07, 0.065, 0.267), new Vector3(-0.025, playful ? 0.035 : 0.047, 0.282), new Vector3(0.02, playful ? 0.035 : 0.047, 0.282), new Vector3(0.07, 0.065, 0.267)])
  const mouth = new Mesh(new TubeGeometry(mouthCurve, 16, 0.009, 8, false), accentMat); mouth.name = 'Smile'; head.add(mouth)
  link(head, 'AntennaStem', new Vector3(0, 0.37, 0), new Vector3(0.035, 0.47, 0), 0.018, joint)
  sphere(head, 'AntennaTip', playful ? [0.057, 0.057, 0.057] : [0.036, 0.036, 0.036], [0.035, 0.48, 0], accentMat)
  const arms: Group[] = []
  for (const side of [-1, 1]) {
    const isLeft = side < 0
    const upperName = isLeft ? 'LeftArm' : 'RightArm'
    const lowerName = isLeft ? 'LeftForeArm' : 'RightForeArm'
    const handName = isLeft ? 'LeftHand' : 'RightHand'
    const shoulder = new Group(); shoulder.name = upperName; shoulder.position.set(side * 0.29, 0.26, 0); chest.add(shoulder); arms.push(shoulder)
    sphere(shoulder, `${upperName}Shoulder`, [0.105, 0.105, 0.11], [0, 0, 0], joint)
    capsule(shoulder, `${upperName}Armor`, 0.083, 0.19, [0, -0.17, 0], shell)
    const elbow = new Group(); elbow.name = lowerName; elbow.position.y = -0.34; shoulder.add(elbow)
    sphere(elbow, `${lowerName}Joint`, [0.073, 0.073, 0.073], [0, 0, 0], joint)
    capsule(elbow, `${lowerName}Armor`, 0.071, 0.17, [0, -0.15, 0], shell)
    const hand = new Group(); hand.name = handName; hand.position.y = -0.31; elbow.add(hand)
    sphere(hand, `${handName}Palm`, [0.078, 0.07, 0.042], [0, -0.015, 0.01], joint)
    for (let finger = 0; finger < 4; finger++) {
      const x = (finger - 1.5) * 0.036
      capsule(hand, `${isLeft ? 'Left' : 'Right'}Hand${['Index', 'Middle', 'Ring', 'Pinky'][finger]}1`, 0.014, finger === 1 || finger === 2 ? 0.045 : 0.034, [x, -0.09, 0.014])
    }
    capsule(hand, `${isLeft ? 'Left' : 'Right'}HandThumb1`, 0.017, 0.035, [side * -0.08, -0.035, 0.01], shell).rotation.z = side * 0.58
  }
  for (const side of [-1, 1]) {
    const legName = side < 0 ? 'LeftUpLeg' : 'RightUpLeg'
    const kneeName = side < 0 ? 'LeftLeg' : 'RightLeg'
    const leg = new Group(); leg.name = legName; leg.position.set(side * 0.13, -0.08, 0); hips.add(leg)
    sphere(leg, `${legName}Hip`, [0.095, 0.1, 0.095], [0, 0, 0], joint)
    capsule(leg, `${legName}Armor`, 0.086, 0.22, [0, -0.2, 0], legMat)
    const knee = new Group(); knee.name = kneeName; knee.position.y = -0.37; leg.add(knee)
    sphere(knee, `${kneeName}Joint`, [0.082, 0.078, 0.082], [0, 0, 0], joint)
    capsule(knee, `${kneeName}Shin`, 0.075, 0.2, [0, -0.16, 0], legMat)
    sphere(knee, `${kneeName}Boot`, [0.105, 0.07, 0.16], [0, -0.31, 0.065], shell)
  }
  root.userData.face = { leftEye, rightEye, mouth, accentMat, glow, arms }
  return root
}

const RIG_TRACK_TARGETS: Record<string, string> = {
  hips: 'Hips', spine: 'Spine', chest: 'Spine02', neck: 'Neck', head: 'Head',
  upperArmL: 'LeftArm', upperArmR: 'RightArm', forearmL: 'LeftForeArm', forearmR: 'RightForeArm',
  handL: 'LeftHand', handR: 'RightHand', thighL: 'LeftUpLeg', thighR: 'RightUpLeg',
  shinL: 'LeftLeg', shinR: 'RightLeg',
}

const ASSET_CLIP_NAMES: Partial<Record<Character3DState, readonly string[]>> = {
  idle: ['idle', 'idle_breathing', 'breathing'],
  enter: ['enter', 'entering'], greet: ['greet', 'look_at_customer'], walk: ['walk', 'shift_position', 'shiftposition'], run: ['run', 'shift_position', 'shiftposition'],
  listen: ['listen'], talk: ['talk'], think: ['think'], look_at_customer: ['look_at_customer'],
  point: ['point'], smile: ['smile'], wave: ['wave', 'greet'], sit: ['sit'], climb: ['climb'],
  hang: ['hang'], peek: ['peek'], jump: ['jump'], celebrate: ['celebrate', 'celebration'],
  disappointed: ['disappointed'], surprised: ['surprised'], explain: ['explain', 'open_hand', 'talk'],
  guide: ['guide', 'point'], exit: ['exit', 'goodbye'], goodbye: ['goodbye', 'exit'],
}

/** Prepare a studio GLB's named clips without changing the event planner. */
export function prepareAssetClips(root: Object3D, assetClips: AnimationClip[]): Map<Character3DState, AnimationClip> {
  const nodes = new Set<string>()
  root.traverse((node) => { if (node.name) nodes.add(node.name) })
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
  const byName = new Map(assetClips.map((clip) => [normalize(clip.name), clip]))
  const result = new Map<Character3DState, AnimationClip>()
  for (const [state, aliases] of Object.entries(ASSET_CLIP_NAMES) as [Character3DState, readonly string[]][]) {
    const source = aliases.map((name) => byName.get(normalize(name))).find(Boolean)
    if (!source) continue
    const tracks = source.tracks.filter((track) => {
      const nodeName = track.name.split('.')[0].split('/').pop() ?? ''
      return nodes.has(nodeName)
    }).map((track) => track.clone())
    if (tracks.length) result.set(state, new AnimationClip(state, source.duration, tracks))
  }
  return result
}

const PERSONALITY_ACCENTS: Record<ShopkeeperPersonality, number> = {
  friendly_shopkeeper: 0x13a99a,
  strict_shopkeeper: 0x3978c5,
  playful_shopkeeper: 0xf0784f,
}

/** Keep a single GLB while giving each merchant persona its own finish. */
export function applyRobotPersonality(root: Object3D, personality: ShopkeeperPersonality): void {
  const accent = PERSONALITY_ACCENTS[personality]
  const materials = new Map<object, MeshStandardMaterial>()
  root.traverse((node) => {
    const mesh = node as Mesh
    if (!mesh.material) return
    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const personalized = sourceMaterials.map((source) => {
      let material = materials.get(source)
      if (!material) {
        material = source.clone() as MeshStandardMaterial
        if (material.name === 'CG_Accents') material.color.setHex(accent)
        if (material.name === 'CG_FaceGlow') {
          material.color.setHex(accent)
          if (material.emissive) material.emissive.setHex(accent)
          material.emissiveIntensity = Math.max(material.emissiveIntensity, 1.35)
        }
        materials.set(source, material)
      }
      return material
    })
    mesh.material = Array.isArray(mesh.material) ? personalized : personalized[0]
  })
}

/** Fit the supplied authoring rig to the stage's predictable metre scale. */
export function fitRobotToStage(root: Group, targetHeight = 1.78): void {
  root.updateWorldMatrix(true, true)
  const initialBounds = new Box3().setFromObject(root)
  const initialHeight = initialBounds.getSize(new Vector3()).y
  if (!Number.isFinite(initialHeight) || initialHeight <= 0) return
  root.scale.multiplyScalar(targetHeight / initialHeight)
  root.updateWorldMatrix(true, true)
  const fittedBounds = new Box3().setFromObject(root)
  const center = fittedBounds.getCenter(new Vector3())
  root.position.x -= center.x
  root.position.y -= fittedBounds.min.y
  root.updateWorldMatrix(true, true)
}

const FACIAL_MORPH_ALIASES: Record<string, readonly string[]> = {
  talk: ['talking', 'talk', 'mouthopen', 'jawopen'],
  smile: ['smile', 'happy'],
  greet: ['smile', 'happy'],
  celebrate: ['smile', 'happy'],
  goodbye: ['smile', 'happy'],
  surprised: ['surprise', 'surprised', 'wideeyes'],
  disappointed: ['disappointed', 'sad', 'frown'],
  think: ['thinking', 'curious'],
}

function setFacialExpression(root: Object3D, state: Character3DState, immediate: boolean) {
  root.traverse((node) => {
    const mesh = node as Mesh & { userData: Record<string, unknown> }
    const dictionary = mesh.morphTargetDictionary
    const influences = mesh.morphTargetInfluences
    if (!dictionary || !influences) return
    const targets = new Array(influences.length).fill(0) as number[]
    const aliases = FACIAL_MORPH_ALIASES[state] ?? []
    for (const [name, index] of Object.entries(dictionary)) {
      const normalized = name.toLowerCase().replace(/[^a-z]/g, '')
      if (aliases.some((alias) => normalized.includes(alias))) targets[index] = state === 'talk' ? 0.35 : state === 'smile' || state === 'greet' || state === 'celebrate' || state === 'goodbye' ? 0.82 : 1
    }
    mesh.userData.cgMorphTargets = targets
    if (immediate) influences.forEach((_value, index) => { influences[index] = targets[index] ?? 0 })
  })
}

/** Retarget the shared authored clip library onto the procedural robot pivots. */
export function customClips(root: Object3D, personality: ShopkeeperPersonality): Map<Character3DState, AnimationClip> {
  const nodes = new Set<string>()
  root.traverse((node) => { if (node.name) nodes.add(node.name) })
  const library = buildClipLibrary(1.9)
  const amplitude = personality === 'strict_shopkeeper' ? 0.72 : personality === 'playful_shopkeeper' ? 1.14 : 1
  const result = new Map<Character3DState, AnimationClip>()
  for (const [name, source] of Object.entries(library) as [Character3DState, AnimationClip][]) {
    const tracks = source.tracks.flatMap((track) => {
      const [bone, property] = track.name.split('.')
      const preferred = RIG_TRACK_TARGETS[bone]
      const target = preferred && nodes.has(preferred) ? preferred : nodes.has(bone) ? bone : undefined
      if (!target || !nodes.has(target)) return []
      const copy = track.clone()
      copy.name = `${target}.${property}`
      if (property === 'quaternion' && amplitude !== 1) {
        const values = copy.values as Float32Array
        for (let index = 0; index + 3 < values.length; index += 4) {
          const q = new Quaternion(values[index], values[index + 1], values[index + 2], values[index + 3]).normalize()
          const angle = 2 * Math.acos(Math.max(-1, Math.min(1, q.w)))
          const sinHalf = Math.sqrt(Math.max(0, 1 - q.w * q.w))
          if (sinHalf > 1e-5) q.setFromAxisAngle(new Vector3(q.x / sinHalf, q.y / sinHalf, q.z / sinHalf), angle * amplitude)
          values[index] = q.x; values[index + 1] = q.y; values[index + 2] = q.z; values[index + 3] = q.w
        }
      }
      return [copy]
    })
    if (tracks.length) result.set(name, new AnimationClip(name, source.duration, tracks))
  }
  return result
}

function designatedStageX(
  personality: ShopkeeperPersonality,
  event: LivingEvent,
  target: LivingEventContext | undefined,
  canvas: DOMRect,
  chat: NonNullable<LivingShopkeeper3DProps['spatialTarget']>,
): { home: number; from: number; towardChat: number; towardExit: number } {
  const pixelsPerMeter = canvas.height / 1.95
  const geometry = buildFrameGeometry({
    chat: { x: chat.left, y: chat.top, width: chat.width, height: chat.height },
    stage: { x: canvas.left, y: canvas.top, width: canvas.width, height: canvas.height },
    characterHeight: canvas.height * 0.92,
    characterWidth: canvas.width * 0.5,
  })
  const origin = { x: canvas.left + canvas.width / 2, y: canvas.bottom }
  const xOf = (point: { x: number; y: number }) => pixelsToWorld(point, origin, pixelsPerMeter).x
  return {
    home: xOf(geometry.home),
    from: xOf({ x: geometry.walkFrom, y: geometry.home.y }),
    towardChat: xOf({ x: geometry.walkTo, y: geometry.home.y }),
    towardExit: xOf({ x: geometry.walkFrom, y: geometry.home.y }),
  }
}
function disposeScene(root: Object3D) {
  const geometries = new Set<object>()
  const materials = new Set<object>()
  const textures = new Set<object>()
  root.traverse((node) => {
    const mesh = node as Object3D & { geometry?: { dispose: () => void }; material?: unknown }
    if (mesh.geometry && !geometries.has(mesh.geometry)) {
      geometries.add(mesh.geometry)
      mesh.geometry.dispose()
    }
    const nodeMaterials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of nodeMaterials) {
      if (typeof material !== 'object' || material === null || materials.has(material)) continue
      materials.add(material)
      for (const value of Object.values(material)) {
        if (typeof value === 'object' && value !== null && 'isTexture' in value && typeof (value as { dispose?: unknown }).dispose === 'function') {
          const texture = value as unknown as { dispose: () => void }
          if (!textures.has(texture)) { textures.add(texture); texture.dispose() }
        }
      }
      const disposable = material as { dispose?: () => void }
      disposable.dispose?.()
    }
  })
}

export default function LivingShopkeeper3D({
  personality,
  state,
  event,
  eventSequence,
  eventContext,
  spatialTarget,
  forbiddenRefs = [],
  motionEnabled = true,
  essentialMotionOnly = false,
  quality = 'high',
  size = 168,
  onStateChange,
  onUnavailable,
}: LivingShopkeeper3DProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const playRef = useRef<((next: Character3DState) => void) | null>(null)
  const renderRef = useRef<(() => void) | null>(null)
  const stateRef = useRef(state)
  const eventRef = useRef(event)
  const eventSequenceRef = useRef(eventSequence)
  const eventContextRef = useRef(eventContext)
  const spatialTargetRef = useRef(spatialTarget)
  const forbiddenRefsRef = useRef(forbiddenRefs)
  const unavailableRef = useRef(onUnavailable)
  const stateChangeRef = useRef(onStateChange)
  const lastEventSequenceRef = useRef<number | undefined>(undefined)
  const pendingPlanRef = useRef<Character3DState[]>([])
  const desiredXRef = useRef(0)
  const currentXRef = useRef(0)
  stateRef.current = state
  eventRef.current = event
  eventSequenceRef.current = eventSequence
  eventContextRef.current = eventContext
  spatialTargetRef.current = spatialTarget
  forbiddenRefsRef.current = forbiddenRefs
  unavailableRef.current = onUnavailable
  stateChangeRef.current = onStateChange

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setPrefersReducedMotion(media.matches)
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const lowPowerDevice = window.matchMedia('(max-width: 600px)').matches || (navigator.hardwareConcurrency || 8) <= 4
    const effectiveQuality: CharacterQuality = lowPowerDevice && quality === 'high' ? 'medium' : quality
    const qualitySettings = qualitySettingsFor(effectiveQuality)
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ canvas, alpha: true, antialias: qualitySettings.antialias, powerPreference: 'high-performance', premultipliedAlpha: false })
    } catch {
      unavailableRef.current?.()
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualitySettings.maxPixelRatio))
    renderer.outputColorSpace = SRGBColorSpace
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = qualitySettings.shadows
    renderer.shadowMap.type = PCFSoftShadowMap
    renderer.setClearColor(0x000000, 0)

    const scene = new Scene()
    const camera = new PerspectiveCamera(34, 1, 0.01, 100)
    camera.position.set(0, 0.96, 3.25)
    camera.lookAt(0, 0.89, 0)
    scene.add(camera)

    const hemi = new HemisphereLight(0xf7f8ff, 0x6b5b52, 1.7)
    scene.add(hemi)
    const key = new DirectionalLight(0xfff4e8, 3.2)
    key.position.set(-2.2, 3.2, 3.2)
    key.castShadow = true
    key.shadow.mapSize.set(512, 512)
    scene.add(key)
    const fill = new DirectionalLight(0xcbd8ff, 1.45)
    fill.position.set(2.6, 1.9, 2)
    scene.add(fill)
    const rim = new DirectionalLight(0xffffff, 2.2)
    rim.position.set(0.3, 3, -2.6)
    scene.add(rim)

    let mixer: AnimationMixer | null = null
    let loadedRoot: Object3D | null = null
    let disposed = false
    let current: Character3DState = 'idle'
    const actions = new Map<Character3DState, AnimationAction>()
    const generated = new Map<Character3DState, AnimationClip>()
    let geometryFrame: ReturnType<typeof buildFrameGeometry> | null = null
    const animateContinuously = motionEnabled && !essentialMotionOnly && !prefersReducedMotion
    let raf = 0
    let lastFrame = 0

    const render = () => renderer.render(scene, camera)
    renderRef.current = render

    const play = (requested: Character3DState) => {
      if (disposed || !mixer || !loadedRoot) return
      const fallbacks: Partial<Record<Character3DState, Character3DState>> = {
        run: 'walk', peek: 'look_at_customer', sit: 'idle', exit: 'goodbye',
      }
      const next = generated.has(requested) ? requested : fallbacks[requested]
      if (!next) return
      let action = actions.get(next)
      if (!action) {
        const source = generated.get(next)
        if (!source) return
        action = mixer.clipAction(source)
        actions.set(next, action)
      }
      const previous = actions.get(current)
      setFacialExpression(loadedRoot, next, !motionEnabled || essentialMotionOnly || prefersReducedMotion)
      const face = loadedRoot.userData.face as { leftEye: Mesh; rightEye: Mesh; mouth: Mesh; glow: MeshBasicMaterial } | undefined
      if (face) {
        const surprise = next === 'surprised' || next === 'jump'
        const thinking = next === 'think'
        const happy = next === 'celebrate' || next === 'greet' || next === 'explain' || next === 'smile'
        face.leftEye.scale.y = surprise ? 0.082 : happy ? 0.048 : 0.061
        face.rightEye.scale.y = face.leftEye.scale.y
        face.mouth.scale.y = next === 'disappointed' ? 0.45 : next === 'talk' ? 1.65 : happy ? 1.35 : surprise ? 2.1 : 1
        face.leftEye.position.x = thinking ? -0.066 : -0.084
        face.rightEye.position.x = thinking ? 0.102 : 0.084
        face.glow.color.set(next === 'disappointed' ? 0x7dc5ff : next === 'celebrate' ? 0x9bffb3 : 0x72fff2)
      }
      action.reset()
      action.enabled = true
      action.timeScale = personality === 'strict_shopkeeper' ? 0.84 : personality === 'playful_shopkeeper' ? 1.12 : 0.96
      const canLoop = !essentialMotionOnly && !prefersReducedMotion && pendingPlanRef.current.length === 0 && ['idle', 'listen', 'think', 'hang', 'sit'].includes(next)
      action.clampWhenFinished = !canLoop
      action.loop = canLoop ? LoopRepeat : LoopOnce
      if (!motionEnabled || essentialMotionOnly || prefersReducedMotion) {
        if (previous && previous !== action) previous.stop()
        action.play()
        action.time = action.getClip().duration * 0.45
        action.paused = true
        mixer.update(0)
        render()
      } else {
        if (previous && previous !== action) previous.fadeOut(0.32)
        action.paused = false
        action.fadeIn(0.32).play()
      }
      current = next
      stateChangeRef.current?.(next)
    }
    playRef.current = play

    const onFinished = (_event: { action: AnimationAction }) => {
      if (_event.action !== actions.get(current)) return
      const next = pendingPlanRef.current.shift()
      if (next) play(next)
      else if (current === 'enter' || (current === 'walk' && eventRef.current === 'widget_opened')) desiredXRef.current = 0
      else if (!['idle', 'walk', 'run', 'hang', 'sit'].includes(current)) play('idle')
    }
    const onMixerEvent = (event: { action: AnimationAction }) => onFinished(event)
  const mountRig = (rig: Group, assetClips?: AnimationClip[]) => {
      loadedRoot = rig
      scene.add(rig)
      mixer = new AnimationMixer(rig)
      mixer.addEventListener('finished', onMixerEvent)
      const clipSet = assetClips?.length ? prepareAssetClips(rig, assetClips) : customClips(rig, personality)
      clipSet.forEach((clip, key) => generated.set(key, clip))
      current = 'idle'
      const activeEvent = eventRef.current
      if (activeEvent && eventSequenceRef.current != null) {
        const frameReady = Boolean(spatialTargetRef.current?.width && spatialTargetRef.current?.height)
        const plan = sanitizePlan(
          personality,
          planForEvent(personality, activeEvent, { ...eventContextRef.current, frameReady }),
          { frameReady },
        )
        pendingPlanRef.current = motionEnabled && !essentialMotionOnly && !prefersReducedMotion ? plan.slice(1) : []
        play(motionEnabled && !essentialMotionOnly && !prefersReducedMotion ? plan[0] : plan[plan.length - 1])
      } else {
        play(stateRef.current)
      }
      render()
    }

    // Fetch the authored asset only after the lazy renderer mounts (the
    // bargain experience itself is opened). No procedural model is presented
    // as the finished avatar when the production asset is unavailable.
    void import('three/addons/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync('/assets/salesperson-robot/cartgain-salesperson.glb'))
      .then(({ scene: robot, animations }) => {
        if (disposed) { disposeScene(robot); return }
        fitRobotToStage(robot)
        applyRobotPersonality(robot, personality)
        canvas.dataset.avatarModel = 'cartgain-salesperson-glb'
        mountRig(robot, animations)
      })
      .catch((error: unknown) => {
        if (disposed) return
        console.error('[CARTGAIN_AVATAR] Could not load the salesperson GLB.', error)
        if (process.env.NODE_ENV !== 'production') {
          const developmentRobot = buildProceduralRobot(personality)
          canvas.dataset.avatarModel = 'procedural-development-fallback'
          mountRig(developmentRobot)
        } else {
          canvas.dataset.avatarModel = 'unavailable'
          unavailableRef.current?.()
        }
      })

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect.width || size))
      const height = Math.max(1, Math.round(rect.height || size * 1.08))
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualitySettings.maxPixelRatio))
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      render()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - lastFrame < 1000 / qualitySettings.fps) return
      const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 1 / 60
      lastFrame = now
      // Expose live viewport-space bounds to rig-specific spatial solvers
      // without rebuilding the WebGL renderer during scroll or resize.
      scene.userData.activeCardRect = spatialTargetRef.current
      mixer?.update(delta)
      const blinkPhase = now % 4200
      const blink = blinkPhase < 105 ? Math.sin(Math.PI * blinkPhase / 105) : 0
      loadedRoot?.traverse((node) => {
        const mesh = node as Mesh & { userData: Record<string, unknown> }
        const targets = mesh.userData.cgMorphTargets as number[] | undefined
        const influences = mesh.morphTargetInfluences
        if (!targets || !influences) return
        const blinkIndex = mesh.morphTargetDictionary?.blink
        const blend = 1 - Math.exp(-delta * 9)
        influences.forEach((value, index) => {
          const target = (targets[index] ?? 0) + (index === blinkIndex ? blink : 0)
          influences[index] = value + (target - value) * blend
        })
      })
      const canvasRect = canvas.getBoundingClientRect()
      const chat = spatialTargetRef.current
      const activeRoot = loadedRoot
      if (activeRoot && canvasRect.width > 0 && canvasRect.height > 0 && chat?.width && chat.height) {
        const forbidden: Rect[] = forbiddenRefsRef.current.flatMap((ref) => {
          const rect = ref?.current?.getBoundingClientRect()
          return rect ? [{ x: rect.left, y: rect.top, width: rect.width, height: rect.height }] : []
        })
        geometryFrame = buildFrameGeometry({
          chat: { x: chat.left, y: chat.top, width: chat.width, height: chat.height },
          stage: { x: canvasRect.left, y: canvasRect.top, width: canvasRect.width, height: canvasRect.height },
          forbidden,
          characterHeight: canvasRect.height * 0.92,
          characterWidth: canvasRect.width * 0.5,
        })
        const pixelsPerMeter = canvasRect.height / 1.95
        let x = desiredXRef.current
        const centre = { x: canvasRect.left + canvasRect.width / 2 + x * pixelsPerMeter, y: canvasRect.bottom }
        if (overlapsForbidden(centre, { width: canvasRect.width * 0.46, height: canvasRect.height * 0.9 }, forbidden)) {
          x = pixelsToWorld({ x: geometryFrame.home.x, y: geometryFrame.home.y }, { x: canvasRect.left + canvasRect.width / 2, y: canvasRect.bottom }, pixelsPerMeter).x
        }
        activeRoot.position.x += (x - activeRoot.position.x) * (1 - Math.exp(-delta * (essentialMotionOnly ? 12 : 5)))
        currentXRef.current = activeRoot.position.x

        if (['point', 'guide', 'explain'].includes(current)) {
          const shoulder = activeRoot.getObjectByName('RightArm') ?? activeRoot.getObjectByName('UpperArm_R')
          const forearm = activeRoot.getObjectByName('RightForeArm') ?? activeRoot.getObjectByName('LowerArm_R')
          if (shoulder && forearm) {
            const targetScreen = { x: chat.left, y: chat.top + Math.min(chat.height * 0.28, canvasRect.height * 0.45) }
            const targetWorld = pixelsToWorld(targetScreen, { x: canvasRect.left + canvasRect.width / 2, y: canvasRect.bottom }, pixelsPerMeter)
            activeRoot.updateWorldMatrix(true, true)
            const upperWorld = shoulder.getWorldPosition(new Vector3())
            const elbowWorld = forearm.getWorldPosition(new Vector3())
            const hand = activeRoot.getObjectByName('RightHand') ?? activeRoot.getObjectByName('Hand_R')
            const wristWorld = hand?.getWorldPosition(new Vector3()) ?? elbowWorld.clone().add(new Vector3(0, -0.3, 0))
            const rootLocalUpper = activeRoot.worldToLocal(upperWorld.clone())
            const rootLocalElbow = activeRoot.worldToLocal(elbowWorld.clone())
            const rootLocalWrist = activeRoot.worldToLocal(wristWorld.clone())
            const rootLocalTarget = activeRoot.worldToLocal(new Vector3(targetWorld.x, targetWorld.y, 0.08))
            const upperLength = Math.max(0.05, rootLocalUpper.distanceTo(rootLocalElbow))
            const lowerLength = Math.max(0.05, rootLocalElbow.distanceTo(rootLocalWrist))
            const solved = solveTwoBone(
              vec(rootLocalUpper.x, rootLocalUpper.y, rootLocalUpper.z),
              vec(rootLocalTarget.x, rootLocalTarget.y, rootLocalTarget.z),
              upperLength,
              lowerLength,
              vec(0.15, 0.12, 1),
            )
            const applyRootDirection = (bone: Object3D, direction: Vector3) => {
              const parent = bone.parent
              if (!parent) return
              const rootOrigin = activeRoot.getWorldPosition(new Vector3())
              const worldPoint = activeRoot.localToWorld(direction.clone()).sub(rootOrigin)
              const parentOrigin = parent.getWorldPosition(new Vector3())
              const parentOriginLocal = parent.worldToLocal(parentOrigin.clone())
              const parentPointLocal = parent.worldToLocal(parentOrigin.clone().add(worldPoint))
              const directionInParent = parentPointLocal.sub(parentOriginLocal).normalize()
              const child = bone === shoulder ? forearm : hand
              const restDirection = child?.position.clone().normalize() ?? new Vector3(0, -1, 0)
              bone.quaternion.setFromUnitVectors(restDirection, directionInParent)
              activeRoot.updateWorldMatrix(true, true)
            }
            applyRootDirection(shoulder, new Vector3(solved.upperDir.x, solved.upperDir.y, solved.upperDir.z))
            applyRootDirection(forearm, new Vector3(solved.lowerDir.x, solved.lowerDir.y, solved.lowerDir.z))
          }
        }
      }
      renderer.render(scene, camera)
    }
    const visibility = () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0 }
      else if (animateContinuously && !raf && !disposed) { lastFrame = 0; raf = requestAnimationFrame(tick) }
    }
    if (animateContinuously) raf = requestAnimationFrame(tick)
    document.addEventListener('visibilitychange', visibility)

    return () => {
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', visibility)
      observer.disconnect()
      playRef.current = null
      renderRef.current = null
      mixer?.removeEventListener('finished', onMixerEvent)
      mixer?.stopAllAction()
      actions.clear()
      pendingPlanRef.current = []
      if (loadedRoot) { scene.remove(loadedRoot); disposeScene(loadedRoot) }
      renderer.dispose()
    }
  }, [personality, motionEnabled, essentialMotionOnly, prefersReducedMotion, quality, size])

  useEffect(() => {
    if (event) return
    playRef.current?.(state)
    if (!motionEnabled) renderRef.current?.()
  }, [state, event, motionEnabled])
  useEffect(() => {
    if (!event || eventSequence == null || eventSequence === lastEventSequenceRef.current) return
    lastEventSequenceRef.current = eventSequence
    const frameReady = Boolean(spatialTargetRef.current?.width && spatialTargetRef.current?.height)
    let plan = sanitizePlan(personality, planForEvent(personality, event, { ...eventContext, frameReady }), { frameReady })
    const canvas = canvasRef.current
    const chat = spatialTargetRef.current
    if (canvas && chat?.width && chat.height) {
      const rect = canvas.getBoundingClientRect()
      const positions = designatedStageX(personality, event, eventContext, rect, chat)
      let targetX = positions.home
      const hasDealGesture = plan.some((state) => state === 'point' || state === 'explain' || state === 'guide')
      if (event === 'widget_opened') targetX = positions.from
      else if (event === 'widget_closed') targetX = positions.towardExit
      else if ((hasDealGesture || event === 'counter_offer' || event === 'checkout_started') && personality !== 'strict_shopkeeper') {
        targetX = positions.towardChat
      } else if ((event === 'deal_accepted' || event === 'recommendations_shown') && personality === 'playful_shopkeeper') {
        targetX = positions.towardChat
      } else if (event === 'deal_rejected' && personality === 'playful_shopkeeper') targetX = positions.from
      desiredXRef.current = targetX
      if (event !== 'widget_opened' && Math.abs(targetX - currentXRef.current) > 0.08 && !plan.includes('walk')) {
        plan = ['walk', ...plan]
      }
    } else if (event === 'widget_opened') {
      desiredXRef.current = -0.35
    }
    pendingPlanRef.current = motionEnabled && !essentialMotionOnly && !prefersReducedMotion ? plan.slice(1) : []
    playRef.current?.(motionEnabled && !essentialMotionOnly && !prefersReducedMotion ? plan[0] : plan[plan.length - 1])
  }, [event, eventSequence, eventContext, personality, motionEnabled, essentialMotionOnly, prefersReducedMotion])
  return <canvas ref={canvasRef} width={size * 2} height={size * 2} aria-hidden="true" data-shopkeeper-3d="true" data-avatar-model="loading" style={{ display: 'block', width: '100%', height: '100%', background: 'transparent', pointerEvents: 'none' }} />
}
