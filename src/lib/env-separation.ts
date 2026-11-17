// Guardrails that keep production merchant data out of development, tests and
// preview deployments. The function is pure so it can be tested without a
// database connection.

export type EnvironmentSeparationInput = {
  appDataEnv?: string | null
  vercelEnv?: string | null
  nodeEnv?: string | null
  databaseUrl?: string | null
  testDatabaseUrl?: string | null
  productionDbHosts?: string | null
}

export type EnvironmentSeparationResult = {
  dataEnvironment: string
  productionRuntime: boolean
  errors: string[]
  warnings: string[]
}

function lower(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase()
}

export function resolveDataEnvironment(input: EnvironmentSeparationInput): string {
  const explicit = lower(input.appDataEnv)
  if (explicit) return explicit

  const vercel = lower(input.vercelEnv)
  if (vercel === 'production') return 'production'
  if (vercel === 'preview') return 'staging'
  if (vercel === 'development') return 'development'

  return lower(input.nodeEnv) || 'development'
}

export function databaseHost(databaseUrl: string | null | undefined): string | null {
  if (!databaseUrl) return null
  try {
    return new URL(databaseUrl).hostname.toLowerCase()
  } catch {
    return null
  }
}

function configuredProductionHosts(value: string | null | undefined): string[] {
  return (value || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
}

export function validateEnvironmentSeparation(
  input: EnvironmentSeparationInput
): EnvironmentSeparationResult {
  const dataEnvironment = resolveDataEnvironment(input)
  const vercelEnv = lower(input.vercelEnv)
  const nodeEnv = lower(input.nodeEnv)
  const productionRuntime =
    vercelEnv === 'production' || (!vercelEnv && nodeEnv === 'production')
  const errors: string[] = []
  const warnings: string[] = []

  if (productionRuntime && dataEnvironment !== 'production') {
    errors.push(
      `production runtime is configured to use the ${dataEnvironment} data environment; set APP_DATA_ENV=production`
    )
  }

  if (!productionRuntime && dataEnvironment === 'production') {
    errors.push(
      'non-production runtime is configured with APP_DATA_ENV=production; use a separate test/staging database'
    )
  }

  const host = databaseHost(input.databaseUrl)
  const productionHosts = configuredProductionHosts(input.productionDbHosts)
  if (!productionRuntime && host && productionHosts.includes(host)) {
    errors.push(
      `non-production runtime points at production database host ${host}; configure TEST_DATABASE_URL`
    )
  }

  if (!productionRuntime && input.databaseUrl && !input.testDatabaseUrl) {
    warnings.push(
      'TEST_DATABASE_URL is not set; non-production traffic falls back to DATABASE_URL'
    )
  }

  if (productionRuntime && productionHosts.length === 0) {
    warnings.push(
      'PRODUCTION_DB_HOSTS is not set; the app cannot verify it is pointed at the production database'
    )
  }

  if (productionRuntime && input.testDatabaseUrl && input.testDatabaseUrl === input.databaseUrl) {
    warnings.push('TEST_DATABASE_URL and DATABASE_URL are identical in production configuration')
  }

  return { dataEnvironment, productionRuntime, errors, warnings }
}
