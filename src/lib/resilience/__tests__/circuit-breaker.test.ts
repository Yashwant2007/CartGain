/**
 * @jest-environment node
 */
import {
  CircuitBreaker,
  CircuitOpenError,
  getBreaker,
  resetAllBreakers,
  resetBreaker,
  snapshotBreakers,
} from '../circuit-breaker'

function manualClock(start = 1000) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

describe('CircuitBreaker', () => {
  it('passes requests through while closed', async () => {
    const breaker = new CircuitBreaker('svc')
    await expect(breaker.execute(async () => 'ok')).resolves.toBe('ok')
    expect(breaker.currentState).toBe('closed')
  })

  it('opens after the failure threshold and short-circuits', async () => {
    const breaker = new CircuitBreaker('svc', { failureThreshold: 3 })
    const boom = async () => {
      throw new Error('network')
    }
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(boom)).rejects.toThrow('network')
    }
    expect(breaker.currentState).toBe('open')

    const fn = jest.fn().mockResolvedValue('never')
    await expect(breaker.execute(fn)).rejects.toBeInstanceOf(CircuitOpenError)
    expect(fn).not.toHaveBeenCalled()
  })

  it('resets the failure count on a success', async () => {
    const breaker = new CircuitBreaker('svc', { failureThreshold: 3 })
    const boom = async () => {
      throw new Error('x')
    }
    await expect(breaker.execute(boom)).rejects.toThrow()
    await expect(breaker.execute(boom)).rejects.toThrow()
    await breaker.execute(async () => 'ok')
    expect(breaker.consecutiveFailures).toBe(0)
    await expect(breaker.execute(boom)).rejects.toThrow()
    expect(breaker.currentState).toBe('closed')
  })

  it('moves to half-open after cooldown and closes on a trial success', async () => {
    const clock = manualClock()
    const breaker = new CircuitBreaker('svc', { failureThreshold: 1, cooldownMs: 500, now: clock.now })
    await expect(
      breaker.execute(async () => {
        throw new Error('down')
      })
    ).rejects.toThrow('down')
    expect(breaker.currentState).toBe('open')

    clock.advance(499)
    await expect(breaker.execute(async () => 'x')).rejects.toBeInstanceOf(CircuitOpenError)

    clock.advance(2)
    expect(breaker.currentState).toBe('half_open')
    await expect(breaker.execute(async () => 'recovered')).resolves.toBe('recovered')
    expect(breaker.currentState).toBe('closed')
  })

  it('re-opens when the half-open trial fails', async () => {
    const clock = manualClock()
    const breaker = new CircuitBreaker('svc', { failureThreshold: 1, cooldownMs: 100, now: clock.now })
    await expect(breaker.execute(async () => { throw new Error('a') })).rejects.toThrow()
    clock.advance(150)
    await expect(breaker.execute(async () => { throw new Error('b') })).rejects.toThrow('b')
    expect(breaker.currentState).toBe('open')
  })

  it('registers, resets and snapshots named breakers', async () => {
    resetAllBreakers()
    const a = getBreaker('reg-a', { failureThreshold: 1 })
    getBreaker('reg-b')
    expect(getBreaker('reg-a')).toBe(a)

    await expect(a.execute(async () => { throw new Error('x') })).rejects.toThrow()
    expect(snapshotBreakers()['reg-a']).toEqual({ state: 'open', failures: 1 })

    resetBreaker('reg-a')
    expect(snapshotBreakers()['reg-a']).toEqual({ state: 'closed', failures: 0 })
  })
})
