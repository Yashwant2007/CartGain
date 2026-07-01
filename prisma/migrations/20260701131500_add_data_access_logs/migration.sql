-- Create audit log table for protected customer-data access
CREATE TABLE "DataAccessLog" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "purpose" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataAccessLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DataAccessLog_actorType_createdAt_idx" ON "DataAccessLog"("actorType", "createdAt");
CREATE INDEX "DataAccessLog_resourceType_createdAt_idx" ON "DataAccessLog"("resourceType", "createdAt");
CREATE INDEX "DataAccessLog_purpose_createdAt_idx" ON "DataAccessLog"("purpose", "createdAt");

ALTER TABLE "DataAccessLog" ENABLE ROW LEVEL SECURITY;
