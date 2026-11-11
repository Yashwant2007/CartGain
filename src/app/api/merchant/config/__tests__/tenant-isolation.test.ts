/**
 * @jest-environment node
 */
import { GET } from '@/app/api/merchant/config/route'
import { NextRequest } from 'next/server'

jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: { store: { findFirst: jest.fn() } },
}))
jest.mock('@/lib/conversation/store', () => ({
  loadStoreVoiceSettings: jest.fn(),
  saveStoreVoice: jest.fn(),
}))

import prisma from '@/lib/db'
import { getServerSession } from 'next-auth/next'
import { loadStoreVoiceSettings } from '@/lib/conversation/store'

const prismaMock = prisma as unknown as { store: { findFirst: jest.Mock } }
const authMock = getServerSession as jest.Mock
const loadMock = loadStoreVoiceSettings as jest.Mock

function req(storeId?: string) {
  const q = storeId ? `?storeId=${storeId}` : ''
  return new NextRequest(`https://cart-gain.com/api/merchant/config${q}`)
}

beforeEach(() => {
  jest.clearAllMocks()
  authMock.mockResolvedValue({ user: { id: 'user-a' } })
})

it('rejects unauthenticated reads', async () => {
  authMock.mockResolvedValue(null)
  expect((await GET(req('store-a'))).status).toBe(401)
  expect(prismaMock.store.findFirst).not.toHaveBeenCalled()
})

it('does not read another merchant\'s brand voice', async () => {
  // Ownership lookup fails for user-a trying store-b.
  prismaMock.store.findFirst.mockResolvedValue(null)

  const res = await GET(req('store-b'))
  expect(res.status).toBe(404)
  expect(prismaMock.store.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: 'store-b', userId: 'user-a' } })
  )
  expect(loadMock).not.toHaveBeenCalled()
})

it('reads its own store voice', async () => {
  prismaMock.store.findFirst.mockResolvedValue({ id: 'store-a' })
  loadMock.mockResolvedValue({ persona: 'friendly_shopkeeper' })

  const res = await GET(req('store-a'))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.persona).toBe('friendly_shopkeeper')
  expect(loadMock).toHaveBeenCalledWith('store-a')
})

it('requires a storeId', async () => {
  const res = await GET(req())
  expect(res.status).toBe(404)
  expect(prismaMock.store.findFirst).not.toHaveBeenCalled()
})
