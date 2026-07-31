-- CreateTable
CREATE TABLE "LoanEntry" (
    "id" TEXT NOT NULL,
    "lenderName" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "attachmentUrl" TEXT,
    "statementLineId" TEXT,
    "periodId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoanEntry_statementLineId_key" ON "LoanEntry"("statementLineId");

-- CreateIndex
CREATE INDEX "LoanEntry_lenderName_idx" ON "LoanEntry"("lenderName");

-- AddForeignKey
ALTER TABLE "LoanEntry" ADD CONSTRAINT "LoanEntry_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "StatementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanEntry" ADD CONSTRAINT "LoanEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

