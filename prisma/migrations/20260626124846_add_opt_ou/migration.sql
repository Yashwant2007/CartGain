-- CreateTable
CREATE TABLE "OptOut" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "reason" TEXT,
    "optedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptOut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OptOut_storeId_idx" ON "OptOut"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "OptOut_storeId_email_key" ON "OptOut"("storeId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "OptOut_storeId_phone_key" ON "OptOut"("storeId", "phone");
