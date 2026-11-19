import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Skeleton,
  SkinnedMesh,
  TorusGeometry,
  Vector3,
  Euler,
} from 'three'
import { BONE_DEFS, buildRestPose, boneSegments, type BoneSegment, type Vec3 } from './rig'
import type { CharacterSpec, RigBoneName } from './types'

/**
 * Builds the actual 3D character.
 *
 * The result is a genuine rigged character: a bone hierarchy, a SkinnedMesh
 * whose vertices are bound to those bones with smooth weights (so elbows and
 * knees actually bend), a separate rigid face rig driven by facial bones, and
 * a wardrobe built per personality so the three characters have different
 * silhouettes rather than different colours.
 */

export interface BuiltCharacter {
  group: Group
  skeleton: Skeleton
  bones: Record<RigBoneName, Object3D>
  meshes: Object3D[]
  /** Height of the character in world units. */
  height: number
  /** Shoulder width in world units. */
  width: number
  dispose: () => void
}

interface Part {
  geometry: BufferGeometry
  /** Bone this part is rigidly attached to (face pieces, accessories). */
  bone?: RigBoneName
}

const BONE_INDEX: Record<RigBoneName, number> = BONE_DEFS.reduce(
  (acc, def, index) => {
    acc[def.name] = index
    return acc
  },
  {} as Record<RigBoneName, number>,
)

function transform(
  geometry: BufferGeometry,
  position: Vec3,
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): BufferGeometry {
  const matrix = new Matrix4()
  const quaternion = new Quaternion().setFromEuler(new Euler(rotation[0], rotation[1], rotation[2]))
  matrix.compose(
    new Vector3(position[0], position[1], position[2]),
    quaternion,
    new Vector3(scale[0], scale[1], scale[2]),
  )
  geometry.applyMatrix4(matrix)
  return geometry
}

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
}

/**
 * A capsule spanning two points — the workhorse for limbs and torsos.
 */
function limb(
  from: Vec3,
  to: Vec3,
  radius: number,
  radialSegments = 10,
): BufferGeometry {
  const a = new Vector3(from[0], from[1], from[2])
  const b = new Vector3(to[0], to[1], to[2])
  const length = a.distanceTo(b)
  const geometry = new CapsuleGeometry(radius, Math.max(length - radius * 2, 0.001), 4, radialSegments)
  const direction = new Vector3().subVectors(b, a).normalize()
  const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction)
  const matrix = new Matrix4().compose(
    new Vector3().addVectors(a, b).multiplyScalar(0.5),
    quaternion,
    new Vector3(1, 1, 1),
  )
  geometry.applyMatrix4(matrix)
  return geometry
}

function mergeSimple(geometries: BufferGeometry[]): BufferGeometry {
  const position: number[] = []
  const normal: number[] = []
  const uv: number[] = []
  const index: number[] = []
  let vertexOffset = 0

  for (const geometry of geometries) {
    const pos = geometry.getAttribute('position')
    const nor = geometry.getAttribute('normal')
    const tex = geometry.getAttribute('uv')
    for (let i = 0; i < pos.count; i += 1) {
      position.push(pos.getX(i), pos.getY(i), pos.getZ(i))
      normal.push(nor ? nor.getX(i) : 0, nor ? nor.getY(i) : 1, nor ? nor.getZ(i) : 0)
      uv.push(tex ? tex.getX(i) : 0, tex ? tex.getY(i) : 0)
    }
    const idx = geometry.getIndex()
    if (idx) {
      for (let i = 0; i < idx.count; i += 1) index.push(idx.getX(i) + vertexOffset)
    } else {
      for (let i = 0; i < pos.count; i += 1) index.push(i + vertexOffset)
    }
    vertexOffset += pos.count
  }

  const merged = new BufferGeometry()
  merged.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  merged.setAttribute('normal', new BufferAttribute(new Float32Array(normal), 3))
  merged.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  merged.setIndex(index)
  return merged
}

function mergeRigid(parts: Part[]): BufferGeometry {
  const geometry = mergeSimple(parts.map((part) => part.geometry))
  const count = geometry.getAttribute('position').count
  const skinIndex = new Uint16Array(count * 4)
  const skinWeight = new Float32Array(count * 4)

  let offset = 0
  for (const part of parts) {
    const vertexCount = part.geometry.getAttribute('position').count
    const index = BONE_INDEX[part.bone ?? 'head']
    for (let i = 0; i < vertexCount; i += 1) {
      skinIndex[(offset + i) * 4] = index
      skinWeight[(offset + i) * 4] = 1
    }
    offset += vertexCount
  }

  geometry.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4))
  geometry.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4))
  return geometry
}

/**
 * Binds every vertex to the two nearest bone segments, which is what produces
 * smooth deformation at the joints instead of a segmented robot look.
 */
function applyAutoSkin(geometry: BufferGeometry, segments: BoneSegment[]): void {
  const position = geometry.getAttribute('position')
  const count = position.count
  const skinIndex = new Uint16Array(count * 4)
  const skinWeight = new Float32Array(count * 4)

  const point = new Vector3()
  const a = new Vector3()
  const b = new Vector3()
  const ab = new Vector3()
  const ap = new Vector3()
  const closest = new Vector3()

  for (let i = 0; i < count; i += 1) {
    point.set(position.getX(i), position.getY(i), position.getZ(i))

    let best = -1
    let bestScore = Infinity
    let second = -1
    let secondScore = Infinity

    for (let s = 0; s < segments.length; s += 1) {
      const segment = segments[s]
      a.set(segment.a[0], segment.a[1], segment.a[2])
      b.set(segment.b[0], segment.b[1], segment.b[2])
      ab.subVectors(b, a)
      ap.subVectors(point, a)
      const t = Math.max(0, Math.min(1, ap.dot(ab) / Math.max(ab.lengthSq(), 1e-8)))
      closest.copy(a).addScaledVector(ab, t)
      const distance = point.distanceTo(closest)
      // Thick segments (torso, hips) win their own region from smaller
      // neighbours, so the chest is not dragged by the arms.
      const effective = Math.max(0, distance - segment.radius)
      const score = effective * effective
      if (score < bestScore) {
        second = best
        secondScore = bestScore
        best = s
        bestScore = score
      } else if (score < secondScore) {
        second = s
        secondScore = score
      }
    }

    if (best < 0) continue
    const w1 = 1 / (bestScore + 0.0004)
    let w2 = 0
    if (second >= 0 && secondScore < bestScore * 36) {
      w2 = 1 / (secondScore + 0.0004)
    }
    const total = w1 + w2
    skinIndex[i * 4] = BONE_INDEX[segments[best].name]
    skinWeight[i * 4] = w1 / total
    if (second >= 0 && w2 > 0) {
      skinIndex[i * 4 + 1] = BONE_INDEX[segments[second].name]
      skinWeight[i * 4 + 1] = w2 / total
    }
  }

  geometry.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4))
  geometry.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4))
}

interface MaterialSet {
  skin: MeshStandardMaterial
  skinShade: MeshStandardMaterial
  hair: MeshStandardMaterial
  outfitPrimary: MeshStandardMaterial
  outfitSecondary: MeshStandardMaterial
  outfitAccent: MeshStandardMaterial
  shoe: MeshStandardMaterial
  eyeWhite: MeshStandardMaterial
  eye: MeshStandardMaterial
  brow: MeshStandardMaterial
  mouth: MeshStandardMaterial
  all: MeshStandardMaterial[]
}

function buildMaterials(spec: CharacterSpec): MaterialSet {
  const p = spec.palette
  const make = (color: number, roughness: number, metalness = 0) =>
    new MeshStandardMaterial({ color: new Color(color), roughness, metalness })

  const skin = make(p.skin, 0.78)
  const skinShade = make(p.skinShade, 0.82)
  const hair = make(p.hair, 0.62)
  const outfitPrimary = make(p.outfitPrimary, 0.68)
  const outfitSecondary = make(p.outfitSecondary, 0.74)
  const outfitAccent = make(p.outfitAccent, 0.42, 0.15)
  const shoe = make(p.shoe, 0.55)
  const eyeWhite = make(0xfdfdfd, 0.32)
  const eye = make(p.eye, 0.28)
  const brow = make(p.brow, 0.7)
  const mouth = make(p.mouth, 0.6)

  return {
    skin,
    skinShade,
    hair,
    outfitPrimary,
    outfitSecondary,
    outfitAccent,
    shoe,
    eyeWhite,
    eye,
    brow,
    mouth,
    all: [skin, skinShade, hair, outfitPrimary, outfitSecondary, outfitAccent, shoe, eyeWhite, eye, brow, mouth],
  }
}

export function buildCharacter(spec: CharacterSpec): BuiltCharacter {
  const rest = buildRestPose(spec)
  const segments = boneSegments(spec)
  const scale = spec.proportions.height
  const p = rest.positions

  const group = new Group()
  group.name = `character-${spec.id}`

  // ── Bones ────────────────────────────────────────────────────────────────
  const bones: Record<string, Object3D> = {}
  const boneList: Object3D[] = []
  for (const def of BONE_DEFS) {
    const bone = new Object3D()
    bone.name = def.name
    bone.position.set(def.offset[0] * scale, def.offset[1] * scale, def.offset[2] * scale)
    bones[def.name] = bone
    boneList.push(bone)
    if (def.parent) {
      bones[def.parent].add(bone)
    } else {
      group.add(bone)
    }
  }
  group.updateMatrixWorld(true)

  const skeleton = new Skeleton(boneList as never[])
  const materials = buildMaterials(spec)

  // ── Body geometry (skin) ─────────────────────────────────────────────────
  const headRadius = spec.proportions.headSize * scale
  const limbR = spec.proportions.limbThickness * scale
  const shoulderHalf = (spec.proportions.shoulderWidth * scale) / 2
  const hipHalf = (spec.proportions.hipWidth * scale) / 2

  const bodyParts: BufferGeometry[] = []

  // Torso: hips → chest, tapered.
  bodyParts.push(limb(p.hips, p.spine, limbR * 1.5, 14))
  bodyParts.push(limb(p.spine, p.chest, limbR * 1.62, 14))
  bodyParts.push(transform(new SphereGeometry(hipHalf * 1.15, 16, 12), p.hips, [0, 0, 0], [1, 0.82, 0.92]))

  // Neck + head.
  bodyParts.push(limb(p.neck, p.head, limbR * 0.62, 10))
  bodyParts.push(
    transform(new SphereGeometry(headRadius, 22, 18), p.head, [0, 0, 0], [1, 1.06, 0.97]),
  )

  // Arms.
  for (const side of ['L', 'R'] as const) {
    const sign = side === 'L' ? 1 : -1
    const shoulder = p[`shoulder${side}`]
    const upper = p[`upperArm${side}`]
    const fore = p[`forearm${side}`]
    const hand = p[`hand${side}`]
    bodyParts.push(transform(new SphereGeometry(limbR * 1.15, 12, 10), shoulder))
    bodyParts.push(limb(shoulder, upper, limbR * 0.98, 10))
    bodyParts.push(limb(upper, fore, limbR * 0.86, 10))
    bodyParts.push(transform(new SphereGeometry(limbR * 0.84, 10, 8), fore))
    // Palm + three fingers, so the hand can visibly close on a grip.
    bodyParts.push(
      transform(new SphereGeometry(limbR * 0.92, 12, 10), hand, [0, 0, 0], [1, 1.25, 0.62]),
    )
    for (let f = 0; f < 3; f += 1) {
      const fingerBase: Vec3 = [hand[0] + (f - 1) * limbR * 0.42, hand[1] - limbR * 0.7, hand[2]]
      const fingerTip: Vec3 = [fingerBase[0], fingerBase[1] - limbR * 1.15, hand[2] + limbR * 0.12]
      bodyParts.push(limb(fingerBase, fingerTip, limbR * 0.24, 6))
    }
    // Shoulder caps keep the silhouette from pinching.
    bodyParts.push(
      transform(
        new SphereGeometry(limbR * 1.05, 12, 10),
        [sign * shoulderHalf * 0.92, p.chest[1] + 0.02 * scale, 0],
        [0, 0, 0],
        [1.05, 0.9, 1],
      ),
    )
  }

  // Legs.
  for (const side of ['L', 'R'] as const) {
    const thigh = p[`thigh${side}`]
    const shin = p[`shin${side}`]
    const foot = p[`foot${side}`]
    const toe = p[`toe${side}`]
    bodyParts.push(limb(thigh, shin, limbR * 1.28, 12))
    bodyParts.push(transform(new SphereGeometry(limbR * 1.2, 12, 10), kneeOf(thigh, shin)))
    bodyParts.push(limb(shin, foot, limbR * 1.02, 12))
    bodyParts.push(
      transform(new BoxGeometry(limbR * 1.9, limbR * 1.2, limbR * 3.4), [
        foot[0],
        foot[1] + limbR * 0.25,
        (foot[2] + toe[2]) / 2,
      ]),
    )
  }

  const bodyGeometry = mergeSimple(bodyParts)
  applyAutoSkin(bodyGeometry, segments)
  const body = new SkinnedMesh(bodyGeometry, materials.skin)
  body.name = 'body'
  body.frustumCulled = false
  group.add(body)
  body.bind(skeleton)

  // ── Wardrobe + hair (per personality silhouette) ─────────────────────────
  const outfitParts: BufferGeometry[] = []
  const hairParts: BufferGeometry[] = []

  const chestTop = p.chest
  const waist = p.spine

  if (spec.id === 'deal_master') {
    // Tailored suit jacket with lapels, a waistcoat and a tie.
    outfitParts.push(limb(p.hips, waist, limbR * 1.78, 14))
    outfitParts.push(limb(waist, chestTop, limbR * 1.92, 14))
    for (const sign of [1, -1]) {
      outfitParts.push(
        transform(new BoxGeometry(limbR * 0.8, (chestTop[1] - waist[1]) * 0.92, limbR * 0.4), [
          sign * limbR * 0.72,
          (chestTop[1] + waist[1]) / 2,
          limbR * 1.5,
        ], [0, 0, sign * 0.16]),
      )
    }
    outfitParts.push(
      transform(new BoxGeometry(limbR * 0.9, (chestTop[1] - waist[1]) * 0.7, limbR * 0.3), [
        0,
        (chestTop[1] + waist[1]) / 2,
        limbR * 1.62,
      ]),
    )
    outfitParts.push(
      transform(new BoxGeometry(limbR * 0.44, (chestTop[1] - waist[1]) * 0.62, limbR * 0.22), [
        0,
        chestTop[1] - (chestTop[1] - waist[1]) * 0.34,
        limbR * 1.78,
      ], [0, 0, 0.05]),
    )
    // Trousers.
    for (const side of ['L', 'R'] as const) {
      outfitParts.push(limb(p[`thigh${side}`], p[`shin${side}`], limbR * 1.5, 12))
      outfitParts.push(limb(p[`shin${side}`], p[`foot${side}`], limbR * 1.24, 12))
    }
    // Hair: a neat, close crop.
    hairParts.push(
      transform(new SphereGeometry(headRadius * 1.04, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), [
        p.head[0],
        p.head[1],
        p.head[2] - headRadius * 0.04,
      ]),
    )
  } else if (spec.id === 'shopping_buddy') {
    // Open shirt with rolled sleeves and a shop apron.
    outfitParts.push(limb(p.hips, waist, limbR * 1.62, 14))
    outfitParts.push(limb(waist, chestTop, limbR * 1.72, 14))
    outfitParts.push(
      transform(new BoxGeometry(limbR * 2.5, (chestTop[1] - p.hips[1]) * 0.52, limbR * 0.5), [
        0,
        p.hips[1] + (chestTop[1] - p.hips[1]) * 0.2,
        limbR * 1.42,
      ]),
    )
    for (const side of ['L', 'R'] as const) {
      outfitParts.push(
        transform(new SphereGeometry(limbR * 1.28, 12, 10), p[`upperArm${side}`], [0, 0, 0], [1, 0.7, 1]),
      )
    }
    for (const side of ['L', 'R'] as const) {
      outfitParts.push(limb(p[`thigh${side}`], p[`shin${side}`], limbR * 1.36, 12))
    }
    hairParts.push(
      transform(new SphereGeometry(headRadius * 1.07, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.7), [
        p.head[0],
        p.head[1],
        p.head[2] - headRadius * 0.02,
      ]),
    )
    for (const sign of [1, -1]) {
      hairParts.push(
        transform(new SphereGeometry(headRadius * 0.36, 10, 8), [
          sign * headRadius * 0.82,
          p.head[1] - headRadius * 0.1,
          p.head[2] - headRadius * 0.1,
        ], [0, 0, 0], [0.7, 1.5, 1]),
      )
    }
  } else {
    // Playful: hoodie with a hood behind the head, scarf, shorts and sneakers.
    outfitParts.push(limb(p.hips, waist, limbR * 1.72, 14))
    outfitParts.push(limb(waist, chestTop, limbR * 1.84, 14))
    outfitParts.push(
      transform(new SphereGeometry(headRadius * 0.92, 18, 14), [
        p.head[0],
        p.head[1] + headRadius * 0.1,
        p.head[2] - headRadius * 0.62,
      ], [0.35, 0, 0], [1, 1, 0.9]),
    )
    outfitParts.push(
      transform(new BoxGeometry(limbR * 2.2, (chestTop[1] - p.hips[1]) * 0.3, limbR * 0.4), [
        0,
        p.hips[1] + (chestTop[1] - p.hips[1]) * 0.22,
        limbR * 1.5,
      ]),
    )
    for (const side of ['L', 'R'] as const) {
      outfitParts.push(limb(p[`thigh${side}`], p[`shin${side}`], limbR * 1.5, 12))
    }
    // Scarf.
    outfitParts.push(
      transform(new TorusGeometry(limbR * 0.95, limbR * 0.3, 8, 18), p.neck, [Math.PI / 2, 0, 0]),
    )
    hairParts.push(
      transform(new SphereGeometry(headRadius * 1.05, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), [
        p.head[0],
        p.head[1],
        p.head[2],
      ]),
    )
    for (let i = 0; i < 3; i += 1) {
      hairParts.push(
        transform(new ConeGeometry(headRadius * 0.24, headRadius * 0.62, 7), [
          p.head[0] + (i - 1) * headRadius * 0.44,
          p.head[1] + headRadius * 0.86,
          p.head[2] - headRadius * 0.1,
        ], [0.2, 0, (i - 1) * 0.4]),
      )
    }
  }

  const outfitGeometry = mergeSimple(outfitParts)
  applyAutoSkin(outfitGeometry, segments)
  const outfit = new SkinnedMesh(outfitGeometry, materials.outfitPrimary)
  outfit.name = 'outfit'
  outfit.frustumCulled = false
  group.add(outfit)
  outfit.bind(skeleton)

  if (hairParts.length > 0) {
    const hairGeometry = mergeSimple(hairParts)
    applyAutoSkin(hairGeometry, segments)
    const hairMesh = new SkinnedMesh(hairGeometry, materials.hair)
    hairMesh.name = 'hair'
    hairMesh.frustumCulled = false
    group.add(hairMesh)
    hairMesh.bind(skeleton)
    materials.all.push(materials.hair)
  }

  // ── Face rig ─────────────────────────────────────────────────────────────
  const eyeR = headRadius * 0.17
  const faceParts: Part[] = []
  const eyeWhiteParts: BufferGeometry[] = []
  const pupilParts: BufferGeometry[] = []
  const browParts: BufferGeometry[] = []
  const mouthParts: BufferGeometry[] = []

  for (const side of ['L', 'R'] as const) {
    const eyePos = p[`eye${side}`]
    eyeWhiteParts.push(transform(new SphereGeometry(eyeR, 14, 12), eyePos))
    pupilParts.push(
      transform(new SphereGeometry(eyeR * 0.52, 12, 10), [
        eyePos[0],
        eyePos[1],
        eyePos[2] + eyeR * 0.52,
      ]),
    )
    const browPos = p[`brow${side}`]
    browParts.push(
      transform(new BoxGeometry(headRadius * 0.36, headRadius * 0.09, headRadius * 0.1), browPos, [
        0,
        0,
        side === 'L' ? -0.22 : 0.22,
      ]),
    )
  }
  const mouthPos = p.mouth
  mouthParts.push(
    transform(new BoxGeometry(headRadius * 0.44, headRadius * 0.1, headRadius * 0.08), mouthPos, [0, 0, 0], [
      1,
      1,
      1,
    ]),
  )

  // The face is a rigid rig: each feature is bound to its own facial bone so
  // brows can raise, eyes can blink and the mouth can open.
  const eyeWhiteGeometry = mergeRigid([
    { geometry: eyeWhiteParts[0], bone: 'eyeL' },
    { geometry: eyeWhiteParts[1], bone: 'eyeR' },
  ])
  const eyes = new SkinnedMesh(eyeWhiteGeometry, materials.eyeWhite)
  eyes.name = 'eyes'
  eyes.frustumCulled = false
  group.add(eyes)
  eyes.bind(skeleton)

  const pupilGeometry = mergeRigid([
    { geometry: pupilParts[0], bone: 'eyeL' },
    { geometry: pupilParts[1], bone: 'eyeR' },
  ])
  const pupils = new SkinnedMesh(pupilGeometry, materials.eye)
  pupils.name = 'pupils'
  pupils.frustumCulled = false
  group.add(pupils)
  pupils.bind(skeleton)

  const browGeometry = mergeRigid([
    { geometry: browParts[0], bone: 'browL' },
    { geometry: browParts[1], bone: 'browR' },
  ])
  const brows = new SkinnedMesh(browGeometry, materials.brow)
  brows.name = 'brows'
  brows.frustumCulled = false
  group.add(brows)
  brows.bind(skeleton)

  const mouthGeometry = mergeRigid([{ geometry: mouthParts[0], bone: 'mouth' }])
  const mouthMesh = new SkinnedMesh(mouthGeometry, materials.mouth)
  mouthMesh.name = 'mouth'
  mouthMesh.frustumCulled = false
  group.add(mouthMesh)
  mouthMesh.bind(skeleton)

  void faceParts

  const meshes: Object3D[] = [body, outfit, eyes, pupils, brows, mouthMesh]

  return {
    group,
    skeleton,
    bones: bones as Record<RigBoneName, Object3D>,
    meshes,
    height: rest.height,
    width: shoulderHalf * 2,
    dispose: () => {
      for (const mesh of meshes) {
        const skinned = mesh as SkinnedMesh
        if (skinned.geometry) skinned.geometry.dispose()
      }
      for (const material of materials.all) material.dispose()
      skeleton.dispose()
      group.clear()
    },
  }
}

function kneeOf(thigh: Vec3, shin: Vec3): Vec3 {
  return midpoint(thigh, shin)
}
