import { NextRequest, NextResponse } from 'next/server'

/**
 * API error envelope (spec §19–20).
 *
 * Every error response carries machine-readable fields so a client/widget can
 * branch deterministically instead of string-matching prose:
 *
 *   { "success": false, "error": { "code", "message" }, "message", "requestId" }
 *
 * `message` is kept alongside `error.message` for backward compatibility with
 * consumers that read the flat field. `requestId` is attached when a request is
 * available so a support report maps straight to the server's own logs.
 * Internal details (stack traces, DB errors, routes, secrets) are NEVER echoed.
 */

export interface ApiProblem {
  code: string
  message: string
}

export function getRequestId(req?: NextRequest | Request): string | undefined {
  if (!req) return undefined
  const headers = req instanceof NextRequest ? req.headers : new Headers(req.headers)
  return headers.get('x-request-id') ?? undefined
}

/** Build a standardized problem response for the given HTTP status. */
export function errorResponse(
  message: string,
  code: string,
  status: number,
  req?: NextRequest | Request
): NextResponse {
  const body: Record<string, unknown> = {
    success: false,
    error: { code, message },
    message,
  }
  const requestId = getRequestId(req)
  if (requestId) body.requestId = requestId
  return NextResponse.json(body, { status })
}

export function apiError(error: unknown, context?: string): NextResponse {
  const message = 'Something went wrong'
  if (context) {
    console.error(`[API_ERROR] ${context}:`, error)
  } else {
    console.error('[API_ERROR]:', error)
  }
  return errorResponse(message, 'INTERNAL_ERROR', 500)
}

export function unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED', req?: NextRequest): NextResponse {
  return errorResponse(message, code, 401, req)
}

export function notFound(message = 'Not found', code = 'NOT_FOUND', req?: NextRequest): NextResponse {
  return errorResponse(message, code, 404, req)
}

export function badRequest(message: string, code = 'BAD_REQUEST', req?: NextRequest): NextResponse {
  return errorResponse(message, code, 400, req)
}

export function forbidden(message = 'Forbidden', code = 'FORBIDDEN', req?: NextRequest): NextResponse {
  return errorResponse(message, code, 403, req)
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, ...data }, { status })
}