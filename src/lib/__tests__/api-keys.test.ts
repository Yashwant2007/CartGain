import { generateApiKey, hashApiKey, maskApiKey } from '../api-keys'

describe('API Key Utilities', () => {
  describe('generateApiKey', () => {
    it('generates a cg_ prefixed raw key', () => {
      const { raw } = generateApiKey('test')
      expect(raw.startsWith('cg_')).toBe(true)
      expect(raw.length).toBeGreaterThan(30)
    })

    it('stores only a SHA-256 hash, never the raw key', () => {
      const { raw, hash } = generateApiKey('test')
      expect(hash).not.toBe(raw)
      expect(hash).toMatch(/^[a-f0-9]{64}$/) // sha256 hex
    })

    it('provides a masked display prefix', () => {
      const { prefix } = generateApiKey('test')
      expect(prefix).toContain('...')
    })
  })

  describe('hashApiKey', () => {
    it('is deterministic and matches generated hash', () => {
      const { raw, hash } = generateApiKey('test')
      expect(hashApiKey(raw)).toBe(hash)
    })

    it('produces different hashes for different keys', () => {
      const a = generateApiKey('test')
      const b = generateApiKey('test')
      expect(hashApiKey(a.raw)).not.toBe(hashApiKey(b.raw))
    })
  })

  describe('maskApiKey', () => {
    it('masks long keys with prefix and suffix', () => {
      const { raw } = generateApiKey('test')
      const masked = maskApiKey(raw)
      expect(masked).toContain('...')
      expect(masked.startsWith('cg_')).toBe(true)
    })
  })
})