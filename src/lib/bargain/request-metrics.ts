const DEFAULT_MAX_SAMPLES_PER_STAGE = 500
const DEFAULT_MAX_STAGES = 100
const MAX_STAGE_LENGTH = 100

export interface RequestMetricsOptions {
  maxSamplesPerStage?: number
  maxStages?: number
}

export interface StageLatency {
  stage: string
  count: number
  p50: number
  p95: number
  p99: number
}

function boundedInt(value: number | undefined, fallback: number, minimum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(minimum, Math.floor(value))
}

function stageKey(stage: string): string {
  return typeof stage === 'string' ? stage.trim().slice(0, MAX_STAGE_LENGTH) : ''
}

export function percentile(sortedSamples: readonly number[], quantile: number): number {
  if (sortedSamples.length === 0 || !Number.isFinite(quantile)) return 0
  const q = Math.min(1, Math.max(0, quantile))
  const rank = Math.ceil(q * sortedSamples.length)
  const index = Math.min(sortedSamples.length - 1, Math.max(0, rank - 1))
  return sortedSamples[index]
}

function summarize(stage: string, samples: readonly number[]): StageLatency {
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    stage,
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  }
}

export class RequestMetrics {
  private readonly maxSamplesPerStage: number
  private readonly maxStages: number
  private readonly samples = new Map<string, number[]>()

  constructor(options: RequestMetricsOptions = {}) {
    this.maxSamplesPerStage = boundedInt(options.maxSamplesPerStage, DEFAULT_MAX_SAMPLES_PER_STAGE, 1)
    this.maxStages = boundedInt(options.maxStages, DEFAULT_MAX_STAGES, 1)
  }

  record(stage: string, durationMs: number): void {
    const key = stageKey(stage)
    if (!key || !Number.isFinite(durationMs) || durationMs < 0) return
    const existing = this.samples.get(key)
    if (existing) {
      existing.push(durationMs)
      if (existing.length > this.maxSamplesPerStage) {
        existing.splice(0, existing.length - this.maxSamplesPerStage)
      }
      return
    }
    if (this.samples.size >= this.maxStages) {
      const oldest = this.samples.keys().next().value
      if (oldest !== undefined) this.samples.delete(oldest)
    }
    this.samples.set(key, [durationMs])
  }

  startTimer(stage: string): () => void {
    const key = stageKey(stage)
    const startedAt = Date.now()
    let ended = false
    return () => {
      if (ended || !key) return
      ended = true
      this.record(key, Date.now() - startedAt)
    }
  }

  get(stage: string): StageLatency | null {
    const key = stageKey(stage)
    const samples = key ? this.samples.get(key) : undefined
    return samples ? summarize(key, samples) : null
  }

  snapshot(): StageLatency[] {
    return Array.from(this.samples, ([stage, samples]) => summarize(stage, samples))
  }

  reset(stage?: string): void {
    if (stage === undefined) {
      this.samples.clear()
      return
    }
    const key = stageKey(stage)
    if (key) this.samples.delete(key)
  }
}

export const bargainRequestMetrics = new RequestMetrics({ maxSamplesPerStage: 500, maxStages: 12 })
