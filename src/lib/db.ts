import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function resolveDatabaseUrl(): string | undefined {
  const appDataEnv = (process.env.APP_DATA_ENV || process.env.NODE_ENV || 'development').toLowerCase()

  if (appDataEnv === 'production') {
    return process.env.DATABASE_URL
  }

  return process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = resolveDatabaseUrl()

  if (!databaseUrl) {
    return new PrismaClient()
  }

  if ((process.env.APP_DATA_ENV || process.env.NODE_ENV || 'development').toLowerCase() !== 'production' && !process.env.TEST_DATABASE_URL && process.env.NODE_ENV !== 'test') {
    console.warn('TEST_DATABASE_URL is not set. Test and production data are not fully separated yet.')
  }

  // Use pooled URL for serverless (PgBouncer) — do NOT force connection_limit=1
  // as that starves concurrent queries. PgBouncer's default_pool_size governs the
  // actual cap. If the URL already has ?pgbouncer=true from the env, keep it;
  // otherwise append it for transaction-mode pooling.
  const dbUrl = databaseUrl.includes('pgbouncer')
    ? databaseUrl
    : `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}pgbouncer=true`

  return new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
  })
}

export const prisma =
  globalForPrisma.prisma ??
  createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
