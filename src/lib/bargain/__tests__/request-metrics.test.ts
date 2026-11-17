import { percentile, RequestMetrics } from '../request-metrics'

describe('percentile', () => {
  it('uses nearest-rank over a sorted sample set', () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(percentile(sorted, 0.5)).toBe(50)
    expect(percentile(sorted, 0.95)).toBe(95)
    expect(percentile(sorted, 0.99)).toBe(99)
  })

  it('handles empty samples and clamps invalid quantiles', () => {
    expect(percentile([], 0.5)).toBe(0)
    expect(percentile([7], 2)).toBe(7)
    expect(percentile([7], -1)).toBe(7)
    expect(percentile([7], Number.NaN)).toBe(0)
  })
})

describe('RequestMetrics', () => {
  it('records latency by stage and computes p50/p95/p99', () => {
    const metrics = new RequestMetrics()
    for (let i = 1; i <= 20; i += 1) metrics.record('negotiate', i)
    metrics.record('offer', 900)

    expect(metrics.get('negotiate')).toEqual({ stage: 'negotiate', count: 20, p50: 10, p95: 19, p99: 20 })
    expect(metrics.get('offer')).toEqual({ stage: 'offer', count: 1, p50: 900, p95: 900, p99: 900 })
    expect(metrics.get('missing')).toBeNull()
    expect(metrics.snapshot()).toHaveLength(2)
  })

  it('keeps only the newest samples per stage', () => {
    const metrics = new RequestMetrics({ maxSamplesPerStage: 3 })
    for (const value of [10, 20, 30, 40, 50]) metrics.record('stage', value)

    expect(metrics.get('stage')).toEqual({ stage: 'stage', count: 3, p50: 40, p95: 50, p99: 50 })
  })

  it('bounds the number of tracked stages', () => {
    const metrics = new RequestMetrics({ maxStages: 2 })
    metrics.record('first', 1)
    metrics.record('second', 2)
    metrics.record('third', 3)

    expect(metrics.get('first')).toBeNull()
    expect(metrics.snapshot().map((s) => s.stage)).toEqual(['second', 'third'])
  })

  it('ignores invalid durations and blank stages', () => {
    const metrics = new RequestMetrics()
    metrics.record('valid', 12)
    metrics.record('valid', Number.NaN)
    metrics.record('valid', Number.POSITIVE_INFINITY)
    metrics.record('valid', -5)
    metrics.record('   ', 99)

    expect(metrics.get('valid')).toEqual({ stage: 'valid', count: 1, p50: 12, p95: 12, p99: 12 })
    expect(metrics.snapshot()).toHaveLength(1)
  })

  it('trims and bounds stage names', () => {
    const metrics = new RequestMetrics()
    const stage = `  ${'x'.repeat(200)}  `
    metrics.record(stage, 5)

    expect(metrics.get('x'.repeat(100))?.count).toBe(1)
  })

  it('records elapsed time from a timer once', () => {
    const now = jest.spyOn(Date, 'now')
    now.mockReturnValue(1000)
    try {
      const metrics = new RequestMetrics()
      const done = metrics.startTimer('db')
      now.mockReturnValue(1250)
      done()
      done()
      expect(metrics.get('db')).toEqual({ stage: 'db', count: 1, p50: 250, p95: 250, p99: 250 })
    } finally {
      now.mockRestore()
    }
  })

  it('resets one stage or all stages', () => {
    const metrics = new RequestMetrics()
    metrics.record('a', 1)
    metrics.record('b', 2)
    metrics.reset('a')

    expect(metrics.get('a')).toBeNull()
    expect(metrics.snapshot()).toHaveLength(1)

    metrics.reset()
    expect(metrics.snapshot()).toEqual([])
  })
})
