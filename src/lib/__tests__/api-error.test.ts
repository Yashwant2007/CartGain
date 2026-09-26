import { NextRequest } from 'next/server'
import {
  errorResponse,
  getRequestId,
  unauthorized,
  notFound,
  badRequest,
  forbidden,
} from '../api-error'

function requestWith(id?: string): NextRequest {
  const req = new NextRequest('http://localhost/x', { method: 'GET' })
  if (id) req.headers.set('x-request-id', id)
  return req
}

describe('api error envelope', () => {
  it('errorResponse carries success:false, code, message and never leaks internals', async () => {
    const res = errorResponse('This offer cannot be accepted.', 'BARGAIN_OFFER_BELOW_FLOOR', 400, requestWith('trace-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({
      success: false,
      error: { code: 'BARGAIN_OFFER_BELOW_FLOOR', message: 'This offer cannot be accepted.' },
      message: 'This offer cannot be accepted.',
      requestId: 'trace-1',
    })
  })

  it('includes the request id only when the request carries one', async () => {
    const without = await errorResponse('x', 'CODE', 400).json()
    expect(without.requestId).toBeUndefined()
    const withId = await errorResponse('x', 'CODE', 400, requestWith('abc')).json()
    expect(withId.requestId).toBe('abc')
  })

  it('helper shorthands map to the correct statuses', async () => {
    expect((await unauthorized('No', 'X', requestWith('1')).json()) as any).toMatchObject({
      success: false,
      error: { code: 'X' },
    })
    expect(notFound().status).toBe(404)
    expect(badRequest('nope').status).toBe(400)
    expect(forbidden().status).toBe(403)
    expect((await unauthorized().json() as any).error.code).toBe('UNAUTHORIZED')
  })

  it('getRequestId reads the trace corridor header', () => {
    expect(getRequestId(requestWith('trace-9'))).toBe('trace-9')
    expect(getRequestId(requestWith())).toBeUndefined()
    expect(getRequestId(undefined)).toBeUndefined()
  })
})