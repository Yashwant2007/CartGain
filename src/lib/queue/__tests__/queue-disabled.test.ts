/**
 * @jest-environment node
 *
 * Vercel has no long-lived Bull worker. Creating a queue there only opens a
 * Redis connection that times out (ETIMEDOUT) on every health/job request.
 * The legacy queue must stay off unless a real worker opts in.
 */
describe('legacy Bull queue', () => {
  const originalFlag = process.env.ENABLE_REDIS_QUEUE
  const originalUrl = process.env.REDIS_URL

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.ENABLE_REDIS_QUEUE
    else process.env.ENABLE_REDIS_QUEUE = originalFlag
    if (originalUrl === undefined) delete process.env.REDIS_URL
    else process.env.REDIS_URL = originalUrl
    jest.resetModules()
  })

  it('does not create a queue unless ENABLE_REDIS_QUEUE is true', () => {
    delete process.env.ENABLE_REDIS_QUEUE
    process.env.REDIS_URL = 'redis://127.0.0.1:6379'

    const { getQueue, hasRedis, isQueueEnabled } = require('../index')

    expect(isQueueEnabled()).toBe(false)
    expect(getQueue()).toBeNull()
    expect(hasRedis()).toBe(false)
  })
})
