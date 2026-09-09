import {
  isMessageAttributable,
  computeRefundNetting,
  ATTRIBUTABLE_MESSAGE_STATUSES,
} from '@/lib/attribution'

const HOUR = 60 * 60 * 1000
const NOW = new Date('2026-09-09T10:00:00Z')

describe('isMessageAttributable — canonical attribution eligibility', () => {
  it('attributes a sent message inside the window and before the order', () => {
    expect(isMessageAttributable({
      messageStatus: 'sent',
      sentAt: new Date(NOW.getTime() - 2 * HOUR),
      orderCreatedAt: NOW,
    })).toBe(true)
  })

  it('attributes a delivered message', () => {
    expect(isMessageAttributable({
      messageStatus: 'delivered',
      sentAt: new Date(NOW.getTime() - HOUR),
      orderCreatedAt: NOW,
    })).toBe(true)
  })

  it('never attributes failed/pending messages', () => {
    for (const status of ['failed', 'pending', 'processing', '']) {
      expect(isMessageAttributable({ messageStatus: status, sentAt: new Date(NOW.getTime() - HOUR), orderCreatedAt: NOW })).toBe(false)
    }
  })

  it('never attributes a message with no sentAt', () => {
    expect(isMessageAttributable({ messageStatus: 'sent', sentAt: null, orderCreatedAt: NOW })).toBe(false)
  })

  it('never attributes a message sent AFTER the order (message cannot cause an earlier order)', () => {
    expect(isMessageAttributable({ messageStatus: 'sent', sentAt: new Date(NOW.getTime() + 1000), orderCreatedAt: NOW })).toBe(false)
  })

  it('never attributes a message outside the window', () => {
    expect(isMessageAttributable({
      messageStatus: 'sent',
      sentAt: new Date(NOW.getTime() - 73 * HOUR),
      orderCreatedAt: NOW,
      windowHours: 72,
    })).toBe(false)
  })

  it('attributes exactly at the window boundary', () => {
    expect(isMessageAttributable({
      messageStatus: 'sent',
      sentAt: new Date(NOW.getTime() - 72 * HOUR),
      orderCreatedAt: NOW,
      windowHours: 72,
    })).toBe(true)
  })

  it('the default window is the platform standard (72h)', () => {
    expect(isMessageAttributable({ messageStatus: 'sent', sentAt: new Date(NOW.getTime() - 71 * HOUR), orderCreatedAt: NOW })).toBe(true)
    expect(isMessageAttributable({ messageStatus: 'sent', sentAt: new Date(NOW.getTime() - 73 * HOUR), orderCreatedAt: NOW })).toBe(false)
  })
})

describe('computeRefundNetting — recognized revenue is net of cumulative refunds', () => {
  it('full refund zeros recognized revenue and reverses the recovered-cart count', () => {
    const r = computeRefundNetting({
      recoveredValue: 1000,
      netRevenue: 900,
      prevTotalRefunded: 0,
      refundAmount: 1000,
      reason: 'refund',
    })
    expect(r.newTotalRefunded).toBe(1000)
    expect(r.deltaRefunded).toBe(1000)
    expect(r.recognizedNet).toBe(0)
    expect(r.fullyRefunded).toBe(true)
    expect(r.analyticsRevenueDelta).toBe(1000)
    expect(r.analyticsCartsDelta).toBe(-1)
  })

  it('cancellation always nets the full recovered value', () => {
    const r = computeRefundNetting({
      recoveredValue: 2500,
      netRevenue: 2200,
      prevTotalRefunded: 0,
      refundAmount: 0,
      reason: 'cancelled',
    })
    expect(r.newTotalRefunded).toBe(2500)
    expect(r.recognizedNet).toBe(0)
    expect(r.fullyRefunded).toBe(true)
  })

  it('partial refunds reduce recognized revenue without reversing the cart count', () => {
    const r = computeRefundNetting({
      recoveredValue: 1000,
      netRevenue: 900,
      prevTotalRefunded: 0,
      refundAmount: 300,
      reason: 'refund',
    })
    expect(r.newTotalRefunded).toBe(300)
    expect(r.recognizedNet).toBe(600)
    expect(r.fullyRefunded).toBe(false)
    expect(r.analyticsCartsDelta).toBe(0)
  })

  it('a second partial refund accumulates and eventually zeroes the revenue', () => {
    const first = computeRefundNetting({ recoveredValue: 1000, netRevenue: 900, prevTotalRefunded: 0, refundAmount: 600, reason: 'refund' })
    expect(first.recognizedNet).toBe(300)
    const second = computeRefundNetting({ recoveredValue: 1000, netRevenue: 900, prevTotalRefunded: first.newTotalRefunded, refundAmount: 500, reason: 'refund' })
    expect(second.newTotalRefunded).toBe(1000)
    expect(second.deltaRefunded).toBe(400)
    expect(second.recognizedNet).toBe(0)
    expect(second.fullyRefunded).toBe(true)
    expect(second.analyticsCartsDelta).toBe(-1)
  })

  it('never over-refunds past recovered value', () => {
    const r = computeRefundNetting({ recoveredValue: 1000, netRevenue: 900, prevTotalRefunded: 0, refundAmount: 99999, reason: 'refund' })
    expect(r.newTotalRefunded).toBe(1000)
    expect(r.recognizedNet).toBe(0)
  })

  it('floors recognized revenue at zero when discounts already shrank it', () => {
    const r = computeRefundNetting({ recoveredValue: 1000, netRevenue: 200, prevTotalRefunded: 0, refundAmount: 400, reason: 'refund' })
    expect(r.recognizedNet).toBe(0)
    expect(r.fullyRefunded).toBe(true)
  })

  it('is idempotent for the same refund replay', () => {
    const full = computeRefundNetting({ recoveredValue: 1000, netRevenue: 900, prevTotalRefunded: 0, refundAmount: 1000, reason: 'refund' })
    const replay = computeRefundNetting({ recoveredValue: 1000, netRevenue: 0, prevTotalRefunded: full.newTotalRefunded, refundAmount: 1000, reason: 'refund' })
    expect(replay.deltaRefunded).toBe(0)
    expect(replay.recognizedNet).toBe(0)
    expect(replay.fullyRefunded).toBe(true)
  })
})

describe('ATTRIBUTABLE_MESSAGE_STATUSES', () => {
  it('lists exactly the statuses that earn credit', () => {
    expect([...ATTRIBUTABLE_MESSAGE_STATUSES]).toEqual(['sent', 'delivered'])
  })
})