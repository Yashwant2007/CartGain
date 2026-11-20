ALTER TABLE "Store"
  ADD COLUMN IF NOT EXISTS "externalStoreId" TEXT,
  ADD COLUMN IF NOT EXISTS "platformStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "platformConnectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "platformLastSyncAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Store_platform_status_idx" ON "Store"("platform", "platformStatus");

ALTER TABLE "Cart"
  ADD COLUMN IF NOT EXISTS "platform" TEXT,
  ADD COLUMN IF NOT EXISTS "platformCartId" TEXT,
  ADD COLUMN IF NOT EXISTS "platformOrderId" TEXT,
  ADD COLUMN IF NOT EXISTS "externalCustomerId" TEXT,
  ADD COLUMN IF NOT EXISTS "platformStatus" TEXT;

CREATE INDEX IF NOT EXISTS "Cart_platform_cart_idx" ON "Cart"("storeId", "platform", "platformCartId");
CREATE INDEX IF NOT EXISTS "Cart_platform_order_idx" ON "Cart"("storeId", "platformOrderId");

ALTER TABLE "RecoveredCart"
  ADD COLUMN IF NOT EXISTS "platform" TEXT,
  ADD COLUMN IF NOT EXISTS "platformOrderId" TEXT,
  ADD COLUMN IF NOT EXISTS "externalCustomerId" TEXT,
  ADD COLUMN IF NOT EXISTS "platformStatus" TEXT;

CREATE INDEX IF NOT EXISTS "RecoveredCart_platform_order_idx" ON "RecoveredCart"("storeId", "platform", "platformOrderId");

ALTER TABLE "BargainProduct"
  ADD COLUMN IF NOT EXISTS "platform" TEXT,
  ADD COLUMN IF NOT EXISTS "platformProductId" TEXT,
  ADD COLUMN IF NOT EXISTS "platformVariantId" TEXT,
  ADD COLUMN IF NOT EXISTS "platformStatus" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "BargainProduct_platform_product_key" ON "BargainProduct"("storeId", "platform", "platformProductId");

ALTER TABLE "BargainSession"
  ADD COLUMN IF NOT EXISTS "platform" TEXT,
  ADD COLUMN IF NOT EXISTS "platformProductId" TEXT,
  ADD COLUMN IF NOT EXISTS "platformVariantId" TEXT,
  ADD COLUMN IF NOT EXISTS "platformOrderId" TEXT,
  ADD COLUMN IF NOT EXISTS "externalCustomerId" TEXT;

CREATE INDEX IF NOT EXISTS "BargainSession_platform_product_idx" ON "BargainSession"("storeId", "platform", "platformProductId");
CREATE INDEX IF NOT EXISTS "BargainSession_platform_order_idx" ON "BargainSession"("storeId", "platformOrderId");

ALTER TABLE "BargainPurchaseMemory"
  ADD COLUMN IF NOT EXISTS "platform" TEXT,
  ADD COLUMN IF NOT EXISTS "platformProductId" TEXT,
  ADD COLUMN IF NOT EXISTS "platformOrderId" TEXT,
  ADD COLUMN IF NOT EXISTS "externalCustomerId" TEXT,
  ADD COLUMN IF NOT EXISTS "platformStatus" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "BargainPurchaseMemory_platform_order_key" ON "BargainPurchaseMemory"("storeId", "platform", "platformOrderId", "platformProductId");

ALTER TABLE "CustomerIdentity"
  ADD COLUMN IF NOT EXISTS "platform" TEXT,
  ADD COLUMN IF NOT EXISTS "externalCustomerId" TEXT,
  ADD COLUMN IF NOT EXISTS "platformStatus" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerIdentity_platform_customer_key" ON "CustomerIdentity"("storeId", "platform", "externalCustomerId");

CREATE TABLE IF NOT EXISTS "PlatformConnection" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "externalStoreId" TEXT,
  "storeUrl" TEXT,
  "webhookUrl" TEXT,
  "webhookSecret" TEXT,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "lastHealthCheckAt" TIMESTAMP(3),
  "lastHealthStatus" TEXT,
  "lastHealthDetail" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlatformConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformConnection_store_platform_key" ON "PlatformConnection"("storeId", "platform");
CREATE INDEX IF NOT EXISTS "PlatformConnection_platform_status_idx" ON "PlatformConnection"("platform", "status");

CREATE TABLE IF NOT EXISTS "PlatformCredential" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'consumer_key_secret',
  "keyEncrypted" TEXT NOT NULL,
  "secretEncrypted" TEXT NOT NULL,
  "keyFingerprint" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "lastUsedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlatformCredential_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlatformCredential_connection_status_idx" ON "PlatformCredential"("connectionId", "status");
CREATE INDEX IF NOT EXISTS "PlatformCredential_platform_status_idx" ON "PlatformCredential"("platform", "status");

CREATE TABLE IF NOT EXISTS "ConnectionIntent" (
  "id" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "installId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConnectionIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ConnectionIntent_codeHash_key" ON "ConnectionIntent"("codeHash");
CREATE INDEX IF NOT EXISTS "ConnectionIntent_store_status_idx" ON "ConnectionIntent"("storeId", "platform", "status");
CREATE INDEX IF NOT EXISTS "ConnectionIntent_expiresAt_idx" ON "ConnectionIntent"("expiresAt");

CREATE TABLE IF NOT EXISTS "PlatformEvent" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "connectionId" TEXT,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'received',
  "errorCode" TEXT,
  "detail" JSONB,
  "occurredAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),

  CONSTRAINT "PlatformEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformEvent_dedupe_key" ON "PlatformEvent"("storeId", "platform", "eventId");
CREATE INDEX IF NOT EXISTS "PlatformEvent_store_type_idx" ON "PlatformEvent"("storeId", "eventType", "receivedAt");
CREATE INDEX IF NOT EXISTS "PlatformEvent_status_received_idx" ON "PlatformEvent"("status", "receivedAt");

CREATE TABLE IF NOT EXISTS "PlatformProduct" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "connectionId" TEXT,
  "platform" TEXT NOT NULL,
  "platformProductId" TEXT NOT NULL,
  "variantKey" TEXT NOT NULL DEFAULT '',
  "platformVariantId" TEXT,
  "parentProductId" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'product',
  "name" TEXT,
  "description" TEXT,
  "imageUrl" TEXT,
  "regularPrice" DOUBLE PRECISION,
  "salePrice" DOUBLE PRECISION,
  "sku" TEXT,
  "categories" JSONB,
  "inventoryQuantity" INTEGER,
  "stockStatus" TEXT,
  "attributes" JSONB,
  "variations" JSONB,
  "status" TEXT,
  "raw" JSONB,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlatformProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformProduct_variant_key" ON "PlatformProduct"("storeId", "platform", "platformProductId", "variantKey");
CREATE INDEX IF NOT EXISTS "PlatformProduct_sku_idx" ON "PlatformProduct"("storeId", "platform", "sku");
CREATE INDEX IF NOT EXISTS "PlatformProduct_status_idx" ON "PlatformProduct"("storeId", "platform", "status");
CREATE INDEX IF NOT EXISTS "PlatformProduct_connection_idx" ON "PlatformProduct"("connectionId");

CREATE TABLE IF NOT EXISTS "PlatformOrder" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "connectionId" TEXT,
  "platform" TEXT NOT NULL,
  "platformOrderId" TEXT NOT NULL,
  "cartId" TEXT,
  "externalCustomerId" TEXT,
  "status" TEXT,
  "currency" TEXT,
  "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "refundedTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "customerEmail" TEXT,
  "customerPhone" TEXT,
  "customerName" TEXT,
  "items" JSONB NOT NULL DEFAULT '[]',
  "couponCodes" JSONB NOT NULL DEFAULT '[]',
  "placedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlatformOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformOrder_dedupe_key" ON "PlatformOrder"("storeId", "platform", "platformOrderId");
CREATE INDEX IF NOT EXISTS "PlatformOrder_status_idx" ON "PlatformOrder"("storeId", "platform", "status");
CREATE INDEX IF NOT EXISTS "PlatformOrder_cart_idx" ON "PlatformOrder"("storeId", "cartId");
CREATE INDEX IF NOT EXISTS "PlatformOrder_customer_idx" ON "PlatformOrder"("storeId", "externalCustomerId");
CREATE INDEX IF NOT EXISTS "PlatformOrder_connection_idx" ON "PlatformOrder"("connectionId");

CREATE TABLE IF NOT EXISTS "WebhookDelivery" (
  "id" TEXT NOT NULL,
  "storeId" TEXT,
  "platform" TEXT NOT NULL,
  "connectionId" TEXT,
  "eventId" TEXT,
  "topic" TEXT,
  "status" TEXT NOT NULL DEFAULT 'verified',
  "httpStatus" INTEGER,
  "signatureValid" BOOLEAN NOT NULL DEFAULT false,
  "errorCode" TEXT,
  "detail" JSONB,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),

  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebhookDelivery_dedupe_key" ON "WebhookDelivery"("storeId", "platform", "eventId");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_received_idx" ON "WebhookDelivery"("platform", "receivedAt");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_status_idx" ON "WebhookDelivery"("status", "receivedAt");

DO $$ BEGIN
  ALTER TABLE "PlatformConnection" ADD CONSTRAINT "PlatformConnection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PlatformCredential" ADD CONSTRAINT "PlatformCredential_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "PlatformConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ConnectionIntent" ADD CONSTRAINT "ConnectionIntent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PlatformEvent" ADD CONSTRAINT "PlatformEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PlatformEvent" ADD CONSTRAINT "PlatformEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "PlatformConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PlatformProduct" ADD CONSTRAINT "PlatformProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PlatformProduct" ADD CONSTRAINT "PlatformProduct_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "PlatformConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PlatformOrder" ADD CONSTRAINT "PlatformOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PlatformOrder" ADD CONSTRAINT "PlatformOrder_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "PlatformConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "PlatformConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "PlatformConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformCredential" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConnectionIntent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookDelivery" ENABLE ROW LEVEL SECURITY;
