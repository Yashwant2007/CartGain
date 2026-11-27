import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bargainConfigUpsertSchema } from '@/lib/validation/bargain'

describe('bargain session timeout validation', () => {
  it('accepts the 24-hour negotiation memory default', () => {
    expect(bargainConfigUpsertSchema.parse({ sessionTimeout: 86400 }).sessionTimeout).toBe(86400)
  })

  it('rejects timeouts beyond seven days', () => {
    expect(() => bargainConfigUpsertSchema.parse({ sessionTimeout: 604801 })).toThrow()
  })

  it('has an additive migration for existing five-minute sessions', () => {
    const migration = readFileSync(join(
      process.cwd(),
      'prisma/migrations/20261127100000_extend_bargain_session_timeout/migration.sql',
    ), 'utf8')
    expect(migration).toContain('"sessionTimeout"')
    expect(migration).toContain('86400')
    expect(migration).toContain('300')
  })
})
