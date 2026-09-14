import { mapShopifyStatus } from '../subscriptions'

describe('mapShopifyStatus', () => {
  it('maps ACTIVE → active', () => {
    expect(mapShopifyStatus('ACTIVE')).toBe('active')
    expect(mapShopifyStatus('active')).toBe('active')
  })

  it('maps PENDING → pending', () => {
    expect(mapShopifyStatus('PENDING')).toBe('pending')
  })

  it('maps FROZEN → paused', () => {
    expect(mapShopifyStatus('FROZEN')).toBe('paused')
  })

  it('maps CANCELLED/DECLINED/EXPIRED → cancelled', () => {
    expect(mapShopifyStatus('CANCELLED')).toBe('cancelled')
    expect(mapShopifyStatus('DECLINED')).toBe('cancelled')
    expect(mapShopifyStatus('EXPIRED')).toBe('cancelled')
  })

  it('defaults unknown statuses to cancelled', () => {
    expect(mapShopifyStatus(null)).toBe('cancelled')
    expect(mapShopifyStatus(undefined)).toBe('cancelled')
    expect(mapShopifyStatus('UNKNOWN')).toBe('cancelled')
    expect(mapShopifyStatus('')).toBe('cancelled')
  })
})
