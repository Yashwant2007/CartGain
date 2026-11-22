-- Additive WooCommerce/Razorpay billing tables. No existing Shopify billing
-- records, subscriptions, invoices, or entitlements are modified.

CREATE TABLE IF NOT EXISTS "RazorpayCustomer" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "razorpayCustomerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RazorpayCustomer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RazorpayCustomer_storeId_key" ON "RazorpayCustomer"("storeId");
CREATE UNIQUE INDEX IF NOT EXISTS "RazorpayCustomer_razorpayCustomerId_key" ON "RazorpayCustomer"("razorpayCustomerId");
CREATE INDEX IF NOT EXISTS "RazorpayCustomer_userId_idx" ON "RazorpayCustomer"("userId");

CREATE TABLE IF NOT EXISTS "RazorpaySubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "billingPeriod" TEXT NOT NULL DEFAULT 'monthly',
  "provider" TEXT NOT NULL DEFAULT 'razorpay',
  "razorpayCustomerId" TEXT,
  "razorpaySubscriptionId" TEXT,
  "previousRazorpaySubscriptionId" TEXT,
  "pendingPlanId" TEXT,
  "pendingBillingPeriod" TEXT,
  "pendingAmount" DOUBLE PRECISION,
  "pendingStartAt" TIMESTAMP(3),
  "pendingAuthorizedAt" TIMESTAMP(3),
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "currentPeriodStart" TIMESTAMP(3) NOT NULL,
  "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
  "nextBillingAt" TIMESTAMP(3),
  "gracePeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "cancelledAt" TIMESTAMP(3),
  "lastPaymentId" TEXT,
  "lastEventAt" TIMESTAMP(3),
  "cartsUsedInPeriod" INTEGER NOT NULL DEFAULT 0,
  "overageMessages" INTEGER NOT NULL DEFAULT 0,
  "cartOverage" INTEGER NOT NULL DEFAULT 0,
  "bargainSessionsUsed" INTEGER NOT NULL DEFAULT 0,
  "bargainDealsUsed" INTEGER NOT NULL DEFAULT 0,
  "bargainOverageDeals" INTEGER NOT NULL DEFAULT 0,
  "revenueShareAccrued" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "bargainAccrued" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RazorpaySubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RazorpaySubscription_storeId_key" ON "RazorpaySubscription"("storeId");
CREATE UNIQUE INDEX IF NOT EXISTS "RazorpaySubscription_razorpaySubscriptionId_key" ON "RazorpaySubscription"("razorpaySubscriptionId");
CREATE INDEX IF NOT EXISTS "RazorpaySubscription_userId_idx" ON "RazorpaySubscription"("userId");
CREATE INDEX IF NOT EXISTS "RazorpaySubscription_status_idx" ON "RazorpaySubscription"("status");
CREATE INDEX IF NOT EXISTS "RazorpaySubscription_razorpayCustomerId_idx" ON "RazorpaySubscription"("razorpayCustomerId");

CREATE TABLE IF NOT EXISTS "RazorpayPayment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "razorpaySubscriptionId" TEXT,
  "orderId" TEXT,
  "paymentId" TEXT NOT NULL,
  "eventId" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" TEXT NOT NULL DEFAULT 'authorized',
  "method" TEXT,
  "failureCode" TEXT,
  "failureReason" TEXT,
  "rawEvent" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RazorpayPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RazorpayPayment_paymentId_key" ON "RazorpayPayment"("paymentId");
CREATE INDEX IF NOT EXISTS "RazorpayPayment_userId_idx" ON "RazorpayPayment"("userId");
CREATE INDEX IF NOT EXISTS "RazorpayPayment_storeId_idx" ON "RazorpayPayment"("storeId");
CREATE INDEX IF NOT EXISTS "RazorpayPayment_razorpaySubscriptionId_idx" ON "RazorpayPayment"("razorpaySubscriptionId");
CREATE INDEX IF NOT EXISTS "RazorpayPayment_orderId_idx" ON "RazorpayPayment"("orderId");
CREATE INDEX IF NOT EXISTS "RazorpayPayment_eventId_idx" ON "RazorpayPayment"("eventId");

CREATE TABLE IF NOT EXISTS "RazorpayInvoice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'subscription',
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "razorpayOrderId" TEXT,
  "razorpayPaymentId" TEXT,
  "razorpayPaymentLinkId" TEXT,
  "paymentLinkUrl" TEXT,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RazorpayInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RazorpayInvoice_razorpayOrderId_key" ON "RazorpayInvoice"("razorpayOrderId");
CREATE UNIQUE INDEX IF NOT EXISTS "RazorpayInvoice_razorpayPaymentLinkId_key" ON "RazorpayInvoice"("razorpayPaymentLinkId");
CREATE UNIQUE INDEX IF NOT EXISTS "RazorpayInvoice_subscriptionId_kind_periodEnd_key" ON "RazorpayInvoice"("subscriptionId", "kind", "periodEnd");
CREATE INDEX IF NOT EXISTS "RazorpayInvoice_userId_idx" ON "RazorpayInvoice"("userId");
CREATE INDEX IF NOT EXISTS "RazorpayInvoice_storeId_idx" ON "RazorpayInvoice"("storeId");
CREATE INDEX IF NOT EXISTS "RazorpayInvoice_subscriptionId_idx" ON "RazorpayInvoice"("subscriptionId");
CREATE INDEX IF NOT EXISTS "RazorpayInvoice_status_idx" ON "RazorpayInvoice"("status");

CREATE TABLE IF NOT EXISTS "RazorpayUsageEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "referenceId" TEXT,
  "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "chargeAmount" DOUBLE PRECISION NOT NULL,
  "revSharePercent" DOUBLE PRECISION,
  "invoicedAt" TIMESTAMP(3),
  "invoiceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RazorpayUsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RazorpayUsageEvent_subscriptionId_kind_referenceId_key" ON "RazorpayUsageEvent"("subscriptionId", "kind", "referenceId");
CREATE INDEX IF NOT EXISTS "RazorpayUsageEvent_storeId_idx" ON "RazorpayUsageEvent"("storeId");
CREATE INDEX IF NOT EXISTS "RazorpayUsageEvent_invoicedAt_idx" ON "RazorpayUsageEvent"("invoicedAt");

DO $$ BEGIN
  ALTER TABLE "RazorpayPayment" ADD CONSTRAINT "RazorpayPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "RazorpaySubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RazorpayInvoice" ADD CONSTRAINT "RazorpayInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "RazorpaySubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RazorpayUsageEvent" ADD CONSTRAINT "RazorpayUsageEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "RazorpaySubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "RazorpayCustomer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RazorpaySubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RazorpayPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RazorpayInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RazorpayUsageEvent" ENABLE ROW LEVEL SECURITY;
