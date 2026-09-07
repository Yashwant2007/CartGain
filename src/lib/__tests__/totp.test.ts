jest.mock('qrcode', () => ({
  toDataURL: jest.fn(async () => `data:image/png;base64,${Buffer.from('mock-qr').toString('base64')}`),
}))

import { generateTotpSecret, generateOtpauthUrl, verifyTotpCode, getTotpCode, generateQrCodeDataUrl } from '../totp'

describe('TOTP (2FA)', () => {
  describe('generateTotpSecret', () => {
    it('generates a base32 secret', () => {
      const secret = generateTotpSecret()
      expect(secret).toMatch(/^[A-Z2-7]+$/)
      expect(secret.length).toBeGreaterThanOrEqual(32)
    })

    it('generates unique secrets', () => {
      const a = generateTotpSecret()
      const b = generateTotpSecret()
      expect(a).not.toBe(b)
    })
  })

  describe('generateOtpauthUrl', () => {
    it('produces a valid otpauth TOTP URL', () => {
      const secret = generateTotpSecret()
      const url = generateOtpauthUrl(secret, 'dev@cart-gain.com', 'CartGain')
      expect(url).toContain('otpauth://totp/')
      expect(url).toContain(`secret=${secret}`)
      expect(url).toContain('issuer=CartGain')
      expect(url).toContain('algorithm=SHA1')
      expect(url).toContain('digits=6')
      expect(url).toContain('period=30')
    })
  })

  describe('verifyTotpCode', () => {
    it('accepts the current code', () => {
      const secret = generateTotpSecret()
      const code = getTotpCode(secret)
      expect(verifyTotpCode(secret, code)).toBe(true)
    })

    it('rejects a wrong code', () => {
      const secret = generateTotpSecret()
      expect(verifyTotpCode(secret, '000000')).toBe(false)
    })
  })

  describe('generateQrCodeDataUrl', () => {
    it('returns a PNG data URL (not the deprecated Google Charts URL)', async () => {
      const secret = generateTotpSecret()
      const url = await generateQrCodeDataUrl(secret, 'dev@cart-gain.com')
      expect(url).toBe(`data:image/png;base64,${Buffer.from('mock-qr').toString('base64')}`)
      expect(url.startsWith('data:image/png;base64,')).toBe(true)
      expect(url).not.toContain('chart.googleapis.com')
    })
  })
})