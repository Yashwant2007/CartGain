import { wooCommerceAdapter } from '@/lib/woocommerce/adapter'
import type { PlatformAdapter, PlatformId } from './types'

const adapters = new Map<PlatformId, PlatformAdapter>()

export function registerPlatformAdapter(adapter: PlatformAdapter): void {
  adapters.set(adapter.id, adapter)
}

export function getPlatformAdapter(id: string): PlatformAdapter | null {
  return adapters.get(id as PlatformId) ?? null
}

export function listPlatformAdapters(): PlatformAdapter[] {
  return Array.from(adapters.values())
}

registerPlatformAdapter(wooCommerceAdapter)
