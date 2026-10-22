import { Prisma } from '@prisma/client'

// Helper to handle Prisma connection pool errors with exponential backoff
export async function withPrismaRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: any
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2024'
      ) {
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1)
          console.warn(`DB pool timeout (P2024), retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`)
          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }
      }
      throw error
    }
  }
  throw lastError
}
