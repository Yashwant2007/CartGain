import { bargainConfigUpsertSchema } from '@/lib/validation/bargain'

describe('bargain session timeout validation', () => {
  it('accepts the 24-hour negotiation memory default', () => {
    expect(bargainConfigUpsertSchema.parse({ sessionTimeout: 86400 }).sessionTimeout).toBe(86400)
  })

  it('rejects timeouts beyond seven days', () => {
    expect(() => bargainConfigUpsertSchema.parse({ sessionTimeout: 604801 })).toThrow()
  })
})
