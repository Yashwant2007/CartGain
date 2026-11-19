import dynamic from 'next/dynamic'
import type { LivingShopkeeper3DProps } from './LivingShopkeeper3D'

/**
 * The living shopkeeper is rendered with Three.js and must never be part of
 * Next.js SSR (no WebGL on the server). It mounts only after hydration.
 */
const LivingShopkeeper3D = dynamic<LivingShopkeeper3DProps>(
  () => import('./LivingShopkeeper3D'),
  { ssr: false, loading: () => null },
)

export default LivingShopkeeper3D
