-- DropIndex
DROP INDEX "Charge_clientId_period_kind_key";

-- CreateIndex
CREATE INDEX "Charge_clientId_period_kind_idx" ON "Charge"("clientId", "period", "kind");
