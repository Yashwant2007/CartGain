import { classifyFailure } from '../failure-classifier'

describe('classifyFailure', () => {
  it('should classify bank downtime', () => {
    const result = classifyFailure('bank down try again later')
    expect(result.category).toBe('bank_downtime')
    expect(result.retryable).toBe(true)
  })

  it('should classify UPI timeout', () => {
    const result = classifyFailure('upi payment timeout expired')
    expect(result.category).toBe('upi_timeout')
    expect(result.retryable).toBe(true)
  })

  it('should classify OTP failure', () => {
    const result = classifyFailure('incorrect otp entered')
    expect(result.category).toBe('otp_failure')
    expect(result.retryable).toBe(true)
  })

  it('should classify insufficient funds', () => {
    const result = classifyFailure('insufficient fund in account')
    expect(result.category).toBe('insufficient_funds')
    expect(result.retryable).toBe(true)
  })

  it('should classify user dropped', () => {
    const result = classifyFailure('user cancelled the payment')
    expect(result.category).toBe('user_dropped')
    expect(result.retryable).toBe(true)
  })

  it('should classify gateway error', () => {
    const result = classifyFailure('gateway timeout error occurred')
    expect(result.category).toBe('gateway_error')
    expect(result.retryable).toBe(true)
  })

  it('should return unknown for unrecognized reasons', () => {
    const result = classifyFailure('some random error message')
    expect(result.category).toBe('unknown')
    expect(result.retryable).toBe(false)
  })

  it('should default UPI method to upi_timeout', () => {
    const result = classifyFailure('error', 'upi')
    expect(result.category).toBe('upi_timeout')
  })

  it('should handle empty reason', () => {
    const result = classifyFailure('')
    expect(result.category).toBe('unknown')
  })
})
