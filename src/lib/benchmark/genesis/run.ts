import { runGenesisAdapter } from './adapters'
import { GENESIS_SCENARIOS } from './dataset'
import { evaluateScenario } from './evaluators'
import { buildGenesisReport } from './report'
import type { GenesisReport } from './report'
import type { GenesisCaseResult } from './types'

export async function runGenesisBenchmark(): Promise<GenesisReport> {
  const startedAt = Date.now()
  const cases: GenesisCaseResult[] = []

  for (const scenario of GENESIS_SCENARIOS) {
    for (const engine of ['primary', 'fallback', 'deterministic'] as const) {
      const result = await runGenesisAdapter(engine, scenario)
      cases.push(await evaluateScenario(scenario, result))
    }
  }

  return buildGenesisReport(cases, Date.now() - startedAt)
}

export function summarizeGenesisReport(report: GenesisReport): string {
  const lines = [report.suiteName, `gate=${report.releaseGate.status}`]
  for (const engine of report.engines) {
    lines.push(
      [
        engine.engine,
        `verified=${engine.overall.verifiedWeightedScore ?? 'n/a'}`,
        `simulated=${engine.overall.simulatedUnverifiedWeightedScore ?? 'n/a'}`,
        `live_objective=${engine.overall.liveProviderObjectiveWeightedScore ?? 'n/a'}`,
        `live_unreviewed=${engine.overall.liveProviderUnreviewedWeightedScore ?? 'n/a'}`,
      ].join(' '),
    )
  }
  for (const item of report.releaseGate.items) {
    lines.push(`${item.status}: ${item.id}`)
  }
  return lines.join('\n')
}
