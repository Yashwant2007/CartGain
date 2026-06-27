import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { abTestCreateSchema, validateOrThrow, handleValidationError } from '@/lib/validation'

export const dynamic = 'force-dynamic'

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
    const data = validateOrThrow(abTestCreateSchema, body)

    const abTest = await prisma.aBTest.create({
      data: {
        campaignId: params.id,
        name: data.name,
        variantA: data.variantA,
        variantB: data.variantB,
      },
    })

    return NextResponse.json({ abTest }, { status: 201 })
  } catch (error) {
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    console.error('AB test creation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
