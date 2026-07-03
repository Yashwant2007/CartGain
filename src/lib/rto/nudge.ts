import prisma from '@/lib/db'
import { defaultScorer } from './scorer'
import { generateSecureToken } from '@/lib/links'
import { sendSMS } from '@/lib/services/sms'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import { sendEmail } from '@/lib/services/email'
import { getMerchantConfig, parseWeights, parseThresholds } from './config'
import { logDataAccess } from '@/lib/data-protection'
import type { ScoringInput, AddressInfo, OrderInfo, CustomerInfo, VelocitySignals } from './types'

export interface ScoreOrderParams {
  storeId: string
  orderId: string
  order: OrderInfo
  customer: CustomerInfo
  address: AddressInfo
  velocity?: VelocitySignals
}

export async function scoreAndNudgeOrder(params: ScoreOrderParams): Promise<void> {
  const { storeId, orderId, order, customer, address, velocity = {} } = params

  const config = await getMerchantConfig(storeId)
  if (!config.rtoReductionEnabled) return

  const weights = parseWeights(config.rtoWeights)
  const thresholds = parseThresholds(config.rtoThresholds)

  const pincodeStats = await prisma.pincodeStats.findUnique({
    where: { storeId_pincode: { storeId, pincode: address.pincode } },
  })

  const input: ScoringInput = {
    order,
    customer,
    address,
    pincodeStats: pincodeStats
      ? {
          orders: pincodeStats.orders,
          codOrders: pincodeStats.codOrders,
          codRtos: pincodeStats.codRtos,
          rtoRate: pincodeStats.rtoRate,
          codRtoRate: pincodeStats.codRtoRate,
        }
      : null,
    velocity,
  }

  const riskScore = defaultScorer.score(input, { weights, thresholds })

  await prisma.rtoRiskScore.upsert({
    where: { storeId_orderId: { storeId, orderId } },
    create: {
      orderId,
      storeId,
      score: riskScore.score,
      band: riskScore.band,
      reasons: riskScore.reasons as any,
    },
    update: {
      score: riskScore.score,
      band: riskScore.band,
      reasons: riskScore.reasons as any,
    },
  })

  await logDataAccess({
    actorType: 'system',
    action: 'score',
    resourceType: 'rto_risk_score',
    resourceId: orderId,
    actorId: storeId,
    purpose: 'RTO risk scoring',
    metadata: { score: riskScore.score, band: riskScore.band, reasonCount: riskScore.reasons.length },
  })

  const category = (order.category || '').toLowerCase()
  const enabledCategories = config.rtoEnabledCategories
  const categoryAllowed = enabledCategories.length === 0 || enabledCategories.includes(category)

  if ((riskScore.band === 'MEDIUM' || riskScore.band === 'HIGH') && categoryAllowed) {
    await sendNudge({ storeId, orderId, riskScore: riskScore.score, customer, incentive: config.rtoIncentive })
  }
}

interface NudgeParams {
  storeId: string
  orderId: string
  riskScore: number
  customer: CustomerInfo
  incentive: number
}

async function sendNudge(params: NudgeParams): Promise<void> {
  const { storeId, orderId, riskScore, customer, incentive } = params

  const token = generateSecureToken(`${storeId}:${orderId}`)
  const resumeUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/r/cod-confirm/${token}`
  const prepaidUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/r/cod-to-prepaid/${token}`

  const channels = customer.phone ? ['whatsapp', 'sms'] : ['email']

  for (const channel of channels) {
    let sent = false
    let messageId: string | undefined

    if (channel === 'whatsapp' && customer.phone) {
      const msg = incentive > 0
        ? `Hi! Your COD order has a high RTO risk. Switch to prepaid & save ₹${incentive}! Convert here: ${prepaidUrl}`
        : `Hi! Your COD order needs confirmation. Confirm here: ${resumeUrl}`
      const result = await sendWhatsAppMessage({ to: customer.phone, content: msg })
      sent = result.success
      messageId = result.messageId
    } else if (channel === 'sms' && customer.phone) {
      const msg = incentive > 0
        ? `Switch to prepaid & save ₹${incentive}! Click: ${prepaidUrl} - CartGain`
        : `Confirm your COD order: ${resumeUrl} - CartGain`
      const result = await sendSMS({ to: customer.phone, body: msg })
      sent = result.success
      messageId = result.messageId
    } else if (channel === 'email' && customer.email) {
      const subject = 'Confirm Your Order'
      const html = incentive > 0
        ? `<p>Switch to prepaid & save ₹${incentive}!</p><a href="${prepaidUrl}">Pay Now</a>`
        : `<p>Please confirm your COD order:</p><a href="${resumeUrl}">Confirm Order</a>`
      const result = await sendEmail({ to: customer.email, subject, html })
      sent = result.success
      messageId = result.messageId
    }

    await prisma.codNudge.create({
      data: {
        storeId,
        orderId,
        channel,
        status: sent ? 'sent' : 'failed',
        linkToken: token,
        incentive,
        riskScore,
      },
    })

    await logDataAccess({
      actorType: 'system',
      action: sent ? 'nudge_sent' : 'nudge_failed',
      resourceType: 'cod_nudge',
      resourceId: orderId,
      actorId: storeId,
      purpose: 'COD to prepaid nudge',
      metadata: { channel, incentive, riskScore, status: sent ? 'sent' : 'failed' },
    })
  }
}

export async function markNudgeConverted(linkToken: string): Promise<boolean> {
  const nudge = await prisma.codNudge.findUnique({ where: { linkToken } })
  if (!nudge || nudge.status === 'converted') return false

  await prisma.codNudge.update({
    where: { linkToken },
    data: { status: 'converted', convertedAt: new Date() },
  })

  await logDataAccess({
    actorType: 'system',
    action: 'nudge_converted',
    resourceType: 'cod_nudge',
    resourceId: nudge.orderId,
    actorId: nudge.storeId,
    purpose: 'COD to prepaid nudge conversion',
    metadata: { channel: nudge.channel, linkToken },
  })

  return true
}

export async function updatePincodeStats(storeId: string, pincode: string, isCod: boolean, isRto: boolean): Promise<void> {
  const stats = await prisma.pincodeStats.findUnique({
    where: { storeId_pincode: { storeId, pincode } },
  })

  const orders = (stats?.orders ?? 0) + 1
  const codOrders = (stats?.codOrders ?? 0) + (isCod ? 1 : 0)
  const codRtos = (stats?.codRtos ?? 0) + (isRto ? 1 : 0)
  const rtoRate = orders > 0 ? codRtos / orders : 0
  const codRtoRate = codOrders > 0 ? codRtos / codOrders : 0

  await prisma.pincodeStats.upsert({
    where: { storeId_pincode: { storeId, pincode } },
    create: { storeId, pincode, orders, codOrders, codRtos, rtoRate, codRtoRate },
    update: { orders, codOrders, codRtos, rtoRate, codRtoRate },
  })
}

export async function updateCustomerAggregates(
  storeId: string,
  customerId: string,
  data: { email?: string; phone?: string; isCod?: boolean; isRto?: boolean; isCancellation?: boolean }
): Promise<void> {
  const existing = await prisma.customer.findUnique({
    where: { storeId_customerId: { storeId, customerId } },
  })

  const updateData: Record<string, unknown> = {
    totalOrders: (existing?.totalOrders ?? 0) + 1,
    codOrders: (existing?.codOrders ?? 0) + (data.isCod ? 1 : 0),
    codRtos: (existing?.codRtos ?? 0) + (data.isRto ? 1 : 0),
    cancellations: (existing?.cancellations ?? 0) + (data.isCancellation ? 1 : 0),
    lastOrderAt: new Date(),
  }
  if (!existing?.firstOrderAt) updateData.firstOrderAt = new Date()
  if (data.email) updateData.email = data.email
  if (data.phone) updateData.phone = data.phone

  await prisma.customer.upsert({
    where: { storeId_customerId: { storeId, customerId } },
    create: {
      storeId,
      customerId,
      email: data.email ?? existing?.email ?? null,
      phone: data.phone ?? existing?.phone ?? null,
      ...updateData,
    } as never,
    update: updateData as never,
  })
}
