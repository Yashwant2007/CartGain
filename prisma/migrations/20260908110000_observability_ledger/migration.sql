-- CartGain Day 6-7 observability: operational error log + product funnel events.
-- Both are append-only event stores keyed by string ids (no relations) so logs
-- survive store purges and can be erased for privacy without cascade churn.

CREATE TABLE "ErrorLog" (
    "id"          TEXT      NOT NULL,
    "level"       TEXT      NOT NULL,
    "component"   TEXT      NOT NULL,
    "operation"   TEXT      NOT NULL,
    "message"     TEXT      NOT NULL,
    "stack"       TEXT,
    "signature"   TEXT      NOT NULL,
    "method"      TEXT,
    "path"        TEXT,
    "statusCode"  INTEGER,
    "traceId"     TEXT,
    "release"     TEXT,
    "environment" TEXT,
    "userId"      TEXT,
    "storeId"     TEXT,
    "createdAt"   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ErrorLog_signature_createdAt_idx" ON "ErrorLog"("signature", "createdAt");
CREATE INDEX "ErrorLog_level_createdAt_idx" ON "ErrorLog"("level", "createdAt");
CREATE INDEX "ErrorLog_environment_createdAt_idx" ON "ErrorLog"("environment", "createdAt");
CREATE INDEX "ErrorLog_component_createdAt_idx" ON "ErrorLog"("component", "createdAt");

CREATE TABLE "ProductEvent" (
    "id"          TEXT      NOT NULL,
    "name"        TEXT      NOT NULL,
    "environment" TEXT      NOT NULL,
    "release"     TEXT,
    "userId"      TEXT,
    "storeId"     TEXT,
    "properties"  JSONB,
    "createdAt"   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductEvent_name_createdAt_idx" ON "ProductEvent"("name", "createdAt");
CREATE INDEX "ProductEvent_userId_createdAt_idx" ON "ProductEvent"("userId", "createdAt");
CREATE INDEX "ProductEvent_storeId_createdAt_idx" ON "ProductEvent"("storeId", "createdAt");
CREATE INDEX "ProductEvent_environment_createdAt_idx" ON "ProductEvent"("environment", "createdAt");