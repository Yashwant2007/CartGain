import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: params.id, userId: session.user.id },
    })

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const abTests = await prisma.aBTest.findMany({
      where: { campaignId: params.id },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ abTests })
  } catch (error) {
    console.error('AB tests fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: params.id, userId: session.user.id },
    })

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const body = await req.json()
    const { name, variantA, variantB } = body

    if (!name || !variantA || !variantB) {
      return NextResponse.json({ error: 'Name, variantA, and variantB are required' }, { status: 400 })
    }

    const abTest = await prisma.aBTest.create({
      data: {
        campaignId: params.id,
        name,
        variantA,
        variantB,
      },
    })

    return NextResponse.json({ abTest }, { status: 201 })
  } catch (error) {
    console.error('AB test creation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
