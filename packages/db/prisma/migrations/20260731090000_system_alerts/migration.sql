-- SM-111 — durable import/worker alarms (Master Plan §13, B14, §4.4).
CREATE TYPE "AlertType" AS ENUM ('INTEGRITY_FAILED', 'CONTINUITY_GAP', 'IMPORT_FAILED', 'RATE_SANITY', 'MATCH_ERROR');

CREATE TABLE "SystemAlert" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,

    CONSTRAINT "SystemAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SystemAlert_acknowledgedAt_createdAt_idx" ON "SystemAlert"("acknowledgedAt", "createdAt");
