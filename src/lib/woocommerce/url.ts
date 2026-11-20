import { lookup as dnsLookup } from 'dns/promises'

export type DnsLookup = (
  hostname: string,
  options: { all: true; verbatim?: boolean },
) => Promise<Array<{ address: string; family: number }>>

export class UnsafeStoreUrlError extends Error {}

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
  'instance-data',
])

const BLOCKED_SUFFIXES = ['.local', '.internal', '.localhost', '.test', '.invalid']

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

function ipv4Parts(ip: string): number[] | null {
  const match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) return null
  const parts = match.slice(1).map(Number)
  return parts.every((part) => part >= 0 && part <= 255) ? parts : null
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ipv4Parts(ip)
  if (!parts) return false
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && (b === 0 || b === 168)) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true
  return false
}

function isPrivateIpv6(ip: string): boolean {
  let value = ip.toLowerCase().split('%')[0]
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIpv4(mapped[1])
  if (value === '::' || value === '::1') return true
  if (/^f[cd]/.test(value)) return true
  const hextets = value.split(':').filter(Boolean)
  const first = parseInt(hextets[0] || '0', 16)
  if ((first & 0xfe00) === 0xfc00) return true
  if ((first & 0xffc0) === 0xfe80) return true
  return false
}

export function isPrivateAddress(address: string): boolean {
  const ip = stripBrackets(address.trim())
  return isPrivateIpv4(ip) || isPrivateIpv6(ip)
}

export function parseStoreUrl(input: string): URL {
  let parsed: URL
  try {
    parsed = new URL(input.trim())
  } catch {
    throw new UnsafeStoreUrlError('Enter a full HTTPS store URL')
  }
  if (parsed.protocol !== 'https:') {
    throw new UnsafeStoreUrlError('Store URL must use https://')
  }
  if (parsed.username || parsed.password) {
    throw new UnsafeStoreUrlError('Store URL must not contain credentials')
  }
  if (parsed.port && parsed.port !== '443') {
    throw new UnsafeStoreUrlError('Store URL must use the standard HTTPS port')
  }
  if (parsed.search || parsed.hash) {
    throw new UnsafeStoreUrlError('Store URL must not contain a query string or fragment')
  }
  const host = stripBrackets(parsed.hostname.toLowerCase().replace(/\.$/, ''))
  if (!host || !host.includes('.')) {
    throw new UnsafeStoreUrlError('Store URL must include a domain name')
  }
  if (BLOCKED_HOSTS.has(host) || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new UnsafeStoreUrlError('Store URL cannot point to a local address')
  }
  if (isPrivateAddress(host)) {
    throw new UnsafeStoreUrlError('Store URL cannot point to a private address')
  }
  parsed.hostname = host
  return parsed
}

export function normalizeStoreUrl(input: string): string {
  const parsed = parseStoreUrl(input)
  const path = parsed.pathname.replace(/\/+$/, '')
  return `${parsed.origin}${path}`
}

export async function assertPublicHttpsUrl(input: string, resolve: DnsLookup = dnsLookup): Promise<string> {
  const parsed = parseStoreUrl(input)
  let addresses: Array<{ address: string; family: number }>
  try {
    addresses = await resolve(parsed.hostname, { all: true, verbatim: true })
  } catch {
    throw new UnsafeStoreUrlError('Store URL hostname could not be resolved')
  }
  if (!addresses.length) {
    throw new UnsafeStoreUrlError('Store URL hostname has no public addresses')
  }
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new UnsafeStoreUrlError('Store URL resolves to a private address')
  }
  return normalizeStoreUrl(input)
}
