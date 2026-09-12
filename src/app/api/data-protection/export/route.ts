import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/data-protection/export?id=xxx
// Returns the full stored customer-data export as a downloadable JSON document.
// Server-scoped: only the store owner who created/owns the export can read it.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ message: 'id is required' }, { status: 400 })
    }

    const exportRow = await prisma.customerDataExport.findUnique({
      where: { id },
      include: { store: { select: { userId: true, domain: true } } },
    })
    if (!exportRow) {
      return NextResponse.json({ message: 'Export not found' }, { status: 404 })
    }
    if (exportRow.store.userId !== session.user.id) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    // Deliver the payload as a file attachment so it downloads, not logs.
    const filename = `cartgain-customer-data-export-${exportRow.id}.json`
    return new NextResponse(JSON.stringify(exportRow.payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, private',
      },
    })
  } catch (err) {
    console.error('[DATA_PROTECTION_EXPORT_GET]', err)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}