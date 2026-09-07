import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { hashApiKey } from '@/lib/api-keys'

export type ApiKeyAuthResult = {
  authenticated: true
  userId: string
  keyId: string
  permissions: string[]
} | {
  authenticated: false
  error: string
  status: number
}

export async function authenticateApiKey(request: NextRequest): Promise<ApiKeyAuthResult> {
  const authHeader = request.headers.get('authorization')

  if (!authHeader) {
    return { authenticated: false, error: 'Missing Authorization header', status: 401 }
  }

  if (!authHeader.startsWith('Bearer ')) {
    return { authenticated: false, error: 'Invalid Authorization format. Use: Bearer <key>', status: 401 }
  }

  const token = authHeader.slice(7).trim()

  if (!token.startsWith('cg_')) {
    return { authenticated: false, error: 'Invalid API key format', status: 401 }
  }

  const keyHash = hashApiKey(token)

  const apiKey = await prisma.apiKey.findUnique({
    where: { key: keyHash },
    select: {
      id: true,
      userId: true,
      permissions: true,
      expiresAt: true,
    },
  })

  if (!apiKey) {
    return { authenticated: false, error: 'Invalid API key', status: 401 }
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return { authenticated: false, error: 'API key has expired', status: 401 }
  }

  // Update lastUsedAt asynchronously — don't block the response
  prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {})

  return {
    authenticated: true,
    userId: apiKey.userId,
    keyId: apiKey.id,
    permissions: apiKey.permissions,
  }
}

export function requirePermission(result: ApiKeyAuthResult, required: string): boolean {
  if (!result.authenticated) return false
  if (result.permissions.includes('admin')) return true
  return result.permissions.includes(required)
}
