import { NextResponse } from 'next/server'
import { openApiSpec } from '@/lib/openapi/spec'

export const dynamic = 'force-static'

export async function GET() {
  return NextResponse.json(openApiSpec, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
