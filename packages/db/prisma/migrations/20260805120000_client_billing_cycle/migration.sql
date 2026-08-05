-- SM-118 — billing cycle becomes a client-level attribute (was on ServicePackage). Backfill each
-- client from its active package so nothing changes behaviourally; W1 now reads Client.billingCycle.
ALTER TABLE "Client" ADD COLUMN "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY';

UPDATE "Client" c
SET "billingCycle" = sp."billingCycle"
FROM "ServicePackage" sp
WHERE sp."clientId" = c.id AND sp."effectiveTo" IS NULL;
