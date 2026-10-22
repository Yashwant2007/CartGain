import { claimSweepSlot, SWEEP_SLOT_KEY, SWEEP_SLOT_TTL_MS } from '@/lib/jobs/sweep-slot'
import { getRedis, redisSetNX } from '@/lib/redis'

jest.mock('@/lib/redis', () => ({
  getRedis: jest.fn(),
  redisSetNX: jest.fn(),
}))

const getRedisMock = getRedis as jest.Mock
const setNXMock = redisSetNX as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  getRedisMock.mockReturnValue({})
})

describe('claimSweepSlot', () => {
  it('lets the first trigger run and blocks a second one while the slot lives', async () => {
    setNXMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    await expect(claimSweepSlot(1000)).resolves.toBe(true)
    await expect(claimSweepSlot(2000)).resolves.toBe(false)

    expect(setNXMock).toHaveBeenCalledWith(SWEEP_SLOT_KEY, '1000', SWEEP_SLOT_TTL_MS)
  })

  it('runs without Redis instead of silently stopping recovery', async () => {
    getRedisMock.mockReturnValue(null)

    await expect(claimSweepSlot()).resolves.toBe(true)
    expect(setNXMock).not.toHaveBeenCalled()
  })

  it('runs when Redis throws — duplicate work beats no recovery', async () => {
    setNXMock.mockRejectedValue(new Error('redis down'))

    await expect(claimSweepSlot()).resolves.toBe(true)
  })
})
