-- RTO / COD-Fraud Reduction + Payment-Failure Recovery
-- New models: MerchantConfig, RtoRiskScore, PincodeStats, CodNudge, Customer, PaymentAttempt, PaymentRecoveryCampaign

-- MerchantConfig: per-merchant feature flags and tuning parameters
CREATE TABLE "MerchantConfig" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "rtoReductionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "paymentRecoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rtoWeights" JSONB NOT NULL DEFAULT '{}',
    "rtoThresholds" JSONB NOT NULL DEFAULT '{}',
    "rtoIncentive" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rtoEnabledCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "paymentRetrySchedule" JSONB NOT NULL DEFAULT '{}',
    "paymentChannelPriority" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "paymentIncentive" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentEnabledGateways" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantConfig_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MerchantConfig_storeId_key" UNIQUE ("storeId")
);

-- RtoRiskScore: per-order RTO risk assessment
CREATE TABLE "RtoRiskScore" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "reasons" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RtoRiskScore_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RtoRiskScore_storeId_orderId_key" UNIQUE ("storeId", "orderId")
);

-- PincodeStats: historical RTO rates per pincode (null storeId = global aggregate)
CREATE TABLE "PincodeStats" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "pincode" TEXT NOT NULL,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "codOrders" INTEGER NOT NULL DEFAULT 0,
    "codRtos" INTEGER NOT NULL DEFAULT 0,
    "rtoRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "codRtoRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PincodeStats_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PincodeStats_storeId_pincode_key" UNIQUE ("storeId", "pincode")
);

-- CodNudge: track COD→prepaid conversion nudges
CREATE TABLE "CodNudge" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "linkToken" TEXT NOT NULL,
    "incentive" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskScore" INTEGER,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodNudge_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CodNudge_linkToken_key" UNIQUE ("linkToken"),
    CONSTRAINT "CodNudge_storeId_orderId_channel_key" UNIQUE ("storeId", "orderId", "channel")
);

-- Customer: per-merchant customer aggregates for risk scoring
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "codOrders" INTEGER NOT NULL DEFAULT 0,
    "codRtos" INTEGER NOT NULL DEFAULT 0,
    "cancellations" INTEGER NOT NULL DEFAULT 0,
    "firstOrderAt" TIMESTAMP(3),
    "lastOrderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Customer_storeId_customerId_key" UNIQUE ("storeId", "customerId")
);

-- PaymentAttempt: normalized payment failure records from any gateway
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "orderRef" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "gatewayEventId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'failed',
    "failureReasonRaw" TEXT,
    "failureCategory" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT true,
    "gatewayResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentAttempt_gatewayEventId_key" UNIQUE ("gatewayEventId")
);

-- PaymentRecoveryCampaign: per-attempt recovery message tracking
CREATE TABLE "PaymentRecoveryCampaign" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resumeLinkToken" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "recoveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRecoveryCampaign_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentRecoveryCampaign_resumeLinkToken_key" UNIQUE ("resumeLinkToken")
);

-- Foreign keys
ALTER TABLE "MerchantConfig" ADD CONSTRAINT "MerchantConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RtoRiskScore" ADD CONSTRAINT "RtoRiskScore_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PincodeStats" ADD CONSTRAINT "PincodeStats_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodNudge" ADD CONSTRAINT "CodNudge_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentRecoveryCampaign" ADD CONSTRAINT "PaymentRecoveryCampaign_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PaymentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "MerchantConfig_storeId_idx" ON "MerchantConfig"("storeId");
CREATE INDEX "RtoRiskScore_storeId_idx" ON "RtoRiskScore"("storeId");
CREATE INDEX "RtoRiskScore_storeId_score_idx" ON "RtoRiskScore"("storeId", "score");
CREATE INDEX "RtoRiskScore_storeId_createdAt_idx" ON "RtoRiskScore"("storeId", "createdAt");
CREATE INDEX "PincodeStats_storeId_idx" ON "PincodeStats"("storeId");
CREATE INDEX "PincodeStats_pincode_idx" ON "PincodeStats"("pincode");
CREATE INDEX "CodNudge_storeId_idx" ON "CodNudge"("storeId");
CREATE INDEX "CodNudge_storeId_status_idx" ON "CodNudge"("storeId", "status");
CREATE INDEX "CodNudge_linkToken_idx" ON "CodNudge"("linkToken");
CREATE INDEX "Customer_storeId_idx" ON "Customer"("storeId");
CREATE INDEX "Customer_storeId_email_idx" ON "Customer"("storeId", "email");
CREATE INDEX "Customer_storeId_phone_idx" ON "Customer"("storeId", "phone");
CREATE INDEX "PaymentAttempt_merchantId_idx" ON "PaymentAttempt"("merchantId");
CREATE INDEX "PaymentAttempt_merchantId_orderRef_idx" ON "PaymentAttempt"("merchantId", "orderRef");
CREATE INDEX "PaymentAttempt_merchantId_createdAt_idx" ON "PaymentAttempt"("merchantId", "createdAt");
CREATE INDEX "PaymentAttempt_gatewayEventId_idx" ON "PaymentAttempt"("gatewayEventId");
CREATE INDEX "PaymentRecoveryCampaign_attemptId_idx" ON "PaymentRecoveryCampaign"("attemptId");
CREATE INDEX "PaymentRecoveryCampaign_status_idx" ON "PaymentRecoveryCampaign"("status");
CREATE INDEX "PaymentRecoveryCampaign_nextRetryAt_idx" ON "PaymentRecoveryCampaign"("nextRetryAt");
CREATE INDEX "PaymentRecoveryCampaign_resumeLinkToken_idx" ON "PaymentRecoveryCampaign"("resumeLinkToken");
