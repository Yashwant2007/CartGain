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

  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  })
}

export const prisma =
  globalForPrisma.prisma ??
  createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
