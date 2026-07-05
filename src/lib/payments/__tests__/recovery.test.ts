jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn((queries) => Promise.all(queries)),
    merchantConfig: {
      findUnique: jest.fn(),
    },
    paymentAttempt: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    paymentRecoveryCampaign: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    dataAccessLog: {
      create: jest.fn(),
    },
    store: {
      findUnique: jest.fn(),
    },
    cart: {
      findFirst: jest.fn(),
    },
    customer: {
      findFirst: jest.fn(),
    },
  },
}))

jest.mock('@/lib/services/sms', () => ({
  sendSMS: jest.fn(),
}))

jest.mock('@/lib/services/whatsapp', () => ({
  sendWhatsAppMessage: jest.fn(),
}))

jest.mock('@/lib/services/email', () => ({
  sendEmail: jest.fn(),
}))

jest.mock('@/lib/data-protection', () => ({
  logDataAccess: jest.fn(),
  redactSensitive: (v: unknown) => v,
}))

jest.mock('@/lib/links', () => ({
  generateSecureToken: jest.fn(() => 'mock-token'),
}))

import prisma from '@/lib/db'
import { sendSMS } from '@/lib/services/sms'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import { sendEmail } from '@/lib/services/email'
import { handlePaymentFailure, markPaymentRecovered, getPendingRetries } from '@/lib/payments/recovery'
import type { GatewayPaymentEvent } from '@/lib/payments/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any

describe('Payment Recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('handlePaymentFailure', () => {
    const baseEvent: GatewayPaymentEvent = {
      id: 'evt_1',
      gateway: 'razorpay',
      gatewayEventId: 'gateway_evt_1',
      orderRef: 'ord_1',
      merchantId: 'store_1',
      amount: 2999,
      currency: 'INR',
      status: 'failed',
      failureReasonRaw: 'bank down try again',
      method: 'upi',
    }

    const customerContact = {
      email: 'test@example.com',
      phone: '+919999999999',
    }

    it('should skip if payment recovery is disabled', async () => {
      mockPrisma.merchantConfig.findUnique.mockResolvedValue({
        id: 'cfg_1',
        storeId: 'store_1',
        rtoReductionEnabled: false,
        paymentRecoveryEnabled: false,
        rtoWeights: {},
        rtoThresholds: {},
        rtoIncentive: 0,
        rtoEnabledCategories: [],
        paymentRetrySchedule: {},
        paymentChannelPriority: [],
        paymentIncentive: 0,
        paymentEnabledGateways: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never)

      await handlePaymentFailure(baseEvent, customerContact)

      expect(mockPrisma.paymentAttempt.upsert).not.toHaveBeenCalled()
    })

    it('should create payment attempt and send recovery message', async () => {
      mockPrisma.merchantConfig.findUnique.mockResolvedValue({
        id: 'cfg_1',
        storeId: 'store_1',
        rtoReductionEnabled: false,
        paymentRecoveryEnabled: true,
        rtoWeights: {},
        rtoThresholds: {},
        rtoIncentive: 0,
        rtoEnabledCategories: [],
        paymentRetrySchedule: {},
        paymentChannelPriority: [],
        paymentIncentive: 0,
        paymentEnabledGateways: ['razorpay'],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never)

      mockPrisma.paymentAttempt.upsert.mockResolvedValue({
        id: 'attempt_1',
        merchantId: 'store_1',
        orderRef: 'ord_1',
        gateway: 'razorpay',
        gatewayEventId: 'gateway_evt_1',
        amount: 2999,
        currency: 'INR',
        status: 'failed',
        failureCategory: 'bank_downtime',
        retryable: true,
      } as never)

      mockPrisma.paymentRecoveryCampaign.create.mockResolvedValue({} as never)
      mockPrisma.dataAccessLog.create.mockResolvedValue({} as never)

      ;(sendWhatsAppMessage as jest.Mock).mockResolvedValue({ success: true, messageId: 'wamid_1' })

      await handlePaymentFailure(baseEvent, customerContact)

      expect(mockPrisma.paymentAttempt.upsert).toHaveBeenCalled()
      expect(sendWhatsAppMessage).toHaveBeenCalledWith(
        expect.objectContaining({ to: customerContact.phone })
      )
    })

    it('should classify and handle non-retryable failures', async () => {
      mockPrisma.merchantConfig.findUnique.mockResolvedValue({
        id: 'cfg_1',
        storeId: 'store_1',
        rtoReductionEnabled: false,
        paymentRecoveryEnabled: true,
        rtoWeights: {},
        rtoThresholds: {},
        rtoIncentive: 0,
        rtoEnabledCategories: [],
        paymentRetrySchedule: {},
        paymentChannelPriority: [],
        paymentIncentive: 0,
        paymentEnabledGateways: ['razorpay'],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never)

      const unknownEvent: GatewayPaymentEvent = {
        ...baseEvent,
        failureReasonRaw: 'some random error',
        method: 'card',
      }

      await handlePaymentFailure(unknownEvent, customerContact)

      expect(mockPrisma.paymentRecoveryCampaign.create).not.toHaveBeenCalled()
    })

    it('should use email when phone is not available', async () => {
      mockPrisma.merchantConfig.findUnique.mockResolvedValue({
        id: 'cfg_1',
        storeId: 'store_1',
        rtoReductionEnabled: false,
        paymentRecoveryEnabled: true,
        rtoWeights: {},
        rtoThresholds: {},
        rtoIncentive: 0,
        rtoEnabledCategories: [],
        paymentRetrySchedule: {},
        paymentChannelPriority: [],
        paymentIncentive: 0,
        paymentEnabledGateways: ['razorpay'],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never)

      mockPrisma.paymentAttempt.upsert.mockResolvedValue({
        id: 'attempt_3',
        failureCategory: 'otp_failure',
        retryable: true,
      } as never)

      mockPrisma.paymentRecoveryCampaign.create.mockResolvedValue({} as never)
      mockPrisma.dataAccessLog.create.mockResolvedValue({} as never)

      ;(sendEmail as jest.Mock).mockResolvedValue({ success: true, messageId: 'email_1' })

      await handlePaymentFailure(baseEvent, { email: customerContact.email })

      expect(sendEmail).toHaveBeenCalled()
      expect(sendWhatsAppMessage).not.toHaveBeenCalled()
      expect(sendSMS).not.toHaveBeenCalled()
    })
  })

  describe('markPaymentRecovered', () => {
    it('should mark campaign and attempt as recovered', async () => {
      mockPrisma.paymentRecoveryCampaign.findUnique.mockResolvedValue({
        id: 'campaign_1',
        attemptId: 'attempt_1',
        channel: 'whatsapp',
        status: 'sent',
        resumeLinkToken: 'token_1',
      } as never)

      mockPrisma.paymentAttempt.findUnique.mockResolvedValue({
        id: 'attempt_1',
        merchantId: 'store_1',
      } as never)

      mockPrisma.paymentRecoveryCampaign.update.mockResolvedValue({} as never)
      mockPrisma.paymentAttempt.update.mockResolvedValue({} as never)
      mockPrisma.dataAccessLog.create.mockResolvedValue({} as never)

      const result = await markPaymentRecovered('token_1')

      expect(result).toBe(true)
      expect(mockPrisma.paymentRecoveryCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { resumeLinkToken: 'token_1' },
          data: expect.objectContaining({ status: 'recovered' }),
        })
      )
      expect(mockPrisma.paymentAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'attempt_1' },
          data: { status: 'success' },
        })
      )
    })

    it('should return false for already recovered campaigns', async () => {
      mockPrisma.paymentRecoveryCampaign.findUnique.mockResolvedValue({
        id: 'campaign_1',
        status: 'recovered',
      } as never)

      const result = await markPaymentRecovered('token_1')
      expect(result).toBe(false)
    })
  })

  describe('getPendingRetries', () => {
    it('should return campaigns due for retry', async () => {
      const futureDate = new Date(Date.now() - 1000)
      mockPrisma.paymentRecoveryCampaign.findMany.mockResolvedValue([
        {
          id: 'campaign_1',
          nextRetryAt: futureDate,
          attempt: {
            paymentRecoveryCampaigns: [],
          },
        },
        {
          id: 'campaign_2',
          nextRetryAt: futureDate,
          attempt: {
            paymentRecoveryCampaigns: [],
          },
        },
      ] as never)

      const results = await getPendingRetries()

      expect(results.length).toBe(2)
      expect(results[0].id).toBe('campaign_1')
    })

    it('should return empty array when no retries due', async () => {
      mockPrisma.paymentRecoveryCampaign.findMany.mockResolvedValue([])

      const results = await getPendingRetries()

      expect(results.length).toBe(0)
    })
  })
})
