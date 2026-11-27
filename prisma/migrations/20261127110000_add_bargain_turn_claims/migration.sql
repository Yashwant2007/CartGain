CREATE TABLE "BargainTurnClaim" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BargainTurnClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BargainTurnClaim_sessionId_turnId_key" ON "BargainTurnClaim"("sessionId", "turnId");

CREATE INDEX "BargainTurnClaim_sessionId_idx" ON "BargainTurnClaim"("sessionId");
