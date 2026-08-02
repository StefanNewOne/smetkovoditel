-- SM-113 — company profile (issuer identity for invoices) + client legal name.
ALTER TABLE "Client" ADD COLUMN "legalName" TEXT;

CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "taxId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "director" TEXT NOT NULL,
    "invoiceFooter" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);
