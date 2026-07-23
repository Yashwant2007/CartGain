import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const key = await prisma.apiKey.findFirst({
    where: { id: params.id, userId: user.id },
  })
  if (!key) return NextResponse.json({ error: 'API key not found' }, { status: 404 })

  await prisma.apiKey.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}