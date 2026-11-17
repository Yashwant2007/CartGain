import {
  databaseHost,
  resolveDataEnvironment,
  validateEnvironmentSeparation,
} from '../env-separation'

describe('environment separation', () => {
  it('resolves preview deployments to staging, not production', () => {
    expect(
      resolveDataEnvironment({ vercelEnv: 'preview', nodeEnv: 'production' })
    ).toBe('staging')
  })

  it('keeps a production Vercel runtime on the production data environment', () => {
    const result = validateEnvironmentSeparation({
      vercelEnv: 'production',
      nodeEnv: 'production',
      appDataEnv: 'production',
      databaseUrl: 'postgresql://user:pass@db.prod.example:5432/app',
      productionDbHosts: 'db.prod.example',
    })
    expect(result.productionRuntime).toBe(true)
    expect(result.dataEnvironment).toBe('production')
    expect(result.errors).toEqual([])
  })

  it('rejects a production runtime pointed at staging data', () => {
    const result = validateEnvironmentSeparation({
      vercelEnv: 'production',
      nodeEnv: 'production',
      appDataEnv: 'staging',
      databaseUrl: 'postgresql://user:pass@db.prod.example:5432/app',
    })
    expect(result.errors.join(' ')).toContain('APP_DATA_ENV=production')
  })

  it('rejects staging/preview pointed at the production host', () => {
    const result = validateEnvironmentSeparation({
      vercelEnv: 'preview',
      nodeEnv: 'production',
      databaseUrl: 'postgresql://user:pass@db.prod.example:5432/app',
      productionDbHosts: 'db.prod.example, db.prod.backup.example',
    })
    expect(result.errors.join(' ')).toContain('production database host')
  })

  it('warns when non-production falls back to DATABASE_URL', () => {
    const result = validateEnvironmentSeparation({
      nodeEnv: 'development',
      databaseUrl: 'postgresql://user:pass@localhost:5432/app',
    })
    expect(result.errors).toEqual([])
    expect(result.warnings.join(' ')).toContain('TEST_DATABASE_URL')
  })

  it('extracts a hostname without leaking credentials', () => {
    expect(databaseHost('postgresql://user:secret@db.example:5432/app')).toBe('db.example')
    expect(databaseHost('not-a-url')).toBeNull()
  })
})
