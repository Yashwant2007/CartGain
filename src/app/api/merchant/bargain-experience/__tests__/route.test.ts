/**
 * @jest-environment node
 */
import { GET, POST, PUT } from '@/app/api/merchant/bargain-experience/route'
import prisma from '@/lib/db'
import { getServerSession } from 'next-auth/next'
import { DEFAULT_BARGAIN_EXPERIENCE } from '@/lib/bargain/experience/types'
import { NextRequest } from 'next/server'

jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn() },
    bargainConfig: { upsert: jest.fn() },
  },
}))

const prismaMock = prisma as unknown as {
  store: { findFirst: jest.Mock }
  bargainConfig: { upsert: jest.Mock }
}
const authMock = getServerSession as jest.Mock
const STORE = { id: 'store-1', userId: 'user-1' }

function request(method: string, body?: Record<string, unknown>, query = '?storeId=store-1') {
  return new NextRequest(`https://cart-gain.com/api/merchant/bargain-experience${query}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify({ storeId: STORE.id, ...body }) : undefined,
  })
}

function rawConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cfg-1',
    storeId: STORE.id,
    ...DEFAULT_BARGAIN_EXPERIENCE,
    experienceSchemaVersion: 1,
    shopkeeperPersonality: 'friendly_shopkeeper',
    invitationDesign: 'smart-assistant',
    experienceDraftVersion: 1,
    experiencePublishedVersion: 1,
    experienceDraft: null,
    experiencePublished: null,
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  authMock.mockResolvedValue({ user: { id: 'user-1' } })
  prismaMock.store.findFirst.mockResolvedValue(STORE)
  prismaMock.bargainConfig.upsert.mockImplementation(async ({ create, update }: any) => ({
    ...rawConfig(),
    ...(create || {}),
    ...(update || {}),
  }))
})

it('rejects unauthenticated reads and writes', async () => {
  authMock.mockResolvedValue(null)
  expect((await GET(request('GET'))).status).toBe(401)
  expect((await PUT(request('PUT', { action: 'draft' }))).status).toBe(401)
  expect((await POST(request('POST', {}))).status).toBe(401)
})

it('returns the draft to the owning merchant', async () => {
  prismaMock.bargainConfig.upsert.mockResolvedValue(rawConfig({
    experienceDraft: { ...DEFAULT_BARGAIN_EXPERIENCE, personality: 'strict_shopkeeper' },
    experienceDraftVersion: 4,
    experiencePublishedVersion: 2,
  }))
  const res = await GET(request('GET'))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.experience.personality).toBe('strict_shopkeeper')
  expect(body.experience.draftVersion).toBe(4)
  expect(body.experience.publishedVersion).toBe(2)
})

it('saves a draft without touching the published snapshot or live columns', async () => {
  const res = await PUT(request('PUT', {
    action: 'draft',
    personality: 'playful_shopkeeper',
    designVariant: 'unlock-your-deal',
    customGreeting: 'Name your price',
  }))
  expect(res.status).toBe(200)
  const update = prismaMock.bargainConfig.upsert.mock.calls.at(-1)[0].update
  expect(update.experienceDraft.personality).toBe('playful_shopkeeper')
  expect(update.experienceDraftVersion).toBe(2)
  expect(update.experiencePublished).toBeUndefined()
  expect(update.shopkeeperPersonality).toBeUndefined()
  expect(update.invitationDesign).toBeUndefined()
})

it('publishes a draft to the snapshot and legacy columns', async () => {
  const res = await PUT(request('PUT', {
    action: 'publish',
    personality: 'strict_shopkeeper',
    designVariant: 'human-shopkeeper',
    ctaLabel: 'Talk price',
  }))
  expect(res.status).toBe(200)
  const update = prismaMock.bargainConfig.upsert.mock.calls.at(-1)[0].update
  expect(update.experiencePublished.personality).toBe('strict_shopkeeper')
  expect(update.experiencePublishedVersion).toBe(2)
  expect(update.shopkeeperPersonality).toBe('strict_shopkeeper')
  expect(update.invitationDesign).toBe('human-shopkeeper')
  expect(update.invitationCtaLabel).toBe('Talk price')
})

it('validates the action and store ownership', async () => {
  expect((await PUT(request('PUT', { action: 'nonsense' }))).status).toBe(400)
  prismaMock.store.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
  expect((await GET(request('GET'))).status).toBe(404)
})

it('restores defaults in both snapshots', async () => {
  prismaMock.bargainConfig.upsert.mockResolvedValue(rawConfig({
    experienceDraftVersion: 5,
    experiencePublishedVersion: 8,
  }))
  const res = await POST(request('POST', {}))
  expect(res.status).toBe(200)
  const update = prismaMock.bargainConfig.upsert.mock.calls.at(-1)[0].update
  expect(update.experienceDraft.personality).toBe('friendly_shopkeeper')
  expect(update.experiencePublished.designVariant).toBe('smart-assistant')
  expect(update.experienceDraftVersion).toBe(6)
  expect(update.experiencePublishedVersion).toBe(9)
})
