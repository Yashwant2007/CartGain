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
    bargainExperiencePublish: {
      create: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

const prismaMock = prisma as unknown as {
  store: { findFirst: jest.Mock }
  bargainConfig: { upsert: jest.Mock }
  bargainExperiencePublish: {
    create: jest.Mock
    findMany: jest.Mock
    deleteMany: jest.Mock
    findUnique: jest.Mock
  }
  $transaction: jest.Mock
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
  prismaMock.bargainExperiencePublish.findMany.mockResolvedValue([])
  prismaMock.bargainExperiencePublish.create.mockResolvedValue({})
  prismaMock.bargainExperiencePublish.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock))
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
  expect(Array.isArray(body.history)).toBe(true)
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

it('rejects a stale draft save without overwriting it', async () => {
  prismaMock.bargainConfig.upsert.mockResolvedValueOnce(rawConfig({ experienceDraftVersion: 7 }))
  const res = await PUT(request('PUT', { action: 'draft', expectedDraftVersion: 3, personality: 'playful_shopkeeper' }))
  expect(res.status).toBe(409)
  const body = await res.json()
  expect(body.code).toBe('DRAFT_VERSION_CONFLICT')
  expect(body.currentDraft.draftVersion).toBe(7)
  // One call is the read/create used to load the current draft; no write followed.
  expect(prismaMock.bargainConfig.upsert).toHaveBeenCalledTimes(1)
})

it('records a bounded publish snapshot', async () => {
  const res = await PUT(request('PUT', { action: 'publish', personality: 'strict_shopkeeper' }))
  expect(res.status).toBe(200)
  expect(prismaMock.bargainExperiencePublish.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      storeId: STORE.id,
      version: 2,
      action: 'publish',
      config: expect.objectContaining({ personality: 'strict_shopkeeper' }),
    }),
  }))
})

it('rolls back to a stored published snapshot as a new version', async () => {
  prismaMock.bargainExperiencePublish.findUnique.mockResolvedValue({
    id: 'pub-1',
    storeId: STORE.id,
    version: 3,
    action: 'publish',
    config: { ...DEFAULT_BARGAIN_EXPERIENCE, personality: 'playful_shopkeeper', designVariant: 'playful-bargain-club' },
  })
  const res = await POST(request('POST', { action: 'rollback', version: 3 }))
  expect(res.status).toBe(200)
  const update = prismaMock.bargainConfig.upsert.mock.calls.at(-1)[0].update
  expect(update.experiencePublished.personality).toBe('playful_shopkeeper')
  expect(update.experiencePublished.designVariant).toBe('playful-bargain-club')
  expect(update.experiencePublishedVersion).toBe(2)
  expect(update.shopkeeperPersonality).toBe('playful_shopkeeper')
  expect(prismaMock.bargainExperiencePublish.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ action: 'rollback', version: 2 }),
  }))
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
