import { Prisma, PrismaClient } from '@prisma/client'

// Suppress url.parse() deprecation from dependencies (ioredis, etc.)
if (typeof process !== 'undefined' && process.noDeprecation === undefined) {
  process.noDeprecation = true
}

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

  const client = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

  // Global retry middleware: retries all queries on transient DB errors (P1001, P1002, P1017)
  const extended = client.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const maxRetries = 2
          const baseDelay = 500
          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
              return await query(args)
            } catch (error) {
              if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                (error.code === 'P1001' || error.code === 'P1002' || error.code === 'P1017')
              ) {
                if (attempt < maxRetries) {
                  const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 200
                  console.warn(`DB ${error.code} (attempt ${attempt + 1}/${maxRetries + 1}), retry in ${Math.round(delay)}ms`)
                  await new Promise(r => setTimeout(r, delay))
                  continue
                }
              }
              throw error
            }
          }
          throw new Error('Unreachable')
        },
      },
    },
  })

  return extended as unknown as PrismaClient
}

export const prisma =
  globalForPrisma.prisma ??
  createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
