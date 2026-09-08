-- CartGain production hardening: durable idempotency ledger for gateway webhooks.
-- Gives DB-backed dedup as a backstop to the (Redis, fail-open) SETNX marker in
-- the payments webhook handler, so smsCredits / subscription state can never be
-- applied twice even if Redis is down during a Razorpay redelivery.

CREATE TABLE "WebhookEvent" (
    "id"          TEXT      NOT NULL,
    "namespace"   TEXT      NOT NULL,
    "entityId"    TEXT      NOT NULL,
    "processedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebhookEvent_namespace_entityId_key" ON "WebhookEvent"("namespace", "entityId");
CREATE INDEX "WebhookEvent_namespace_processedAt_idx" ON "WebhookEvent"("namespace", "processedAt");