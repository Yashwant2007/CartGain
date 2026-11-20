import {
  AnimationClip,
  Euler,
  Quaternion,
  VectorKeyframeTrack,
  QuaternionKeyframeTrack,
} from 'three'
import type { RigBoneName } from './types'
import { BONE_INDEX } from './build'

/**
 * Authored skeletal animation clips.
 *
 * Each clip is a real THREE.AnimationClip played by an AnimationMixer on the
 * character's bone hierarchy. These are procedural quaternion/position keyframe
 * tracks authored against our rig; when artist-authored GLB clips exist they
 * replace these by clip name (see buildCharacter + the GLB replacement plan).
 */

export type Character3DClip =
  | 'idle'
  | 'enter'
  | 'greet'
  | 'walk'
  | 'run'
  | 'listen'
  | 'talk'
  | 'think'
  | 'look_at_customer'
  | 'point'
  | 'smile'
  | 'wave'
  | 'sit'
  | 'climb'
  | 'hang'
  | 'peek'
  | 'jump'
  | 'celebrate'
  | 'disappointed'
  | 'surprised'
  | 'explain'
  | 'guide'
  | 'exit'
  | 'goodbye'

interface PosePoint {
  bone: RigBoneName
  times: number[]
  quats: number[]
  positions: number[]
  scales: number[]
}

function eulerQuaternion(x: number, y: number, z: number): number[] {
  const e = new Euler(x, y, z, 'XYZ')
  const q = new Quaternion().setFromEuler(e)
  return [q.x, q.y, q.z, q.w]
}

class ClipBuilder {
  private poses = new Map<string, PosePoint>()

  private point(bone: RigBoneName): PosePoint {
    let pt = this.poses.get(bone)
    if (!pt) {
      pt = { bone, times: [], quats: [], positions: [], scales: [] }
      this.poses.set(bone, pt)
    }
    return pt
  }

  /** Record an absolute rotation (radians) for a bone at time t. */
  rot(t: number, bone: RigBoneName, x: number, y: number, z: number): void {
    const pt = this.point(bone)
    const q = eulerQuaternion(x, y, z)
    pt.times.push(t)
    pt.quats.push(q[0], q[1], q[2], q[3])
  }

  /** Record an absolute position (world units) for a bone at time t. */
  pos(t: number, bone: RigBoneName, x: number, y: number, z: number): void {
    const pt = this.point(bone)
    pt.times.push(t)
    pt.positions.push(x, y, z)
    pt.quats.length && pt.quats.push(...pt.quats.slice(-4))
  }

  /** Record an absolute scale for a bone at time t. */
  scale(t: number, bone: RigBoneName, x: number, y: number, z: number): void {
    const pt = this.point(bone)
    pt.times.push(t)
    pt.scales.push(x, y, z)
  }

  build(name: Character3DClip, duration: number): AnimationClip {
    const tracks: (QuaternionKeyframeTrack | VectorKeyframeTrack)[] = []
    for (const pt of Array.from(this.poses.values())) {
      if (pt.times.length === 0) continue
      const times = new Float32Array(pt.times)
      const tracksForBone: string[] = []
      if (pt.quats.length > 0) {
        tracksForBone.push('quaternion')
        const values = new Float32Array(pt.quats)
        tracks.push(new QuaternionKeyframeTrack(`${pt.bone}.quaternion`, times, values))
      }
      if (pt.positions.length > 0) {
        const values = new Float32Array(pt.positions)
        tracks.push(new VectorKeyframeTrack(`${pt.bone}.position`, times, values))
      }
      if (pt.scales.length > 0) {
        const values = new Float32Array(pt.scales)
        tracks.push(new VectorKeyframeTrack(`${pt.bone}.scale`, times, values))
      }
    }
    return new AnimationClip(name, duration, tracks)
  }
}

interface ArmPose {
  upper?: [number, number, number]
  fore?: [number, number, number]
  hand?: [number, number, number]
}

interface ArmOptions {
  upperL?: [number, number, number]
  upperR?: [number, number, number]
  foreL?: [number, number, number]
  foreR?: [number, number, number]
  handL?: [number, number, number]
  handR?: [number, number, number]
}

function arm(b: ClipBuilder, t: number, side: 'L' | 'R', p: ArmPose): void {
  const bone = `upperArm${side}` as RigBoneName
  if (p.upper) b.rot(t, bone, p.upper[0], p.upper[1], p.upper[2])
  const fore = `forearm${side}` as RigBoneName
  if (p.fore) b.rot(t, fore, p.fore[0], p.fore[1], p.fore[2])
  const hand = `hand${side}` as RigBoneName
  if (p.hand) b.rot(t, hand, p.hand[0], p.hand[1], p.hand[2])
  // Curl fingers around whatever is being gripped when the hand is closed.
  if (p.hand && Math.abs(p.hand[0]) > 0.5) {
    for (let f = 1; f <= 3; f += 1) {
      b.rot(t, (`finger${side}${f}` as RigBoneName), 0.75, 0, 0)
    }
  }
}

function arms(b: ClipBuilder, t: number, opts: ArmOptions): void {
  if (opts.upperL) b.rot(t, 'upperArmL', opts.upperL[0], opts.upperL[1], opts.upperL[2])
  if (opts.upperR) b.rot(t, 'upperArmR', opts.upperR[0], opts.upperR[1], opts.upperR[2])
  if (opts.foreL) b.rot(t, 'forearmL', opts.foreL[0], opts.foreL[1], opts.foreL[2])
  if (opts.foreR) b.rot(t, 'forearmR', opts.foreR[0], opts.foreR[1], opts.foreR[2])
  if (opts.handL) b.rot(t, 'handL', opts.handL[0], opts.handL[1], opts.handL[2])
  if (opts.handR) b.rot(t, 'handR', opts.handR[0], opts.handR[1], opts.handR[2])
}

function legs(b: ClipBuilder, t: number, side: 'L' | 'R', thigh: [number, number, number], shin: [number, number, number], foot?: [number, number, number]): void {
  b.rot(t, (`thigh${side}` as RigBoneName), thigh[0], thigh[1], thigh[2])
  b.rot(t, (`shin${side}` as RigBoneName), shin[0], shin[1], shin[2])
  if (foot) b.rot(t, (`foot${side}` as RigBoneName), foot[0], foot[1], foot[2])
}

function limbs(b: ClipBuilder, t: number, o: { L: [number, number, number]; R: [number, number, number]; shin?: 'both' | 'L' | 'R' }, foot?: [number, number, number]): void {
  legs(b, t, 'L', o.L, [0, 0, 0], foot)
  legs(b, t, 'R', o.R, [0, 0, 0], foot)
}

function face(
  b: ClipBuilder,
  t: number,
  opts: { browL?: number; browR?: number; eye?: number; mouthY?: number; mouthZ?: number; head?: [number, number, number] },
  height: number,
): void {
  const h = height
  if (opts.browL != null) b.rot(t, 'browL', 0, 0, opts.browL)
  if (opts.browR != null) b.rot(t, 'browR', 0, 0, opts.browR)
  if (opts.eye != null) {
    b.scale(t, 'eyeL', 1, opts.eye, 1)
    b.scale(t, 'eyeR', 1, opts.eye, 1)
  }
  if (opts.mouthY != null) b.pos(t, 'mouth', 0, opts.mouthY * h, opts.mouthZ != null ? opts.mouthZ * h : 0.028 * h)
  if (opts.head) b.rot(t, 'head', opts.head[0], opts.head[1], opts.head[2])
}

function breathe(b: ClipBuilder, t: number, height: number, phase: number): void {
  const s = Math.sin((t + phase) * Math.PI * 2)
  const h = height * 0.14
  face(b, t, { mouthY: 0, head: [0, s * 0.03, s * 0.02] }, height)
  b.rot(t, 'spine', 0, s * 0.02, s * 0.015)
}

export function buildClipLibrary(height: number): Record<Character3DClip, AnimationClip> {
  const h = height
  const clips: Partial<Record<Character3DClip, AnimationClip>> = {}

  // ── idle ── breathing + subtle sway
  {
    const b = new ClipBuilder()
    const duration = 3.2
    for (let t = 0; t <= duration; t += duration / 8) {
      breathe(b, t, h, t)
    }
    b.rot(0, 'hips', 0, 0, 0)
    b.rot(duration, 'hips', 0, 0, 0)
    clips.idle = b.build('idle', duration)
  }

  // ── enter ── settle into the stage
  {
    const b = new ClipBuilder()
    const duration = 1.0
    b.rot(0, 'hips', 0, 0, 0.3)
    b.rot(0.4, 'hips', -0.1, 0, 0)
    b.rot(1.0, 'hips', 0, 0, 0)
    arms(b, 0, { upperL: [0, 0, 0.6], upperR: [0, 0, -0.6] })
    arms(b, 0.5, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    arms(b, 1.0, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    clips.enter = b.build('enter', duration)
  }

  // ── greet ── wave or nod by personality
  {
    const b = new ClipBuilder()
    const duration = 1.2
    // Left arm raises, right stays
    b.rot(0, 'upperArmL', 0, 0, 0)
    b.rot(0.25, 'upperArmL', -1.1, 0, 1.0)
    b.rot(0.6, 'upperArmL', -1.1, 0, 1.0)
    b.rot(1.0, 'upperArmL', 0, 0, 0)
    face(b, 0, { head: [0, 0, 0] }, h)
    b.rot(0.5, 'head', 0, 0.15, -0.12)
    b.rot(1.0, 'head', 0, 0, 0)
    clips.greet = b.build('greet', duration)
  }

  // ── walk ── gait cycle
  {
    const b = new ClipBuilder()
    const duration = 1.0
    for (let k = 0; k <= 4; k += 1) {
      const t = (k / 4) * duration
      const swing = Math.sin(k * Math.PI)
      const phase = k % 2 === 0 ? [1, -1] : [-1, 1]
      limbs(b, t, { L: [0 - phase[0] * 0.35, 0, swing * 0.15], R: [0 - phase[1] * 0.35, 0, -swing * 0.15] }, [0, -0.25, 0])
      arms(b, t, { upperL: [-0.35 * phase[0], 0, 0], upperR: [-0.35 * phase[1], 0, 0] })
      breathe(b, t, h, k)
    }
    limbs(b, duration, { L: [0, 0, 0], R: [0, 0, 0] }, [0, 0, 0])
    clips.walk = b.build('walk', duration)
  }

  // ── run ── faster gait
  {
    const b = new ClipBuilder()
    const duration = 0.7
    for (let k = 0; k <= 4; k += 1) {
      const t = (k / 4) * duration
      const swing = Math.sin(k * Math.PI)
      const phase = k % 2 === 0 ? [1, -1] : [-1, 1]
      limbs(b, t, { L: [0 - phase[0] * 0.55, 0, swing * 0.25], R: [0 - phase[1] * 0.55, 0, -swing * 0.25] }, [0, -0.4, 0])
      arms(b, t, { upperL: [-0.7 * phase[0], 0, 0], upperR: [-0.7 * phase[1], 0, 0] })
      breathe(b, t, h, k * 1.7)
    }
    limbs(b, duration, { L: [0, 0, 0], R: [0, 0, 0] }, [0, 0, 0])
    clips.run = b.build('run', duration)
  }

  // ── listen ── attentive, slight head tilt
  {
    const b = new ClipBuilder()
    const duration = 2.4
    face(b, 0, { head: [0, 0, 0] }, h)
    face(b, 0.8, { head: [0, 0.12, -0.1] }, h)
    face(b, 1.6, { head: [0, -0.1, 0.08] }, h)
    face(b, duration, { head: [0, 0, 0] }, h)
    arms(b, 0, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    clips.listen = b.build('listen', duration)
  }

  // Measured salesperson speech gestures; the asset adapter may replace this
  // clip with the studio-authored `talk` clip without changing event planning.
  {
    const b = new ClipBuilder()
    const duration = 1.8
    face(b, 0, { head: [0, 0, 0] }, h)
    face(b, 0.45, { head: [0, 0.04, -0.025] }, h)
    face(b, 0.9, { head: [0, -0.035, 0.025] }, h)
    face(b, 1.35, { head: [0, 0.04, -0.025] }, h)
    face(b, duration, { head: [0, 0, 0] }, h)
    arms(b, 0, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    arms(b, 0.45, { upperL: [0, 0, -0.12], upperR: [0, 0, 0.16], foreR: [-0.12, 0, 0] })
    arms(b, 0.9, { upperL: [0, 0, 0.14], upperR: [0, 0, -0.12], foreL: [-0.1, 0, 0] })
    arms(b, 1.35, { upperL: [0, 0, -0.12], upperR: [0, 0, 0.16], foreR: [-0.12, 0, 0] })
    arms(b, duration, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    clips.talk = b.build('talk', duration)
  }

  // ── think ── hand to chin
  {
    const b = new ClipBuilder()
    const duration = 2.6
    arms(b, 0, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    arms(b, 0.5, { upperL: [0, 0, 0], upperR: [0.7, 0, -0.3], foreR: [0.6, 0, 0] })
    arms(b, 1.5, { upperL: [0, 0, 0], upperR: [0.7, 0, -0.3], foreR: [0.6, 0, 0] })
    arms(b, duration, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    face(b, 0, { head: [0, 0, 0], browL: 0.1, browR: 0.1 }, h)
    face(b, 1.3, { head: [0, -0.08, 0.12], browL: 0.25, browR: 0.25 }, h)
    face(b, duration, { head: [0, 0, 0], browL: 0.1, browR: 0.1 }, h)
    clips.think = b.build('think', duration)
  }

  // ── look_at_customer ── turn head to the shopper (+Z)
  {
    const b = new ClipBuilder()
    const duration = 2.0
    face(b, 0, { head: [0, 0, 0] }, h)
    face(b, 0.6, { head: [0, -0.05, 0.35] }, h)
    face(b, duration, { head: [0, -0.05, 0.35] }, h)
    clips.look_at_customer = b.build('look_at_customer', duration)
  }

  // ── point ── controlled pointing forward
  {
    const b = new ClipBuilder()
    const duration = 1.4
    arms(b, 0, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    arms(b, 0.4, { upperL: [0, 0, -0.25], upperR: [0, 0, 0], foreL: [-0.6, 0, 0.25], handL: [1.0, 0, 0] })
    arms(b, 0.9, { upperL: [0, 0, -0.25], upperR: [0, 0, 0], foreL: [-0.6, 0, 0.25], handL: [1.0, 0, 0] })
    arms(b, duration, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    face(b, 0, { head: [0, -0.03, 0.1] }, h)
    face(b, duration, { head: [0, -0.03, 0.1] }, h)
    clips.point = b.build('point', duration)
  }

  // Studio GLBs may supply a dedicated smile clip; the fallback is a warm
  // acknowledgement pose with the same stable clip name.
  {
    const b = new ClipBuilder()
    const duration = 1.35
    face(b, 0, { head: [0, 0, 0] }, h)
    face(b, 0.45, { head: [0, 0.08, -0.06] }, h)
    face(b, duration, { head: [0, 0.04, -0.04] }, h)
    arms(b, 0, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    arms(b, 0.45, { upperL: [0, 0, 0.48], upperR: [0, 0, -0.48] })
    arms(b, duration, { upperL: [0, 0, 0.28], upperR: [0, 0, -0.28] })
    clips.smile = b.build('smile', duration)
  }

  // ── wave ── genuine wave
  {
    const b = new ClipBuilder()
    const duration = 1.4
    arms(b, 0, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    arms(b, 0.25, { upperL: [0, 0, -0.4], upperR: [0, 0, 0], foreL: [-0.5, 0, 0], handL: [0.5, 0, 0] })
    arms(b, 0.6, { upperL: [0, 0, -0.4], upperR: [0, 0, 0], foreL: [-0.5, 0, 0], handL: [0.5, 0, 0] })
    arms(b, duration, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    face(b, 0, { head: [0, 0.12, -0.08] }, h)
    face(b, duration, { head: [0, 0.12, -0.08] }, h)
    clips.wave = b.build('wave', duration)
  }

  // ── sit ── seated, legs dangling
  {
    const b = new ClipBuilder()
    const duration = 3.0
    arms(b, 0, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    face(b, 0, { head: [0, 0, -0.05] }, h)
    face(b, 1.5, { head: [0, 0.08, -0.05] }, h)
    face(b, duration, { head: [0, 0, -0.05] }, h)
    clips.sit = b.build('sit', duration)
  }

  // ── climb ── pull-up on the frame
  {
    const b = new ClipBuilder()
    const duration = 1.6
    arms(b, 0, { upperL: [0.5, 0, 1.2], upperR: [0.5, 0, 1.2], foreL: [0.8, 0, 0], foreR: [0.8, 0, 0] })
    arms(b, 0.8, { upperL: [0.5, 0, 1.2], upperR: [0.5, 0, 1.2], foreL: [1.4, 0, 0], foreR: [1.4, 0, 0] })
    arms(b, duration, { upperL: [0.5, 0, 1.2], upperR: [0.5, 0, 1.2], foreL: [0.8, 0, 0], foreR: [0.8, 0, 0] })
    face(b, 0, { browL: 0.2, browR: 0.2, head: [-0.05, 0, 0.1] }, h)
    face(b, duration, { browL: 0.2, browR: 0.2, head: [-0.05, 0, 0.1] }, h)
    clips.climb = b.build('climb', duration)
  }

  // ── hang ── dangling from the top edge
  {
    const b = new ClipBuilder()
    const duration = 3.0
    arms(b, 0, { upperL: [0.45, 0, 1.3], upperR: [0.45, 0, 1.3] })
    arms(b, 1.5, { upperL: [0.45, 0, 1.3], upperR: [0.45, 0, 1.3] })
    arms(b, duration, { upperL: [0.45, 0, 1.3], upperR: [0.45, 0, 1.3] })
    face(b, 0, { head: [0, 0, 0.1], browL: 0.1, browR: 0.1 }, h)
    face(b, duration, { head: [0, 0, 0.1], browL: 0.1, browR: 0.1 }, h)
    clips.hang = b.build('hang', duration)
  }

  // ── peek ── head over the top edge
  {
    const b = new ClipBuilder()
    const duration = 2.4
    arms(b, 0, { upperL: [0.35, 0, 1.1], upperR: [0.35, 0, 1.1] })
    face(b, 0, { head: [-0.15, -0.1, 0.25], browL: 0.15, browR: 0.15 }, h)
    face(b, duration, { head: [-0.15, -0.1, 0.25], browL: 0.15, browR: 0.15 }, h)
    clips.peek = b.build('peek', duration)
  }

  // ── jump ── crouch, leap, land
  {
    const b = new ClipBuilder()
    const duration = 0.9
    b.pos(0, 'hips', 0, 0.52 * h, 0)
    b.pos(0.3, 'hips', 0, 0.52 * h - 0.18 * h, 0)
    b.pos(0.55, 'hips', 0, 0.52 * h + 0.34 * h, 0)
    b.pos(0.8, 'hips', 0, 0.52 * h - 0.06 * h, 0)
    b.pos(duration, 'hips', 0, 0.52 * h, 0)
    arms(b, 0, { upperL: [0.2, 0, -0.4], upperR: [0.2, 0, -0.4] })
    arms(b, 0.3, { upperL: [0.3, 0, 1.2], upperR: [0.3, 0, 1.2] })
    arms(b, 0.55, { upperL: [0.3, 0, 0], upperR: [0.3, 0, 0] })
    arms(b, duration, { upperL: [0.2, 0, -0.4], upperR: [0.2, 0, -0.4] })
    face(b, 0, { head: [0, 0, 0], browL: 0.15, browR: 0.15 }, h)
    face(b, duration, { head: [0, 0, 0], browL: 0, browR: 0 }, h)
    clips.jump = b.build('jump', duration)
  }

  // ── celebrate ── modest victory dance
  {
    const b = new ClipBuilder()
    const duration = 2.0
    arms(b, 0, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    arms(b, 0.3, { upperL: [-0.4, 0, -0.5], upperR: [-0.4, 0, 0.5], foreL: [-0.8, 0, 0], foreR: [-0.8, 0, 0] })
    arms(b, 0.9, { upperL: [-0.4, 0, -0.5], upperR: [-0.4, 0, 0.5], foreL: [-0.8, 0, 0], foreR: [-0.8, 0, 0] })
    arms(b, 1.3, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    arms(b, duration, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    face(b, 0, { head: [0, 0, 0] }, h)
    face(b, duration, { head: [0, 0, 0] }, h)
    clips.celebrate = b.build('celebrate', duration)
  }

  // ── disappointed ── slumped
  {
    const b = new ClipBuilder()
    const duration = 2.0
    arms(b, 0, { upperL: [0.1, 0, 0.4], upperR: [0.1, 0, -0.4], foreL: [0.6, 0, 0], foreR: [0.6, 0, 0] })
    face(b, 0, { head: [0.12, 0.15, -0.1] }, h)
    face(b, duration, { head: [0.12, 0.15, -0.1] }, h)
    clips.disappointed = b.build('disappointed', duration)
  }

  // ── surprised ── jump back, wide eyes, raised brows
  {
    const b = new ClipBuilder()
    const duration = 1.2
    arms(b, 0, { upperL: [0.2, 0, -0.5], upperR: [0.2, 0, 0.5] })
    arms(b, 0.6, { upperL: [0.2, 0, -0.5], upperR: [0.2, 0, 0.5] })
    arms(b, duration, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    face(b, 0, { browL: 0, browR: 0, eye: 1, head: [0, 0, 0] }, h)
    face(b, 0.25, { browL: 0.45, browR: 0.45, eye: 1.15, head: [-0.05, -0.08, 0.18] }, h)
    face(b, duration, { browL: 0.45, browR: 0.45, eye: 1.15, head: [-0.05, -0.08, 0.18] }, h)
    clips.surprised = b.build('surprised', duration)
  }

  // ── explain ── open-arms salesperson gesture
  {
    const b = new ClipBuilder()
    const duration = 2.0
    arms(b, 0, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    arms(b, 0.4, { upperL: [0.15, 0, 1.3], upperR: [-0.15, 0, 1.3] })
    arms(b, 1.0, { upperL: [0.15, 0, 1.3], upperR: [-0.15, 0, 1.3] })
    arms(b, duration, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    face(b, 0, { head: [0, 0, -0.03] }, h)
    face(b, duration, { head: [0, 0, -0.03] }, h)
    clips.explain = b.build('explain', duration)
  }

  // ── guide ── beckoning toward checkout
  {
    const b = new ClipBuilder()
    const duration = 1.6
    arms(b, 0, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    arms(b, 0.3, { upperL: [0, 0, -0.25], upperR: [0, 0, -0.25], foreL: [-0.5, 0, 0], foreR: [-0.5, 0, 0], handL: [1.0, 0, 0], handR: [1.0, 0, 0] })
    arms(b, 0.9, { upperL: [0, 0, -0.25], upperR: [0, 0, -0.25], foreL: [-0.5, 0, 0], foreR: [-0.5, 0, 0], handL: [1.0, 0, 0], handR: [1.0, 0, 0] })
    arms(b, duration, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    face(b, 0, { head: [0, -0.03, 0.1] }, h)
    face(b, duration, { head: [0, -0.03, 0.1] }, h)
    clips.guide = b.build('guide', duration)
  }

  // ── exit ── turn and leave
  {
    const b = new ClipBuilder()
    const duration = 1.2
    b.rot(0, 'hips', 0, 0, 0)
    b.rot(0.4, 'hips', 0, -0.45, 0)
    b.rot(duration, 'hips', 0, -0.45, 0)
    arms(b, 0, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    arms(b, duration, { upperL: [0, 0, 0], upperR: [0, 0, 0] })
    face(b, 0, { head: [0, -0.05, 0.1] }, h)
    face(b, duration, { head: [0, -0.05, 0.1] }, h)
    clips.exit = b.build('exit', duration)
    clips.goodbye = new AnimationClip('goodbye', duration, clips.exit.tracks.map((track) => track.clone()))
  }

  for (const key of Object.keys(clips)) {
    if (!clips[key]) throw new Error(`missing clip ${key}`)
  }
  return clips as Record<Character3DClip, AnimationClip>
}
