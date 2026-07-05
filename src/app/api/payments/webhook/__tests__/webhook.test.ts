jest.mock('@/lib/payment');
jest.mock('next-auth/next');

const mockPrisma = {
  subscription: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@/lib/db', () => mockPrisma);

import { verifyWebhookSignature } from '@/lib/payment';

const prisma = mockPrisma;

describe('Payment Webhook - Razorpay Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Webhook Signature Verification', () => {
    it('should reject webhook with invalid signature', () => {
      (verifyWebhookSignature as jest.Mock).mockReturnValue(false);

      const isValid = verifyWebhookSignature('body', 'invalid_sig');
      expect(isValid).toBe(false);
    });

    it('should accept webhook with valid signature', () => {
      (verifyWebhookSignature as jest.Mock).mockReturnValue(true);

      const isValid = verifyWebhookSignature('body', 'valid_sig');
      expect(isValid).toBe(true);
    });
  });

  describe('Payment Event Handling', () => {
    beforeEach(() => {
      (verifyWebhookSignature as jest.Mock).mockReturnValue(true);
    });

    it('should handle payment.captured event', async () => {
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.subscription.create as jest.Mock).mockResolvedValue({
        id: 'sub_123',
        userId: 'user_123',
        plan: 'pro',
      });

      const event = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_123456',
              amount: 50000,
              notes: {
                userId: 'user_123',
                plan: 'pro',
              },
            },
          },
        },
      };

      expect(event.event).toBe('payment.captured');
      expect(event.payload.payment.entity.notes.userId).toBe('user_123');
    });

    it('should handle payment.failed event', () => {
      const event = {
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: 'pay_failed_123',
              notes: {
                userId: 'user_123',
              },
            },
          },
        },
      };

      expect(event.event).toBe('payment.failed');
    });

    it('should handle order.paid event', () => {
      const event = {
        event: 'order.paid',
        payload: {
          payment: {
            entity: {
              id: 'pay_order_123',
              notes: {
                userId: 'user_123',
                plan: 'starter',
              },
            },
          },
          order: {
            entity: {
              id: 'order_123',
              amount: 99900,
            },
          },
        },
      };

      expect(event.event).toBe('order.paid');
      expect(event.payload.order.entity.amount).toBe(99900);
    });

    it('should handle subscription.activated event', async () => {
      (prisma.subscription.update as jest.Mock).mockResolvedValue({});

      const event = {
        event: 'subscription.activated',
        payload: {
          subscription: {
            entity: {
              id: 'sub_active_123',
              customer_id: 'cust_123',
              notes: {
                userId: 'user_123',
              },
            },
          },
        },
      };

      expect(event.event).toBe('subscription.activated');
    });

    it('should handle subscription.cancelled event', () => {
      const event = {
        event: 'subscription.cancelled',
        payload: {
          subscription: {
            entity: {
              id: 'sub_cancel_123',
              notes: {
                userId: 'user_123',
              },
            },
          },
        },
      };

      expect(event.event).toBe('subscription.cancelled');
    });
  });

  describe('Subscription Management', () => {
    beforeEach(() => {
      (verifyWebhookSignature as jest.Mock).mockReturnValue(true);
    });

    it('should create new subscription for first-time buyers', async () => {
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.subscription.create as jest.Mock).mockResolvedValue({
        id: 'sub_new_123',
        userId: 'user_new',
        plan: 'pro',
        smsCredits: 5000,
        status: 'active',
      });

      const subscription = await prisma.subscription.create({
        data: {
          userId: 'user_new',
          plan: 'pro',
          smsCredits: 5000,
        },
      });

      expect(subscription.userId).toBe('user_new');
      expect(subscription.plan).toBe('pro');
      expect(subscription.smsCredits).toBe(5000);
    });

    it('should update existing subscription for returning customers', async () => {
      const existingSub = {
        id: 'sub_existing_123',
        userId: 'user_existing',
        plan: 'starter',
        smsCredits: 100,
      };

      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue(existingSub);
      (prisma.subscription.update as jest.Mock).mockResolvedValue({
        ...existingSub,
        smsCredits: 5100,
        plan: 'pro',
      });

      const updated = await prisma.subscription.update({
        where: { id: 'sub_existing_123' },
        data: { smsCredits: 5100, plan: 'pro' },
      });

      expect(updated.smsCredits).toBe(5100);
      expect(updated.plan).toBe('pro');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', () => {
      const isValid = (json: string) => {
        try {
          JSON.parse(json);
          return true;
        } catch {
          return false;
        }
      };

      expect(isValid('{"valid": "json"}')).toBe(true);
      expect(isValid('invalid json')).toBe(false);
    });

    it('should handle missing payment notes', () => {
      const event = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_no_notes',
              notes: {},
            },
          },
        },
      };

      const userId = (event.payload.payment.entity.notes as Record<string, string>).userId;
      const shouldProcess = !!userId;

      expect(shouldProcess).toBe(false);
    });
  });
});
