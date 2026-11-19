import type { CharacterSpec, RigBoneName } from './types'

/**
 * The character rig.
 *
 * Pure data: the bone hierarchy and the rest pose are described here so the
 * geometry builder, the skin weighting pass and the clip authoring all agree
 * on the same skeleton. Offsets are fractions of the character's total height.
 */

export interface BoneDef {
  name: RigBoneName
  parent: RigBoneName | null
  /** Offset from the parent's origin, in fractions of total height. */
  offset: [number, number, number]
}

const B = (
  name: RigBoneName,
  parent: RigBoneName | null,
  offset: [number, number, number],
): BoneDef => ({ name, parent, offset })

export const BONE_DEFS: BoneDef[] = [
  B('root', null, [0, 0, 0]),
  B('hips', 'root', [0, 0.52, 0]),
  B('spine', 'hips', [0, 0.08, 0]),
  B('chest', 'spine', [0, 0.12, 0]),
  B('neck', 'chest', [0, 0.1, 0]),
  B('head', 'neck', [0, 0.055, 0]),

  // Face rig. These bones drive the brows, eyes and mouth so expressions are
  // part of the same skeleton as the body.
  B('browL', 'head', [0.028, 0.03, 0.062]),
  B('browR', 'head', [-0.028, 0.03, 0.062]),
  B('eyeL', 'head', [0.026, 0.006, 0.066]),
  B('eyeR', 'head', [-0.026, 0.006, 0.066]),
  B('jaw', 'head', [0, -0.012, 0.03]),
  B('mouth', 'jaw', [0, -0.012, 0.028]),

  B('shoulderL', 'chest', [0.085, 0.095, 0]),
  B('shoulderR', 'chest', [-0.085, 0.095, 0]),
  B('upperArmL', 'shoulderL', [0, -0.02, 0]),
  B('upperArmR', 'shoulderR', [0, -0.02, 0]),
  B('forearmL', 'upperArmL', [0, -0.155, 0]),
  B('forearmR', 'upperArmR', [0, -0.155, 0]),
  B('handL', 'forearmL', [0, -0.145, 0]),
  B('handR', 'forearmR', [0, -0.145, 0]),
  B('fingerL1', 'handL', [0.012, -0.035, 0.004]),
  B('fingerL2', 'handL', [0, -0.04, 0]),
  B('fingerL3', 'handL', [-0.012, -0.035, -0.004]),
  B('fingerR1', 'handR', [-0.012, -0.035, 0.004]),
  B('fingerR2', 'handR', [0, -0.04, 0]),
  B('fingerR3', 'handR', [0.012, -0.035, -0.004]),

  B('thighL', 'hips', [0.05, 0, 0]),
  B('thighR', 'hips', [-0.05, 0, 0]),
  B('shinL', 'thighL', [0, -0.245, 0]),
  B('shinR', 'thighR', [0, -0.245, 0]),
  B('footL', 'shinL', [0, -0.235, 0]),
  B('footR', 'shinR', [0, -0.235, 0]),
  B('toeL', 'footL', [0, -0.012, 0.05]),
  B('toeR', 'footR', [0, -0.012, 0.05]),
]

export const BONE_BY_NAME: Record<RigBoneName, BoneDef> = BONE_DEFS.reduce(
  (acc, def) => {
    acc[def.name] = def
    return acc
  },
  {} as Record<RigBoneName, BoneDef>,
)

export type Vec3 = [number, number, number]

export interface RestPose {
  /** Absolute rest position of every bone, in world units. */
  positions: Record<RigBoneName, Vec3>
  /** Parent map, resolved. */
  parents: Record<RigBoneName, RigBoneName | null>
  /** Total character height in world units. */
  height: number
}

export function buildRestPose(spec: CharacterSpec): RestPose {
  const scale = spec.proportions.height
  const positions = {} as Record<RigBoneName, Vec3>
  const parents = {} as Record<RigBoneName, RigBoneName | null>

  for (const def of BONE_DEFS) {
    parents[def.name] = def.parent
    const parentPos = def.parent ? positions[def.parent] : ([0, 0, 0] as Vec3)
    positions[def.name] = [
      parentPos[0] + def.offset[0] * scale,
      parentPos[1] + def.offset[1] * scale,
      parentPos[2] + def.offset[2] * scale,
    ]
  }

  const height = positions.head[1] + spec.proportions.headSize * scale
  return { positions, parents, height }
}

export interface BoneSegment {
  name: RigBoneName
  /** Segment start in rest world space. */
  a: Vec3
  /** Segment end in rest world space. */
  b: Vec3
  /** Radius of influence around the segment. */
  radius: number
}

/**
 * The bone segments used by the automatic skin-weighting pass. Each vertex of
 * the body mesh is bound to the two nearest segments, which is what produces
 * real elbow and knee deformation instead of a rigid segmented look.
 */
export function boneSegments(spec: CharacterSpec): BoneSegment[] {
  const rest = buildRestPose(spec)
  const scale = spec.proportions.height
  const p = rest.positions
  const limb = spec.proportions.limbThickness * scale

  const seg = (name: RigBoneName, from: RigBoneName, to: RigBoneName, radius: number): BoneSegment => ({
    name,
    a: p[from],
    b: p[to],
    radius: radius * scale,
  })

  const fingerSeg = (name: RigBoneName, from: RigBoneName, radius: number): BoneSegment => ({
    name,
    a: p[from],
    b: [p[from][0], p[from][1] - 0.035 * scale, p[from][2] + 0.004 * scale],
    radius: radius * scale,
  })

  return [
    seg('hips', 'hips', 'spine', limb * 1.5),
    seg('spine', 'spine', 'chest', limb * 1.6),
    seg('chest', 'chest', 'neck', limb * 1.7),
    seg('neck', 'neck', 'head', limb * 1.1),
    seg('head', 'head', 'head', spec.proportions.headSize * scale * 1.05),
    seg('shoulderL', 'shoulderL', 'upperArmL', limb * 1.3),
    seg('shoulderR', 'shoulderR', 'upperArmR', limb * 1.3),
    seg('upperArmL', 'upperArmL', 'forearmL', limb * 1.15),
    seg('upperArmR', 'upperArmR', 'forearmR', limb * 1.15),
    seg('forearmL', 'forearmL', 'handL', limb),
    seg('forearmR', 'forearmR', 'handR', limb),
    seg('handL', 'handL', 'handL', limb * 0.95),
    seg('handR', 'handR', 'handR', limb * 0.95),
    // Fingers get their own segments so they can actually curl around a grip.
    fingerSeg('fingerL1', 'fingerL1', limb * 0.5),
    fingerSeg('fingerL2', 'fingerL2', limb * 0.5),
    fingerSeg('fingerL3', 'fingerL3', limb * 0.5),
    fingerSeg('fingerR1', 'fingerR1', limb * 0.5),
    fingerSeg('fingerR2', 'fingerR2', limb * 0.5),
    fingerSeg('fingerR3', 'fingerR3', limb * 0.5),
    seg('thighL', 'thighL', 'shinL', limb * 1.45),
    seg('thighR', 'thighR', 'shinR', limb * 1.45),
    seg('shinL', 'shinL', 'footL', limb * 1.15),
    seg('shinR', 'shinR', 'footR', limb * 1.15),
    seg('footL', 'footL', 'toeL', limb * 1.05),
    seg('footR', 'footR', 'toeR', limb * 1.05),
  ]
}
