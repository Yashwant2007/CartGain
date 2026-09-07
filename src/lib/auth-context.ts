import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { hashApiKey } from '@/lib/api-keys'

export type AuthContext = {
  userId: string
  storeId: string | null
  permission: string
}

export type AuthResult = {
  success: true
  ctx: AuthContext
} | {
  success: false
  error: string
  status: number
}

export async function authenticate(request: NextRequest): Promise<AuthResult> {
  // API key auth first — programmatic access
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token.startsWith('cg_')) {
      const keyHash = hashApiKey(token)
      const apiKey = await prisma.apiKey.findUnique({
        where: { key: keyHash },
        select: { id: true, userId: true, permissions: true, expiresAt: true },
      })

      if (!apiKey) {
        return { success: false, error: 'Invalid API key', status: 401 }
      }
      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        return { success: false, error: 'API key has expired', status: 401 }
      }

      // Fire-and-forget lastUsedAt update — never blocks the request
      prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {})

      const firstStore = await prisma.store.findFirst({
        where: { userId: apiKey.userId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })

      return {
        success: true,
        ctx: { userId: apiKey.userId, storeId: firstStore?.id ?? null, permission: apiKey.permissions.includes('admin') ? 'admin' : apiKey.permissions.includes('write') ? 'write' : 'read' },
      }
    }
  }

  // Fall back to session auth
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized', status: 401 }
  }

  return {
    success: true,
    ctx: { userId: session.user.id, storeId: (session.user as any).storeId ?? null, permission: 'session' },
  }
}

export function hasPermission(ctx: AuthContext, required: 'read' | 'write' | 'admin'): boolean {
  if (ctx.permission === 'session' || ctx.permission === 'admin') return true
  if (required === 'admin') return ctx.permission === 'admin'
  if (required === 'write') return ctx.permission === 'write' || ctx.permission === 'admin'
  // read is always allowed for any authenticated key
  return true
}

export function isSessionAuth(ctx: AuthContext): boolean {
  return ctx.permission === 'session'
}