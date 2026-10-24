-- CreateTable
CREATE TABLE "BehavioralEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sessionId" TEXT,
    "customerId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "eventType" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "cartId" TEXT,
    "checkoutId" TEXT,
    "orderId" TEXT,
    "properties" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BehavioralEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerIdentity" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopifyCustomerId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "consentEmail" BOOLEAN NOT NULL DEFAULT false,
    "consentWhatsApp" BOOLEAN NOT NULL DEFAULT false,
    "consentSms" BOOLEAN NOT NULL DEFAULT false,
    "consentSource" TEXT,
    "consentAt" TIMESTAMP(3),
    "optedOutAt" TIMESTAMP(3),
    "suppressed" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryJourney" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerIdentityId" TEXT,
    "sessionId" TEXT,
    "cartId" TEXT,
    "checkoutId" TEXT,
    "productId" TEXT,
    "journeyType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OBSERVED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "scheduledFor" TIMESTAMP(3),
    "lastProcessedAt" TIMESTAMP(3),
    "reasonCode" TEXT,
    "metadata" JSONB,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryJourney_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryReminder" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "providerId" TEXT,
    "reasonCode" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BehavioralEvent_storeId_eventType_occurredAt_idx" ON "BehavioralEvent"("storeId", "eventType", "occurredAt");
CREATE INDEX "BehavioralEvent_storeId_cartId_idx" ON "BehavioralEvent"("storeId", "cartId");
CREATE INDEX "BehavioralEvent_storeId_checkoutId_idx" ON "BehavioralEvent"("storeId", "checkoutId");
CREATE INDEX "BehavioralEvent_storeId_customerId_idx" ON "BehavioralEvent"("storeId", "customerId");
CREATE INDEX "BehavioralEvent_email_idx" ON "BehavioralEvent"("email");
CREATE INDEX "BehavioralEvent_phone_idx" ON "BehavioralEvent"("phone");
CREATE INDEX "BehavioralEvent_sessionId_idx" ON "BehavioralEvent"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerIdentity_storeId_shopifyCustomerId_key" ON "CustomerIdentity"("storeId", "shopifyCustomerId");
CREATE INDEX "CustomerIdentity_storeId_email_idx" ON "CustomerIdentity"("storeId", "email");
CREATE INDEX "CustomerIdentity_storeId_phone_idx" ON "CustomerIdentity"("storeId", "phone");

-- CreateIndex
CREATE INDEX "RecoveryJourney_storeId_status_scheduledFor_idx" ON "RecoveryJourney"("storeId", "status", "scheduledFor");
CREATE INDEX "RecoveryJourney_storeId_cartId_idx" ON "RecoveryJourney"("storeId", "cartId");
CREATE INDEX "RecoveryJourney_storeId_checkoutId_idx" ON "RecoveryJourney"("storeId", "checkoutId");
CREATE INDEX "RecoveryJourney_customerIdentityId_idx" ON "RecoveryJourney"("customerIdentityId");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryReminder_idempotencyKey_key" ON "RecoveryReminder"("idempotencyKey");
CREATE INDEX "RecoveryReminder_storeId_status_scheduledFor_idx" ON "RecoveryReminder"("storeId", "status", "scheduledFor");
CREATE INDEX "RecoveryReminder_journeyId_idx" ON "RecoveryReminder"("journeyId");
CREATE INDEX "RecoveryReminder_providerId_idx" ON "RecoveryReminder"("providerId");
