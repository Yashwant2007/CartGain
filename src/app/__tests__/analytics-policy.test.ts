import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(process.cwd())

describe('analytics policy assets', () => {
  it('allows Google Analytics origins in the public CSP', () => {
    const config = readFileSync(join(root, 'next.config.js'), 'utf8')
    expect(config).toContain('https://www.googletagmanager.com')
    expect(config).toContain('https://www.google-analytics.com')
  })

  it('publishes llms.txt with markdown links', () => {
    const llms = readFileSync(join(root, 'public', 'llms.txt'), 'utf8')
    expect(llms.startsWith('# CartGain')).toBe(true)
    expect(llms).toMatch(/\[Website\]\(https:\/\/cart-gain\.com\)/)
    expect(llms).toMatch(/\[Privacy Policy\]\(https:\/\/cart-gain\.com\/privacy\)/)
  })

  it('discloses Google Analytics in the legal copy', () => {
    const cookies = readFileSync(join(root, 'src', 'app', '(site)', 'cookies', 'page.tsx'), 'utf8')
    const privacy = readFileSync(join(root, 'src', 'app', '(site)', 'privacy', 'page.tsx'), 'utf8')
    expect(cookies).toContain('Google Analytics')
    expect(cookies).toContain('_ga')
    expect(cookies).not.toContain('We do not use Google Analytics')
    expect(privacy).toContain('Google Analytics')
  })
})
