import { NextResponse } from 'next/server'

export function apiError(error: unknown, context?: string): NextResponse {
  const message = 'Something went wrong'

  if (context) {
    console.error(`[API_ERROR] ${context}:`, error)
  } else {
    console.error('[API_ERROR]:', error)
  }

  return NextResponse.json({ message }, { status: 500 })
}

export function unauthorized(message = 'Unauthorized'): NextResponse {
  return NextResponse.json({ message }, { status: 401 })
}

export function notFound(message = 'Not found'): NextResponse {
  return NextResponse.json({ message }, { status: 404 })
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ message }, { status: 400 })
}

export function forbidden(message = 'Forbidden'): NextResponse {
  return NextResponse.json({ message }, { status: 403 })
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}
