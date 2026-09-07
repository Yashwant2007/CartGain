import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { generateApiKey } from '@/lib/api-keys'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const PERMISSIONS = ['read', 'write', 'admin'] as const

const createSchema = z.object({
  name: z.string().min(1).max(50),
  permissions: z.array(z.enum(PERMISSIONS)).min(1).default(['read']),
  expiresIn: z.enum(['30d', '90d', '365d', 'never']).default('never'),
})

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const keys = await prisma.apiKey.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        permissions: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ keys })
  } catch (error) {
    console.error('List API keys error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Invalid input' }, { status: 400 })

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const existing = await prisma.apiKey.count({ where: { userId: user.id } })
    if (existing >= 10) return NextResponse.json({ error: 'Maximum 10 API keys allowed' }, { status: 400 })

    const { raw, hash, prefix } = generateApiKey(parsed.data.name)

    let expiresAt: Date | null = null
    if (parsed.data.expiresIn !== 'never') {
      const days = parsed.data.expiresIn === '30d' ? 30 : parsed.data.expiresIn === '90d' ? 90 : 365
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    }

    await prisma.apiKey.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        key: hash,
        prefix,
        permissions: parsed.data.permissions,
        expiresAt,
      },
    })

    return NextResponse.json({
      key: raw,
      name: parsed.data.name,
      prefix,
      permissions: parsed.data.permissions,
      expiresAt,
      message: 'Save this key — it will not be shown again',
    })
  } catch (error) {
    console.error('Create API key error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
