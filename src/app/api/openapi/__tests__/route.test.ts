/**
 * @jest-environment node
 */
import { GET } from '@/app/api/openapi/route'

describe('GET /api/openapi', () => {
  it('serves a valid OpenAPI 3.1 document', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')

    const spec = await res.json()
    expect(spec.openapi).toMatch(/^3\.1\./)
    expect(spec.info?.title).toBe('CartGain API')
    expect(spec.paths['/api/carts']).toBeDefined()
    expect(spec.paths['/api/recovery/opt-in']).toBeDefined()
    expect(spec.paths['/api/webhooks/shopify']).toBeDefined()
  })

  it('documents auth schemes and shared error responses', async () => {
    const spec = await (await GET()).json()
    expect(spec.components.securitySchemes.bearerSession).toBeDefined()
    expect(spec.components.securitySchemes.cookieSession).toBeDefined()
    expect(spec.components.responses.Unauthorized).toBeDefined()
    expect(spec.components.responses.RateLimited).toBeDefined()
  })

  it('marks documented merchant routes as protected and public routes as open', async () => {
    const spec = await (await GET()).json()
    expect(spec.paths['/api/carts'].get.security.length).toBeGreaterThan(0)
    expect(spec.paths['/api/health'].get.security).toEqual([])
  })
})
