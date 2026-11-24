import {
  RECOVERY_DELIVERED_STATUSES,
  RECOVERY_TERMINAL_STATUSES,
  isRecoveryDeliveredStatus,
  isRecoveryTerminalStatus,
} from '@/lib/recovery/message-status'

describe('recovery message statuses', () => {
  it('counts sent, delivered and read messages as delivered to the buyer', () => {
    expect(RECOVERY_DELIVERED_STATUSES).toEqual(['sent', 'delivered', 'read'])
    expect(isRecoveryDeliveredStatus('read')).toBe(true)
    expect(isRecoveryDeliveredStatus('failed')).toBe(false)
  })

  it('treats skipped rows as terminal without treating them as delivered', () => {
    expect(RECOVERY_TERMINAL_STATUSES).toEqual(['sent', 'delivered', 'read', 'skipped'])
    expect(isRecoveryTerminalStatus('skipped')).toBe(true)
    expect(isRecoveryTerminalStatus('pending')).toBe(false)
    expect(isRecoveryDeliveredStatus('skipped')).toBe(false)
  })
})
