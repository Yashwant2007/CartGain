/**
 * @jest-environment node
 */
import { GET, POST } from '@/app/api/integrations/whatsapp/route'
import prisma from '@/lib/db'
import { authenticate, hasPermission } from '@/lib/auth-context'
import { resolveWhatsAppPhoneNumberId } from '@/lib/whatsapp/config'
import { discoverWhatsAppPhoneNumbers } from '@/lib/whatsapp/discovery'
import { NextRequest } from 'next/server'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn(), update: jest.fn() },
  },
}))
jest.mock('@/lib/auth-context', () => ({
  authenticate: jest.fn(),
  hasPermission: jest.fn(),
}))
jest.mock('@/lib/whatsapp/config', () => ({
  resolveWhatsAppPhoneNumberId: jest.fn(),
}))
jest.mock('@/lib/whatsapp/discovery', () => ({
  discoverWhatsAppPhoneNumbers: jest.fn(),
}))

const prismaMock = prisma as unknown as {
  store: { findFirst: jest.Mock; update: jest.Mock }
}
const authMock = authenticate as jest.Mock
const permissionMock = hasPermission as jest.Mock
const envIdMock = resolveWhatsAppPhoneNumberId as jest.Mock
const discoverMock = discoverWhatsAppPhoneNumbers as jest.Mock

const STORE = { id: 'store-1', userId: 'user-1', whatsappPhoneNumberId: null }

function request(method: string, body?: Record<string, unknown>, query = '') {
  return new NextRequest(`https://cart-gain.com/api/integrations/whatsapp${query}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  authMock.mockResolvedValue({ success: true, ctx: { userId: 'user-1' } })
  permissionMock.mockReturnValue(true)
  envIdMock.mockReturnValue('111111')
  prismaMock.store.findFirst.mockResolvedValue(STORE)
  prismaMock.store.update.mockImplementation(async ({ data }: any) => ({ ...STORE, ...data }))
})

it('rejects unauthenticated reads and writes', async () => {
  authMock.mockResolvedValue({ success: false, status: 401, error: 'Unauthorized' })
  expect((await GET(request('GET'))).status).toBe(401)
  expect((await POST(request('POST', { action: 'save' }))).status).toBe(401)
})

it('reports the shared sender and whether the store points at it', async () => {
  prismaMock.store.findFirst.mockResolvedValue({ ...STORE, whatsappPhoneNumberId: '111111' })
  const res = await GET(request('GET', undefined, '?storeId=store-1'))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.sharedNumber).toBe(true)
  expect(body.storeMappedToSharedNumber).toBe(true)
  expect(body.envPhoneNumberId).toBe('111111')
})

it('filters the shared number out of discovery results', async () => {
  discoverMock.mockResolvedValue({
    ok: true,
    wabaIds: ['waba-1'],
    lookupErrors: [],
    numbers: [
      { id: '111111', displayPhoneNumber: '+91 90000 00000', wabaId: 'waba-1' },
      { id: '222222', displayPhoneNumber: '+91 90000 00001', wabaId: 'waba-1' },
    ],
  })
  const res = await POST(request('POST', { storeId: 'store-1', action: 'discover' }))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(body.numbers.map((n: any) => n.id)).toEqual(['222222'])
})

it('refuses to map the shared sender to a single store', async () => {
  const res = await POST(request('POST', {
    storeId: 'store-1',
    action: 'save',
    whatsappPhoneNumberId: '111111',
  }))
  expect(res.status).toBe(400)
  expect((await res.json()).code).toBe('SHARED_NUMBER')
  expect(prismaMock.store.update).not.toHaveBeenCalled()
})

it('saves a merchant-owned number and can clear it', async () => {
  const saved = await POST(request('POST', {
    storeId: 'store-1',
    action: 'save',
    whatsappPhoneNumberId: '222222',
  }))
  expect(saved.status).toBe(200)
  expect(prismaMock.store.update).toHaveBeenCalledWith({
    where: { id: 'store-1' },
    data: { whatsappPhoneNumberId: '222222' },
  })

  const cleared = await POST(request('POST', { storeId: 'store-1', action: 'clear' }))
  expect(cleared.status).toBe(200)
  expect(prismaMock.store.update).toHaveBeenLastCalledWith({
    where: { id: 'store-1' },
    data: { whatsappPhoneNumberId: null },
  })
})
