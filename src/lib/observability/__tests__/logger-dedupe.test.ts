import { sendAlert } from '@/lib/alerter'
import { redisSetNXOrNull } from '@/lib/redis'
import { captureError, claimLocalAlertCooldown } from '../logger'

jest.mock('@/lib/redis', () => ({
  redisSetNXOrNull: jest.fn(),
  redisIncr: jest.fn(),
  redisExpire: jest.fn(),
}))
jest.mock('@/lib/alerter', () => ({ sendAlert: jest.fn() }))

const mockSetNX = redisSetNXOrNull as unknown as jest.Mock
const mockAlert = sendAlert as unknown as jest.Mock

let sequence = 0

function critical(operation: string) {
  return {
    level: 'critical' as const,
    component: 'system' as const,
    operation,
    message: 'alert dedupe test',
    persist: false,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAlert.mockResolvedValue(undefined)
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('claimLocalAlertCooldown', () => {
  it('allows one alert per key per TTL window', () => {
    const cooldowns = new Map<string, number>()
    expect(claimLocalAlertCooldown(cooldowns, 'alert:system:op', 1_000, 0)).toBe(true)
    expect(claimLocalAlertCooldown(cooldowns, 'alert:system:op', 1_000, 500)).toBe(false)
    expect(claimLocalAlertCooldown(cooldowns, 'alert:system:other', 1_000, 500)).toBe(true)
    expect(claimLocalAlertCooldown(cooldowns, 'alert:system:op', 1_000, 1_000)).toBe(true)
  })
})

describe('captureError alert dedupe', () => {
  it('sends one critical alert for repeated failures while Redis is down', async () => {
    mockSetNX.mockResolvedValue(null)
    const operation = `redis-down-${++sequence}`

    await captureError(critical(operation))
    await captureError(critical(operation))
    await captureError(critical(operation))

    expect(mockSetNX).toHaveBeenCalledWith(`alert:critical:system:${operation}`, '1', 10 * 60 * 1000)
    expect(mockAlert).toHaveBeenCalledTimes(1)
  })

  it('honours the Redis claim when Redis is healthy', async () => {
    const heldOperation = `held-${++sequence}`
    mockSetNX.mockResolvedValue(false)
    await captureError(critical(heldOperation))
    expect(mockAlert).not.toHaveBeenCalled()

    const freshOperation = `fresh-${++sequence}`
    mockSetNX.mockResolvedValue(true)
    await captureError(critical(freshOperation))
    expect(mockAlert).toHaveBeenCalledTimes(1)
  })
})
