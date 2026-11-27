import { wikimediaTrendProvider } from './wikimedia'
import type { TrendProvider } from './types'

const providers = new Map<string, TrendProvider>()
providers.set(wikimediaTrendProvider.id, wikimediaTrendProvider)

export const DEFAULT_TREND_PROVIDER_ID = wikimediaTrendProvider.id

export function configuredTrendProviderId(): string {
  return process.env.BARGAIN_TREND_PROVIDER?.trim() || DEFAULT_TREND_PROVIDER_ID
}

export function registerTrendProvider(provider: TrendProvider): void {
  if (!provider?.id?.trim()) throw new Error('Trend provider requires an id')
  providers.set(provider.id.trim(), provider)
}

export function getTrendProvider(id: string = configuredTrendProviderId()): TrendProvider {
  return providers.get(id) ?? wikimediaTrendProvider
}

export function registeredTrendProviderIds(): string[] {
  return Array.from(providers.keys()).sort()
}
