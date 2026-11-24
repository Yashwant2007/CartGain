export const RECOVERY_DELIVERED_STATUSES = ['sent', 'delivered', 'read']

export const RECOVERY_TERMINAL_STATUSES = [...RECOVERY_DELIVERED_STATUSES, 'skipped']

export function isRecoveryDeliveredStatus(status: unknown): boolean {
  return typeof status === 'string' && RECOVERY_DELIVERED_STATUSES.includes(status)
}

export function isRecoveryTerminalStatus(status: unknown): boolean {
  return typeof status === 'string' && RECOVERY_TERMINAL_STATUSES.includes(status)
}
