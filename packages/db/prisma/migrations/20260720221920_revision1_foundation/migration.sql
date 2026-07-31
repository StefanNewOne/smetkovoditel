-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY');

-- AlterTable
ALTER TABLE "Charge" ADD COLUMN     "internalRef" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "number" INTEGER,
ADD COLUMN     "startDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ServicePackage" ADD COLUMN     "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY';

-- CreateTable
CREATE TABLE "ClientBankAccount" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientBankAccount_account_key" ON "ClientBankAccount"("account");

-- CreateIndex
CREATE INDEX "ClientBankAccount_clientId_idx" ON "ClientBankAccount"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_number_key" ON "Client"("number");

-- AddForeignKey
ALTER TABLE "ClientBankAccount" ADD CONSTRAINT "ClientBankAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
