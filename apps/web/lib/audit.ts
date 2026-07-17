import "server-only";
import { prisma, type Prisma } from "@smetko/db";

/**
 * Append an audit row for a financial mutation (Engineering Posture #3). Call inside the same
 * transaction as the mutation when possible. AuditLog is append-only (no UPDATE/DELETE).
 */
export async function writeAudit(
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    entity: string;
    entityId: string;
    action: string;
    diff: Prisma.InputJsonValue;
    userId: string;
  },
) {
  await tx.auditLog.create({ data: input });
}
