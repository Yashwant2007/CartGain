/**
 * @jest-environment node
 */
import { DELETE } from '@/app/api/keys/[id]/route'
import { NextRequest } from 'next/server'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    apiKey: { findFirst: jest.fn(), delete: jest.fn() },
  },
}))

import prisma from '@/lib/db'
import { getServerSession } from 'next-auth'

const prismaMock = prisma as unknown as {
  user: { findUnique: jest.Mock }
  apiKey: { findFirst: jest.Mock; delete: jest.Mock }
}
const authMock = getServerSession as jest.Mock

function req() {
  return new NextRequest('https://cart-gain.com/api/keys/key-b', { method: 'DELETE' })
}
const params = { params: { id: 'key-b' } }

beforeEach(() => {
  jest.clearAllMocks()
  authMock.mockResolvedValue({ user: { email: 'a@example.com' } })
  prismaMock.user.findUnique.mockResolvedValue({ id: 'user-a' })
})

describe('API key tenant isolation', () => {
  it('rejects unauthenticated deletes', async () => {
    authMock.mockResolvedValue(null)
    expect((await DELETE(req(), params)).status).toBe(401)
    expect(prismaMock.apiKey.delete).not.toHaveBeenCalled()
  })

  it('cannot delete another merchant\'s key', async () => {
    // The key lookup is scoped by userId, so a foreign key id resolves to null.
    prismaMock.apiKey.findFirst.mockResolvedValue(null)
    const res = await DELETE(req(), params)
    expect(res.status).toBe(404)
    expect(prismaMock.apiKey.findFirst).toHaveBeenCalledWith({
      where: { id: 'key-b', userId: 'user-a' },
    })
    expect(prismaMock.apiKey.delete).not.toHaveBeenCalled()
  })

  it('deletes its own key', async () => {
    prismaMock.apiKey.findFirst.mockResolvedValue({ id: 'key-a', userId: 'user-a' })
    prismaMock.apiKey.delete.mockResolvedValue({})
    const res = await DELETE(req(), { params: { id: 'key-a' } })
    expect(res.status).toBe(200)
    expect(prismaMock.apiKey.delete).toHaveBeenCalledWith({ where: { id: 'key-a' } })
  })
})
