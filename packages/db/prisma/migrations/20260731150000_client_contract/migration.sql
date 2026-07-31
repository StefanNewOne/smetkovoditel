-- SM-112 — attach a cooperation contract per client (served via /api/attachments).
ALTER TABLE "Client" ADD COLUMN "contractUrl" TEXT;
ALTER TABLE "Client" ADD COLUMN "contractName" TEXT;
ALTER TABLE "Client" ADD COLUMN "contractUploadedAt" TIMESTAMP(3);
