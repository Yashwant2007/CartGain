/**
 * Overage is consumed capacity, so it must be invoiced even when the total is
 * below the ₹100 revenue-share floor. Pure revenue share still waits for ₹100.
 */
import { shouldInvoice } from '@/lib/jobs/processRevenueShareBilling'

describe('shouldInvoice — overage bills below the ₹100 floor', () => {
  it('invoices tiny overage immediately (billed below ₹100)', () => {
    expect(shouldInvoice(3, 3)).toBe(true)
    expect(shouldInvoice(1, 1)).toBe(true)
    expect(shouldInvoice(99, 99)).toBe(true)
  })

  it('holds pure revenue share under ₹100 for the next sweep', () => {
    expect(shouldInvoice(99, 0)).toBe(false)
    expect(shouldInvoice(0.5, 0)).toBe(false)
  })

  it('invoices pure revenue share once it reaches ₹100', () => {
    expect(shouldInvoice(100, 0)).toBe(true)
    expect(shouldInvoice(250, 0)).toBe(true)
  })

  it('never invoices a zero/negative total', () => {
    expect(shouldInvoice(0, 0)).toBe(false)
    expect(shouldInvoice(-5, 5)).toBe(false)
  })
})
