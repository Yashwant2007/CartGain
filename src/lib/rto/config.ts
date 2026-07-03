import prisma from '@/lib/db'

const DEFAULT_WEIGHTS = {
  address: 20,
  pincode: 20,
  customer: 25,
  order: 15,
  phone: 10,
  velocity: 10,
}

const DEFAULT_THRESHOLDS = {
  low: 30,
  medium: 60,
  high: 100,
}

export async function getMerchantConfig(storeId: string) {
  let config = await prisma.merchantConfig.findUnique({ where: { storeId } })
  if (!config) {
    config = await prisma.merchantConfig.create({
      data: { storeId },
    })
  }
  return config
}

export function parseWeights(raw: unknown) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...DEFAULT_WEIGHTS, ...raw }
  }
  return DEFAULT_WEIGHTS
}

export function parseThresholds(raw: unknown) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...DEFAULT_THRESHOLDS, ...raw }
  }
  return DEFAULT_THRESHOLDS
}

export async function ensureMerchantConfig(storeId: string) {
  return prisma.merchantConfig.upsert({
    where: { storeId },
    create: { storeId },
    update: {},
  })
}
