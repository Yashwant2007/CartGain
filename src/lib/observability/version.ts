/**
 * Release + environment identity for observability.
 * Every error log and product event carries these so we can attribute an
 * incident to a specific deployment.
 */

export function currentEnvironment(): 'production' | 'preview' | 'development' {
  const dataEnv = (process.env.APP_DATA_ENV || '').toLowerCase()
  if (dataEnv === 'production' || dataEnv === 'preview') return dataEnv
  const vercelEnv = (process.env.VERCEL_ENV || '').toLowerCase()
  if (vercelEnv === 'production' || vercelEnv === 'preview') return vercelEnv
  if (process.env.NODE_ENV === 'production') return 'production'
  return 'development'
}

export function isProduction(): boolean {
  return currentEnvironment() === 'production'
}

/** Short commit sha (or 'dev' when not running from a Vercel build). */
export function currentRelease(): string {
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    process.env.RENDER_GIT_COMMIT ||
    ''
  if (!sha) return process.env.NODE_ENV === 'production' ? 'release-unknown' : 'dev'
  return sha.slice(0, 7)
}