export interface ContributionSession {
  purchasedAt?: Date | null
  purchaseValue?: number | null
  purchaseGrossValue?: number | null
  purchaseRefundedAmount?: number | null
  experimentArm?: string | null
}

export interface CostComponentView {
  code: string
  label: string
  status: 'verified' | 'unavailable'
  amount: number | null
  note: string
}

export interface ContributionView {
  status: 'insufficient_cost_data' | 'measurable'
  verified: {
    eligibleCustomers: number
    purchasedSessions: number
    netSales: number
    grossSales: number
    refunds: number
    discounts: number
    netSalesPerEligibleCustomer: number
  }
  unavailableCosts: CostComponentView[]
  contributionProfit: number | null
  netAfterCartGainSubscription: number | null
  subscriptionFees: number | null
  experiment: {
    enabled: boolean
    treatmentSessions: number
    controlSessions: number
    treatmentNetSalesPerEligible: number | null
    controlNetSalesPerEligible: number | null
    incrementalNetSalesPerEligible: number | null
    note: string
  }
  notes: string[]
}

interface ContributionOptions {
  experimentEnabled?: boolean
  subscriptionFees?: number | null
  minArmSamples?: number
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const safe = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

export function buildContributionView(
  sessions: ContributionSession[],
  options: ContributionOptions = {},
): ContributionView {
  const purchased = sessions.filter((session) => Boolean(session.purchasedAt))
  const netSales = round2(purchased.reduce((sum, session) => sum + Math.max(0, safe(session.purchaseValue)), 0))
  const grossSales = round2(
    purchased.reduce(
      (sum, session) => sum + Math.max(0, safe(session.purchaseGrossValue ?? session.purchaseValue)),
      0,
    ),
  )
  const refunds = round2(purchased.reduce((sum, session) => sum + Math.max(0, safe(session.purchaseRefundedAmount)), 0))
  const discounts = round2(
    purchased.reduce((sum, session) => {
      const gross = Math.max(0, safe(session.purchaseGrossValue ?? session.purchaseValue))
      const net = Math.max(0, safe(session.purchaseValue))
      return sum + Math.max(0, gross - net - Math.max(0, safe(session.purchaseRefundedAmount)))
    }, 0),
  )
  const eligibleCustomers = sessions.length
  const netPerEligible = eligibleCustomers > 0 ? round2(netSales / eligibleCustomers) : 0

  const unavailableCosts: CostComponentView[] = [
    {
      code: 'cogs',
      label: 'Cost of goods sold',
      status: 'unavailable',
      amount: null,
      note: 'Merchant product cost is not stored as verified per-order data.',
    },
    {
      code: 'payment_fees',
      label: 'Payment processing fees',
      status: 'unavailable',
      amount: null,
      note: 'Processor fees are not reconciled per recovered order.',
    },
    {
      code: 'shipping_subsidies',
      label: 'Shipping subsidies',
      status: 'unavailable',
      amount: null,
      note: 'Fulfilment subsidies are not stored as verified per-order data.',
    },
    {
      code: 'messaging_costs',
      label: 'WhatsApp and email costs',
      status: 'unavailable',
      amount: null,
      note: 'Channel costs are not reconciled to each recovered order.',
    },
    {
      code: 'fulfilment_costs',
      label: 'Other variable fulfilment costs',
      status: 'unavailable',
      amount: null,
      note: 'No verified per-order fulfilment cost feed is configured.',
    },
  ]

  const arms = new Map<string, { sessions: number; net: number }>()
  for (const session of sessions) {
    const arm = session.experimentArm === 'treatment' || session.experimentArm === 'control' ? session.experimentArm : null
    if (!arm) continue
    const entry = arms.get(arm) ?? { sessions: 0, net: 0 }
    entry.sessions += 1
    if (session.purchasedAt) entry.net += Math.max(0, safe(session.purchaseValue))
    arms.set(arm, entry)
  }
  const treatment = arms.get('treatment') ?? { sessions: 0, net: 0 }
  const control = arms.get('control') ?? { sessions: 0, net: 0 }
  const minSamples = Math.max(1, Math.floor(options.minArmSamples ?? 20))
  const enough = treatment.sessions >= minSamples && control.sessions >= minSamples
  const treatmentPerEligible = treatment.sessions > 0 ? round2(treatment.net / treatment.sessions) : null
  const controlPerEligible = control.sessions > 0 ? round2(control.net / control.sessions) : null
  const enabled = options.experimentEnabled === true

  const experiment = {
    enabled,
    treatmentSessions: treatment.sessions,
    controlSessions: control.sessions,
    treatmentNetSalesPerEligible: treatmentPerEligible,
    controlNetSalesPerEligible: controlPerEligible,
    incrementalNetSalesPerEligible:
      enabled && enough && treatmentPerEligible !== null && controlPerEligible !== null
        ? round2(treatmentPerEligible - controlPerEligible)
        : null,
    note: !enabled
      ? 'Holdout cohorts are observational; no engine difference is active, so no causal lift is reported.'
      : !enough
        ? `Both arms need at least ${minSamples} eligible customers before lift is reported.`
        : 'Net sales lift is experimentally observed; contribution profit stays unavailable until verified costs are configured.',
  }

  const subscriptionFees =
    typeof options.subscriptionFees === 'number' && Number.isFinite(options.subscriptionFees)
      ? round2(options.subscriptionFees)
      : null
  const notes = [
    'Net sales are refund-adjusted and come only from verified order attribution.',
    'Contribution profit is intentionally null until product, payment, shipping, messaging and fulfilment costs are verified.',
    'Correlation is never presented as causal proof unless a randomized holdout flag is active and both arms have enough samples.',
  ]
  if (subscriptionFees !== null) {
    notes.push('CartGain subscription fees are reported separately and are never counted as recovered revenue.')
  }

  return {
    status: 'insufficient_cost_data',
    verified: {
      eligibleCustomers,
      purchasedSessions: purchased.length,
      netSales,
      grossSales,
      refunds,
      discounts,
      netSalesPerEligibleCustomer: netPerEligible,
    },
    unavailableCosts,
    contributionProfit: null,
    netAfterCartGainSubscription: null,
    subscriptionFees,
    experiment,
    notes,
  }
}
