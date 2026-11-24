import { buildContributionView, type ContributionSession } from '../contribution'

const purchased = (values: Partial<ContributionSession> & { purchaseValue: number }): ContributionSession => ({
  purchasedAt: new Date('2026-01-01T00:00:00Z'),
  purchaseGrossValue: values.purchaseValue,
  ...values,
})

describe('buildContributionView', () => {
  it('uses verified net sales and never invents contribution profit', () => {
    const view = buildContributionView([
      purchased({ purchaseValue: 900, purchaseGrossValue: 1000 }),
      purchased({ purchaseValue: 350, purchaseGrossValue: 500, purchaseRefundedAmount: 100 }),
      { purchaseValue: null },
    ])

    expect(view.verified.netSales).toBe(1250)
    expect(view.verified.grossSales).toBe(1500)
    expect(view.verified.refunds).toBe(100)
    expect(view.verified.discounts).toBe(150)
    expect(view.contributionProfit).toBeNull()
    expect(view.netAfterCartGainSubscription).toBeNull()
    expect(view.status).toBe('insufficient_cost_data')
    expect(view.unavailableCosts.every((cost) => cost.status === 'unavailable' && cost.amount === null)).toBe(true)
  })

  it('reports holdout lift only when enabled and both arms are large enough', () => {
    const sessions: ContributionSession[] = [
      ...Array.from({ length: 20 }, () => ({
        experimentArm: 'treatment',
        ...purchased({ purchaseValue: 100 }),
      })),
      ...Array.from({ length: 20 }, () => ({
        experimentArm: 'control',
        ...purchased({ purchaseValue: 80 }),
      })),
    ]

    expect(buildContributionView(sessions).experiment.incrementalNetSalesPerEligible).toBeNull()
    const enabled = buildContributionView(sessions, { experimentEnabled: true })
    expect(enabled.experiment.incrementalNetSalesPerEligible).toBe(20)
    expect(enabled.experiment.note).toContain('experimentally observed')
  })

  it('withholds causal language when a holdout arm is too small', () => {
    const sessions: ContributionSession[] = [
      ...Array.from({ length: 20 }, () => ({
        experimentArm: 'treatment',
        ...purchased({ purchaseValue: 100 }),
      })),
      { experimentArm: 'control', ...purchased({ purchaseValue: 80 }) },
    ]
    const view = buildContributionView(sessions, { experimentEnabled: true })
    expect(view.experiment.incrementalNetSalesPerEligible).toBeNull()
    expect(view.experiment.note).toContain('at least 20')
  })

  it('keeps CartGain subscription fees separate from contribution profit', () => {
    const view = buildContributionView([purchased({ purchaseValue: 100 })], { subscriptionFees: 49 })
    expect(view.subscriptionFees).toBe(49)
    expect(view.netAfterCartGainSubscription).toBeNull()
    expect(view.notes.join(' ')).toContain('subscription')
  })
})
