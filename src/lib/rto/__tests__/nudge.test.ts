jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    merchantConfig: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    pincodeStats: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    rtoRiskScore: {
      upsert: jest.fn(),
    },
    codNudge: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    customer: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    dataAccessLog: {
      create: jest.fn(),
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

import prisma from '@/lib/db'
import { sendSMS } from '@/lib/services/sms'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import { sendEmail } from '@/lib/services/email'
import {
  scoreAndNudgeOrder,
  markNudgeConverted,
  updatePincodeStats,
  updateCustomerAggregates,
} from '@/lib/rto/nudge'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any

describe('Nudge Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('scoreAndNudgeOrder', () => {
    const baseParams = {
      storeId: 'store_1',
      orderId: 'ord_1',
      order: {
        id: 'ord_1',
        totalValue: 1000,
        paymentMethod: 'COD',
        category: 'electronics',
      },
      customer: {
        id: 'cust_1',
        email: 'test@example.com',
        phone: '+919999999999',
        totalOrders: 3,
        codOrders: 2,
        codRtos: 0,
        cancellations: 0,
        isFirstTimeBuyer: false,
      },
      address: {
        line1: '123 Main Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        landmark: 'Near Station',
      },
    }

    it('should skip if RTO reduction is disabled', async () => {
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

      await scoreAndNudgeOrder(baseParams)

      expect(mockPrisma.rtoRiskScore.upsert).not.toHaveBeenCalled()
    })

    it('should score and nudge for HIGH risk orders', async () => {
      mockPrisma.merchantConfig.findUnique.mockResolvedValue({
        id: 'cfg_1',
        storeId: 'store_1',
        rtoReductionEnabled: true,
        paymentRecoveryEnabled: false,
        rtoWeights: {},
        rtoThresholds: {},
        rtoIncentive: 10,
        rtoEnabledCategories: [],
        paymentRetrySchedule: {},
        paymentChannelPriority: [],
        paymentIncentive: 0,
        paymentEnabledGateways: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never)

      mockPrisma.pincodeStats.findUnique.mockResolvedValue(null)
      mockPrisma.rtoRiskScore.upsert.mockResolvedValue({} as never)
      mockPrisma.codNudge.create.mockResolvedValue({} as never)
      mockPrisma.dataAccessLog.create.mockResolvedValue({} as never)

      ;(sendWhatsAppMessage as jest.Mock).mockResolvedValue({ success: true, messageId: 'wamid_1' })
      ;(sendSMS as jest.Mock).mockResolvedValue({ success: false })

      await scoreAndNudgeOrder({
        ...baseParams,
        order: { ...baseParams.order, totalValue: 50000, category: 'jewellery' },
        customer: { ...baseParams.customer, isFirstTimeBuyer: true, emailVerified: false },
        address: { ...baseParams.address, pincode: '12' },
      })

      expect(mockPrisma.rtoRiskScore.upsert).toHaveBeenCalled()
      expect(sendWhatsAppMessage).toHaveBeenCalled()
    })

    it('should skip nudge if category not in rtoEnabledCategories', async () => {
      mockPrisma.merchantConfig.findUnique.mockResolvedValue({
        id: 'cfg_1',
        storeId: 'store_1',
        rtoReductionEnabled: true,
        paymentRecoveryEnabled: false,
        rtoWeights: {},
        rtoThresholds: {},
        rtoIncentive: 10,
        rtoEnabledCategories: ['fashion', 'nutraceuticals'],
        paymentRetrySchedule: {},
        paymentChannelPriority: [],
        paymentIncentive: 0,
        paymentEnabledGateways: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never)

      mockPrisma.pincodeStats.findUnique.mockResolvedValue(null)
      mockPrisma.rtoRiskScore.upsert.mockResolvedValue({} as never)

      await scoreAndNudgeOrder({
        ...baseParams,
        order: { ...baseParams.order, totalValue: 50000 },
        customer: { ...baseParams.customer, isFirstTimeBuyer: true },
        address: { ...baseParams.address, pincode: '12' },
      })

      expect(mockPrisma.rtoRiskScore.upsert).toHaveBeenCalled()
      expect(sendWhatsAppMessage).not.toHaveBeenCalled()
    })
  })

  describe('markNudgeConverted', () => {
    it('should mark nudge as converted', async () => {
      mockPrisma.codNudge.findUnique.mockResolvedValue({
        id: 'nudge_1',
        storeId: 'store_1',
        orderId: 'ord_1',
        channel: 'whatsapp',
        status: 'sent',
        linkToken: 'token_1',
      } as never)
      mockPrisma.codNudge.update.mockResolvedValue({} as never)
      mockPrisma.dataAccessLog.create.mockResolvedValue({} as never)

      const result = await markNudgeConverted('token_1')

      expect(result).toBe(true)
      expect(mockPrisma.codNudge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { linkToken: 'token_1' },
          data: expect.objectContaining({ status: 'converted' }),
        })
      )
    })

    it('should return false for already converted nudges', async () => {
      mockPrisma.codNudge.findUnique.mockResolvedValue({
        id: 'nudge_1',
        status: 'converted',
      } as never)

      const result = await markNudgeConverted('token_1')

      expect(result).toBe(false)
      expect(mockPrisma.codNudge.update).not.toHaveBeenCalled()
    })

    it('should return false for non-existent token', async () => {
      mockPrisma.codNudge.findUnique.mockResolvedValue(null)

      const result = await markNudgeConverted('nonexistent')

      expect(result).toBe(false)
    })
  })

  describe('updatePincodeStats', () => {
    it('should create new pincode stats entry', async () => {
      mockPrisma.pincodeStats.findUnique.mockResolvedValue(null)
      mockPrisma.pincodeStats.upsert.mockResolvedValue({} as never)

      await updatePincodeStats('store_1', '400001', true, false)

      expect(mockPrisma.pincodeStats.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { storeId_pincode: { storeId: 'store_1', pincode: '400001' } },
          create: expect.objectContaining({ orders: 1, codOrders: 1, codRtos: 0 }),
        })
      )
    })

    it('should increment existing pincode stats on RTO', async () => {
      mockPrisma.pincodeStats.findUnique.mockResolvedValue({
        id: 'ps_1',
        storeId: 'store_1',
        pincode: '400001',
        orders: 100,
        codOrders: 60,
        codRtos: 3,
        rtoRate: 0.03,
        codRtoRate: 0.05,
      } as never)
      mockPrisma.pincodeStats.upsert.mockResolvedValue({} as never)

      await updatePincodeStats('store_1', '400001', true, true)

      expect(mockPrisma.pincodeStats.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ orders: 101, codOrders: 61, codRtos: 4 }),
        })
      )
    })
  })

  describe('updateCustomerAggregates', () => {
    it('should create new customer aggregates', async () => {
      mockPrisma.customer.findUnique.mockResolvedValue(null)
      mockPrisma.customer.upsert.mockResolvedValue({} as never)

      await updateCustomerAggregates('store_1', 'cust_1', {
        email: 'test@example.com',
        phone: '+919999999999',
        isCod: true,
      })

      expect(mockPrisma.customer.upsert).toHaveBeenCalled()
    })

    it('should update existing customer on RTO', async () => {
      mockPrisma.customer.findUnique.mockResolvedValue({
        id: 'cust_1',
        storeId: 'store_1',
        customerId: 'cust_1',
        totalOrders: 5,
        codOrders: 3,
        codRtos: 1,
        cancellations: 0,
        firstOrderAt: new Date('2024-01-01'),
      } as never)
      mockPrisma.customer.upsert.mockResolvedValue({} as never)

      await updateCustomerAggregates('store_1', 'cust_1', { isCod: true, isRto: true })

      expect(mockPrisma.customer.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            totalOrders: 6,
            codOrders: 4,
            codRtos: 2,
          }),
        })
      )
    })
  })
})
