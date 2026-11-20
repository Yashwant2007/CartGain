import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultAsset = path.join(repoRoot, 'public', 'assets', 'salesperson-robot', 'cartgain-salesperson.glb')
const assetPath = path.resolve(process.argv[2] ? path.resolve(process.argv[2]) : defaultAsset)
const MAX_BYTES = 6 * 1024 * 1024
const MAX_TRIANGLES = 60_000

const REQUIRED_CLIPS = {
  idle: ['idle', 'breathing', 'breathe'],
  enter: ['enter', 'entering', 'walkin', 'walkinto'],
  walk: ['walk', 'walking', 'locomotion', 'shiftposition'],
  look_at_customer: ['lookatcustomer', 'lookcustomer', 'customerlook', 'lookat'],
  talk: ['talk', 'talking', 'speak', 'speaking'],
  listen: ['listen', 'listening'],
  think: ['think', 'thinking'],
  point: ['point', 'pointing'],
  wave: ['wave', 'waving', 'greet', 'greeting'],
  surprised: ['surprised', 'surprise'],
  disappointed: ['disappointed', 'disappointment'],
  smile: ['smile', 'smiling', 'happy'],
  celebrate: ['celebrate', 'celebrating', 'cheer'],
  goodbye: ['goodbye', 'goodbye', 'exit', 'farewell'],
}

const BONE_ROLES = {
  root: ['root', 'armature'],
  hips: ['hips', 'pelvis'],
  spine: ['spine', 'spine1', 'spine01'],
  chest: ['chest', 'spine2', 'spine02', 'upperchest'],
  neck: ['neck'],
  head: ['head'],
  leftUpperArm: ['leftarm', 'leftupperarm', 'upperarml', 'mixamorigleftarm'],
  rightUpperArm: ['rightarm', 'rightupperarm', 'upperarmr', 'mixamorigrigharm', 'mixamorigrightarm'],
  leftForearm: ['leftforearm', 'leftlowerarm', 'forearml', 'lowerarml', 'mixamorigleftforearm'],
  rightForearm: ['rightforearm', 'rightlowerarm', 'forearmr', 'lowerarmr', 'mixamorigrightforearm'],
  leftHand: ['lefthand', 'handl', 'mixamoriglefthand'],
  rightHand: ['righthand', 'handr', 'mixamorigrighthand'],
  leftThigh: ['leftupleg', 'leftthigh', 'thighl', 'upperlegl', 'mixamorigleftupleg'],
  rightThigh: ['rightupleg', 'rightthigh', 'thighr', 'upperlegr', 'mixamorigrightupleg'],
  leftShin: ['leftleg', 'leftshin', 'shinl', 'lowerlegl', 'mixamorigleftleg'],
  rightShin: ['rightleg', 'rightshin', 'shinr', 'lowerlegr', 'mixamorigrightleg'],
}

function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function readGlbJson(bytes) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error('Invalid GLB header.')
  if (bytes.readUInt32LE(4) !== 2) throw new Error('GLB must use glTF 2.0.')
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error('GLB declared length does not match file size.')
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const chunkLength = bytes.readUInt32LE(offset)
    const chunkType = bytes.readUInt32LE(offset + 4)
    const start = offset + 8
    const end = start + chunkLength
    if (end > bytes.length) throw new Error('GLB chunk exceeds file size.')
    if (chunkType === 0x4e4f534a) return JSON.parse(bytes.toString('utf8', start, end).replace(/[\u0000\s]+$/g, ''))
    offset = end
  }
  throw new Error('GLB is missing its JSON chunk.')
}

function inspect(gltf, byteLength) {
  const errors = []
  const nodes = gltf.nodes ?? []
  const nodeNames = nodes.map((node) => normalize(node.name))
  const skins = gltf.skins ?? []
  if (skins.length !== 1) errors.push(`Expected one shared character skin; found ${skins.length}.`)

  const joints = new Set(skins.flatMap((skin) => (skin.joints ?? []).map((index) => nodeNames[index]).filter(Boolean)))
  if (joints.size < 24) errors.push(`Expected at least 24 skeletal joints; found ${joints.size}.`)
  for (const [role, aliases] of Object.entries(BONE_ROLES)) {
    if (!aliases.some((alias) => joints.has(normalize(alias)))) errors.push(`Missing required rig role: ${role}.`)
  }

  const clips = gltf.animations ?? []
  const normalizedClips = clips.map((clip) => normalize(clip.name))
  for (const [required, aliases] of Object.entries(REQUIRED_CLIPS)) {
    if (!aliases.some((alias) => normalizedClips.some((name) => name === normalize(alias) || name.includes(normalize(alias))))) {
      errors.push(`Missing animation clip: ${required}.`)
    }
  }

  const targets = []
  for (const mesh of gltf.meshes ?? []) {
    const names = mesh.extras?.targetNames ?? []
    for (const name of names) targets.push(normalize(name))
  }
  const faceMorphRoles = {
    blink: ['blink', 'eyeblink', 'eyesclosed'],
    smile: ['smile', 'happy'],
    surprise: ['surprise', 'browup', 'wideeyes'],
    disappointed: ['sad', 'frown', 'disappointed'],
    talk: ['mouthopen', 'jawopen', 'viseme'],
  }
  const morphRolesPresent = Object.values(faceMorphRoles).filter((aliases) =>
    aliases.some((alias) => targets.some((target) => target.includes(normalize(alias)))),
  ).length

  const facialJointNames = [...joints].filter((name) => /jaw|eye|eyelid|brow|mouth/.test(name))
  const facialNodeIndices = new Set(nodes.flatMap((node, index) => /jaw|eye|eyelid|brow|mouth/.test(nodeNames[index]) ? [index] : []))
  const animatedFaceNodes = new Set((gltf.animations ?? []).flatMap((clip) =>
    (clip.channels ?? []).map((channel) => channel.target?.node).filter((index) => facialNodeIndices.has(index)),
  ))
  const hasFacialSystem = morphRolesPresent >= 4 || (facialJointNames.length >= 2 && animatedFaceNodes.size >= 2)
  if (!hasFacialSystem) errors.push('Missing facial animation system: provide named facial morph targets or animated eye/jaw/brow bones.')

  let vertexCount = 0
  let triangleCount = 0
  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const vertices = gltf.accessors?.[primitive.attributes?.POSITION]?.count ?? 0
      vertexCount += vertices
      triangleCount += primitive.mode === 1 || primitive.mode === 2 || primitive.mode === 3
        ? 0
        : Math.floor((gltf.accessors?.[primitive.indices]?.count ?? vertices) / 3)
    }
  }
  if (triangleCount === 0) errors.push('No triangle geometry found.')
  if (triangleCount > MAX_TRIANGLES) errors.push(`Triangle budget exceeded: ${triangleCount} > ${MAX_TRIANGLES}.`)
  if (byteLength > MAX_BYTES) errors.push(`Transfer budget exceeded: ${byteLength} bytes > ${MAX_BYTES} bytes.`)
  const images = gltf.images ?? []
  const externalImages = images.filter((image) => image.uri && !image.uri.startsWith('data:'))
  if (externalImages.length) errors.push('Robot GLB references external images; embed assets to keep storefront loading self-contained.')
  const materials = gltf.materials ?? []
  const hasPbrMaterials = materials.length > 0 && materials.every((material) => Boolean(material.pbrMetallicRoughness))
  if (!images.length && !hasPbrMaterials) errors.push('Textureless GLB must provide PBR materials for its complete visual finish.')
  if (images.length && !hasPbrMaterials) errors.push('Expected glTF PBR materials alongside embedded image textures.')

  return { errors, clips: clips.map((clip) => clip.name), joints: joints.size, morphTargets: targets, materials: materials.length, images: images.length, materialOnly: images.length === 0 && hasPbrMaterials, vertices: vertexCount, triangles: triangleCount }
}

if (!fs.existsSync(assetPath)) {
  console.error(`Robot GLB is missing: ${assetPath}`)
  console.error('See docs/bargain/ROBOT_SALESPERSON_ASSET_PIPELINE.md for the asset contract.')
  process.exitCode = 2
} else {
  try {
    const bytes = fs.readFileSync(assetPath)
    const result = inspect(readGlbJson(bytes), bytes.length)
    console.log(JSON.stringify({ asset: path.relative(repoRoot, assetPath), bytes: bytes.length, ...result }, null, 2))
    if (result.errors.length) {
      for (const error of result.errors) console.error(`FAIL: ${error}`)
      process.exitCode = 1
    } else {
      console.log('Robot GLB meets the structural import contract. Textureless PBR assets must still pass visual review at storefront size.')
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
