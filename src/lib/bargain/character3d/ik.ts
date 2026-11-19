/**
 * Two-bone inverse kinematics.
 *
 * This is what lets the character actually GRIP the chat frame: the hands are
 * not painted at a fixed offset, they are solved onto measured DOM targets so
 * the fingers land on the real edge of the conversation, whatever the panel
 * size is.
 *
 * Pure maths — no renderer dependency — so it can be unit tested.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Quat {
  x: number
  y: number
  z: number
  w: number
}

export function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z }
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s }
}

export function length(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z)
}

export function normalize(a: Vec3): Vec3 {
  const len = length(a)
  if (len < 1e-8) return { x: 0, y: -1, z: 0 }
  return { x: a.x / len, y: a.y / len, z: a.z / len }
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function quatMul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  }
}

export function quatConjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w }
}

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const a = normalize(axis)
  const half = angle / 2
  const s = Math.sin(half)
  return { x: a.x * s, y: a.y * s, z: a.z * s, w: Math.cos(half) }
}

export function rotateVec(q: Quat, v: Vec3): Vec3 {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y
  const iy = q.w * v.y + q.z * v.x - q.x * v.z
  const iz = q.w * v.z + q.x * v.y - q.y * v.x
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z
  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  }
}

/** Shortest-arc rotation taking one unit vector onto another. */
export function quatFromUnitVectors(from: Vec3, to: Vec3): Quat {
  const a = normalize(from)
  const b = normalize(to)
  const d = dot(a, b)
  if (d > 0.999999) return { x: 0, y: 0, z: 0, w: 1 }
  if (d < -0.999999) {
    const axis = Math.abs(a.x) < 0.9 ? cross(a, vec(1, 0, 0)) : cross(a, vec(0, 1, 0))
    return quatFromAxisAngle(axis, Math.PI)
  }
  const c = cross(a, b)
  const q: Quat = { x: c.x, y: c.y, z: c.z, w: 1 + d }
  const len = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z)
  if (len < 1e-8) return { x: 0, y: 0, z: 0, w: 1 }
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len }
}

export interface TwoBoneResult {
  /** Direction the upper bone should point. */
  upperDir: Vec3
  /** Direction the lower bone should point. */
  lowerDir: Vec3
  /** World position of the joint (elbow / knee). */
  joint: Vec3
  /** True when the target was inside the reachable envelope. */
  reachable: boolean
}

/**
 * Solves a two bone chain so the end effector reaches `target`.
 *
 * `pole` biases the direction the joint bends towards, so an elbow never
 * flips through the body.
 */
export function solveTwoBone(
  root: Vec3,
  target: Vec3,
  upperLength: number,
  lowerLength: number,
  pole: Vec3,
): TwoBoneResult {
  const toTarget = sub(target, root)
  const rawDistance = length(toTarget)
  const minReach = Math.abs(upperLength - lowerLength) + 1e-4
  const maxReach = upperLength + lowerLength - 1e-4
  const distance = Math.max(minReach, Math.min(maxReach, rawDistance))
  const reachable = rawDistance <= maxReach && rawDistance >= minReach

  const forward = normalize(toTarget)

  // Build a bend plane from the pole vector, projected perpendicular to the
  // root→target axis.
  const projected = sub(pole, scale(forward, dot(pole, forward)))
  const bend = length(projected) < 1e-6 ? vec(0, 0, 1) : normalize(projected)

  const cosRoot = (upperLength * upperLength + distance * distance - lowerLength * lowerLength) /
    (2 * upperLength * distance)
  const rootAngle = Math.acos(Math.max(-1, Math.min(1, cosRoot)))

  const axis = normalize(cross(forward, bend))
  const upperDir = normalize(rotateVec(quatFromAxisAngle(axis, rootAngle), forward))

  const joint = add(root, scale(upperDir, upperLength))
  const lowerDir = normalize(sub(target, joint))

  return { upperDir, lowerDir, joint, reachable }
}
