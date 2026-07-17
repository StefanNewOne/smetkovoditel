-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('INVOICE', 'CASH');

-- CreateEnum
CREATE TYPE "PayChannel" AS ENUM ('BANK', 'CARD', 'CASH');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CHURNED');

-- CreateEnum
CREATE TYPE "ChargeKind" AS ENUM ('INVOICE', 'CASH_OBLIGATION', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LineType" AS ENUM ('SERVICE', 'META_ADS', 'ACTORS', 'OTHER');

-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('PASSTHROUGH_ACTUAL', 'FIXED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('UNMATCHED', 'AUTO_MATCHED', 'MANUAL_MATCHED');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "CashDocType" AS ENUM ('FISCAL', 'KASA_PRIMI', 'KASA_ISPLATI');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('OPERATIONS', 'ADS', 'ACTORS', 'EQUIPMENT', 'FUEL', 'RENT', 'UTILITIES', 'PHONE', 'BANK_FEES', 'SALARY', 'HONORAR', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractorType" AS ENUM ('DOGOVOR_NA_DELO', 'CONTRACTOR_INVOICE');

-- CreateEnum
CREATE TYPE "TaxMode" AS ENUM ('WITHHOLD_10', 'NO_WITHHOLDING');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('EMAIL', 'MANUAL_UPLOAD');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PARSED', 'DUPLICATE_SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "ParseStatus" AS ENUM ('OK', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "address" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "paymentChannel" "PaymentChannel" NOT NULL,
    "vatApplicable" BOOLEAN NOT NULL DEFAULT true,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 15,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "creditBalance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePackage" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "monthlyAmount" INTEGER NOT NULL,
    "description" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringLineTemplate" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "LineType" NOT NULL,
    "billingMode" "BillingMode" NOT NULL,
    "fixedAmount" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RecurringLineTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "ChargeKind" NOT NULL,
    "period" TEXT NOT NULL,
    "seqInMonth" INTEGER,
    "invoiceNumber" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ChargeStatus" NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "vatAmount" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "relatedChargeId" TEXT,
    "pdfUrl" TEXT,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeLine" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "type" "LineType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "vatRate" DOUBLE PRECISION NOT NULL,
    "sourceRefs" JSONB,

    CONSTRAINT "ChargeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "chargeId" TEXT,
    "channel" "PayChannel" NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "matchStatus" "MatchStatus" NOT NULL,
    "statementLineId" TEXT,
    "cashEntryId" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashLedgerEntry" (
    "id" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "counterpartyType" TEXT NOT NULL,
    "counterpartyId" TEXT,
    "documentType" "CashDocType" NOT NULL,
    "documentNumber" TEXT,
    "attachmentUrl" TEXT,
    "periodId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "vendor" TEXT,
    "amount" INTEGER NOT NULL,
    "vatAmount" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "paymentChannel" "PayChannel" NOT NULL,
    "clientId" TEXT,
    "isBillable" BOOLEAN NOT NULL DEFAULT false,
    "billedOnLineId" TEXT,
    "attachmentUrl" TEXT,
    "statementLineId" TEXT,
    "cashEntryId" TEXT,
    "adSpendReceiptId" TEXT,
    "contractorPaymentId" TEXT,
    "ocrRaw" JSONB,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purchaseExpenseId" TEXT NOT NULL,
    "purchaseValue" INTEGER NOT NULL,
    "depreciationRate" DOUBLE PRECISION NOT NULL,
    "depreciationStart" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAccount" (
    "id" TEXT NOT NULL,
    "metaAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSpendReceipt" (
    "id" TEXT NOT NULL,
    "emailMessageId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "metaInvoiceNo" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "metaAccountId" TEXT,
    "amountUsd" INTEGER NOT NULL,
    "cardLast4" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "campaignsJson" JSONB,
    "attachmentUrl" TEXT NOT NULL,
    "reverseChargeVat" BOOLEAN NOT NULL DEFAULT true,
    "parseStatus" "ParseStatus" NOT NULL,
    "matchStatus" "MatchStatus" NOT NULL DEFAULT 'UNMATCHED',
    "statementLineId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdSpendReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "bank" TEXT NOT NULL DEFAULT 'NLB',
    "accountNumber" TEXT NOT NULL,
    "openingBalance" INTEGER NOT NULL,
    "openingDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementImport" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "statementNumber" INTEGER NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "source" "ImportSource" NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'NLB_PDF',
    "fileRef" TEXT NOT NULL,
    "openingBalance" INTEGER NOT NULL,
    "totalDebit" INTEGER NOT NULL,
    "totalCredit" INTEGER NOT NULL,
    "closingBalance" INTEGER NOT NULL,
    "orderCount" INTEGER NOT NULL,
    "status" "ImportStatus" NOT NULL,

    CONSTRAINT "BankStatementImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementLine" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "lineHash" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "direction" "Direction" NOT NULL,
    "counterpartyName" TEXT,
    "counterpartyAccount" TEXT,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "bankRef" TEXT,
    "classifiedAs" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "linkedType" TEXT,
    "linkedId" TEXT,

    CONSTRAINT "StatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorRule" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "vendor" TEXT,
    "hits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VendorRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL DEFAULT 'USD',
    "midMkd" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contractor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "idNumber" TEXT,
    "contractType" "ContractorType" NOT NULL,
    "taxMode" "TaxMode" NOT NULL,
    "isTalent" BOOLEAN NOT NULL DEFAULT false,
    "defaultRate" INTEGER,
    "contractUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorPayment" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "grossAmount" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL,
    "netAmount" INTEGER NOT NULL,
    "paymentChannel" "PayChannel" NOT NULL,
    "cashEntryId" TEXT,
    "documentUrl" TEXT,
    "allocations" JSONB NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "ContractorPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grossSalary" INTEGER NOT NULL,
    "position" TEXT,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Period" (
    "id" TEXT NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,

    CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "diff" JSONB NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServicePackage_clientId_idx" ON "ServicePackage"("clientId");

-- CreateIndex
CREATE INDEX "RecurringLineTemplate_clientId_idx" ON "RecurringLineTemplate"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_clientId_period_kind_key" ON "Charge"("clientId", "period", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_seqInMonth_period_key" ON "Charge"("seqInMonth", "period");

-- CreateIndex
CREATE INDEX "ChargeLine_chargeId_idx" ON "ChargeLine"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_statementLineId_key" ON "Payment"("statementLineId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_cashEntryId_key" ON "Payment"("cashEntryId");

-- CreateIndex
CREATE INDEX "CashLedgerEntry_periodId_idx" ON "CashLedgerEntry"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_statementLineId_key" ON "Expense"("statementLineId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_cashEntryId_key" ON "Expense"("cashEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_adSpendReceiptId_key" ON "Expense"("adSpendReceiptId");

-- CreateIndex
CREATE INDEX "Expense_clientId_idx" ON "Expense"("clientId");

-- CreateIndex
CREATE INDEX "Expense_billedOnLineId_idx" ON "Expense"("billedOnLineId");

-- CreateIndex
CREATE INDEX "Expense_contractorPaymentId_idx" ON "Expense"("contractorPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_purchaseExpenseId_key" ON "Asset"("purchaseExpenseId");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccount_metaAccountId_key" ON "AdAccount"("metaAccountId");

-- CreateIndex
CREATE INDEX "AdAccount_clientId_idx" ON "AdAccount"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "AdSpendReceipt_emailMessageId_key" ON "AdSpendReceipt"("emailMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "AdSpendReceipt_transactionId_key" ON "AdSpendReceipt"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "AdSpendReceipt_metaInvoiceNo_key" ON "AdSpendReceipt"("metaInvoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "AdSpendReceipt_referenceNumber_key" ON "AdSpendReceipt"("referenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AdSpendReceipt_statementLineId_key" ON "AdSpendReceipt"("statementLineId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_accountNumber_key" ON "BankAccount"("accountNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementImport_bankAccountId_statementNumber_key" ON "BankStatementImport"("bankAccountId", "statementNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StatementLine_lineHash_key" ON "StatementLine"("lineHash");

-- CreateIndex
CREATE INDEX "StatementLine_importId_idx" ON "StatementLine"("importId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_date_code_key" ON "ExchangeRate"("date", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorPayment_cashEntryId_key" ON "ContractorPayment"("cashEntryId");

-- CreateIndex
CREATE INDEX "ContractorPayment_contractorId_idx" ON "ContractorPayment"("contractorId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "ServicePackage" ADD CONSTRAINT "ServicePackage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringLineTemplate" ADD CONSTRAINT "RecurringLineTemplate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_relatedChargeId_fkey" FOREIGN KEY ("relatedChargeId") REFERENCES "Charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeLine" ADD CONSTRAINT "ChargeLine_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "StatementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashEntryId_fkey" FOREIGN KEY ("cashEntryId") REFERENCES "CashLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashLedgerEntry" ADD CONSTRAINT "CashLedgerEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_billedOnLineId_fkey" FOREIGN KEY ("billedOnLineId") REFERENCES "ChargeLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "StatementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_cashEntryId_fkey" FOREIGN KEY ("cashEntryId") REFERENCES "CashLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_adSpendReceiptId_fkey" FOREIGN KEY ("adSpendReceiptId") REFERENCES "AdSpendReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_contractorPaymentId_fkey" FOREIGN KEY ("contractorPaymentId") REFERENCES "ContractorPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_purchaseExpenseId_fkey" FOREIGN KEY ("purchaseExpenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAccount" ADD CONSTRAINT "AdAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSpendReceipt" ADD CONSTRAINT "AdSpendReceipt_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "StatementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementLine" ADD CONSTRAINT "StatementLine_importId_fkey" FOREIGN KEY ("importId") REFERENCES "BankStatementImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorPayment" ADD CONSTRAINT "ContractorPayment_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorPayment" ADD CONSTRAINT "ContractorPayment_cashEntryId_fkey" FOREIGN KEY ("cashEntryId") REFERENCES "CashLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

