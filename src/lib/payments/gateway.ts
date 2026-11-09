import type { GatewayAdapter, GatewayName } from './types'
import { cashfreeAdapter } from './cashfree-adapter'

const adapters: Record<string, GatewayAdapter> = {
  cashfree: cashfreeAdapter,
}

export function getGatewayAdapter(gateway: GatewayName): GatewayAdapter | null {
  return adapters[gateway] ?? null
}

export function getRegisteredGateways(): GatewayName[] {
  return Object.keys(adapters) as GatewayName[]
}

export function registerGateway(name: string, adapter: GatewayAdapter): void {
  adapters[name] = adapter
}
