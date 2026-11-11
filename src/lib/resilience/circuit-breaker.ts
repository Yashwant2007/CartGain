/**
 * A small, dependency-free circuit breaker for external calls.
 *
 * It protects cart recovery and merchant tooling from a failing dependency
 * (Meta Graph, Shopify, email) by failing fast once consecutive *thrown*
 * errors cross a threshold, then letting a single trial request through after
 * a cooldown. Only thrown errors count — an HTTP error response is a valid
 * provider answer and is handled by the caller's own classification.
 *
 * State is per-process (like the existing AI breaker). That is sufficient for
 * Vercel functions: a single warm instance stops hammering a dead dependency,
 * while a cold start begins closed again.
 */

export type BreakerState = 'closed' | 'open' | 'half_open'

export interface BreakerOptions {
  /** Consecutive thrown failures that open the breaker. Default 5. */
  failureThreshold?: number
  /** How long the breaker stays open before one trial request. Default 30s. */
  cooldownMs?: number
  /** Injectable clock (tests). Default Date.now. */
  now?: () => number
}

export class CircuitOpenError extends Error {
  readonly code = 'CIRCUIT_OPEN'
  constructor(readonly breaker: string, readonly retryAfterMs: number) {
    super(`Circuit breaker "${breaker}" is open; retry in ${Math.ceil(retryAfterMs / 1000)}s`)
    this.name = 'CircuitOpenError'
  }
}

export class CircuitBreaker {
  readonly failureThreshold: number
  readonly cooldownMs: number
  private readonly now: () => number
  private failures = 0
  private state: BreakerState = 'closed'
  private openedAt = 0
  private trialInFlight = false

  constructor(readonly name: string, options: BreakerOptions = {}) {
    this.failureThreshold = Math.max(1, options.failureThreshold ?? 5)
    this.cooldownMs = Math.max(0, options.cooldownMs ?? 30_000)
    this.now = options.now ?? Date.now
  }

  get currentState(): BreakerState {
    if (this.state === 'open' && this.now() - this.openedAt >= this.cooldownMs) {
      return 'half_open'
    }
    return this.state
  }

  get consecutiveFailures(): number {
    return this.failures
  }

  retryAfterMs(): number {
    if (this.state !== 'open') return 0
    return Math.max(0, this.cooldownMs - (this.now() - this.openedAt))
  }

  private allow(): boolean {
    const state = this.currentState
    if (state === 'closed') return true
    if (state === 'open') return false
    // half_open: exactly one trial request at a time.
    if (this.trialInFlight) return false
    this.trialInFlight = true
    return true
  }

  private onSuccess(): void {
    this.failures = 0
    this.state = 'closed'
    this.openedAt = 0
    this.trialInFlight = false
  }

  private onFailure(): void {
    this.failures += 1
    this.trialInFlight = false
    if (this.state === 'half_open' || this.failures >= this.failureThreshold) {
      this.state = 'open'
      this.openedAt = this.now()
    }
  }

  /** Run `fn`, recording thrown errors. Throws CircuitOpenError when open. */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.allow()) {
      throw new CircuitOpenError(this.name, this.retryAfterMs())
    }
    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  /** Test/ops helper: force the breaker back to closed. */
  reset(): void {
    this.failures = 0
    this.state = 'closed'
    this.openedAt = 0
    this.trialInFlight = false
  }
}

const registry = new Map<string, CircuitBreaker>()

export function getBreaker(name: string, options: BreakerOptions = {}): CircuitBreaker {
  const existing = registry.get(name)
  if (existing) return existing
  const breaker = new CircuitBreaker(name, options)
  registry.set(name, breaker)
  return breaker
}

export function resetBreaker(name: string): void {
  registry.get(name)?.reset()
}

export function resetAllBreakers(): void {
  registry.forEach((breaker) => breaker.reset())
}

export function snapshotBreakers(): Record<string, { state: BreakerState; failures: number }> {
  const out: Record<string, { state: BreakerState; failures: number }> = {}
  registry.forEach((breaker, name) => {
    out[name] = { state: breaker.currentState, failures: breaker.consecutiveFailures }
  })
  return out
}
