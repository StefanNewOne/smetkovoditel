import { beforeEach, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth";
import { AuthError, ForbiddenError, hasWriteRole, requireUser, requireWrite } from "@/lib/rbac";
import { approveInvoice, generateCharges } from "@/lib/workflows/w1";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

const admin: CurrentUser = { id: "u1", name: "Admin", role: "admin" };
const accountant: CurrentUser = { id: "u2", name: "Acc", role: "accountant" };
const viewer: CurrentUser = { id: "u3", name: "View", role: "viewer" };

describe("RBAC guards (SM-5)", () => {
  it("requireUser rejects an anonymous caller with a typed 401", () => {
    expect(() => requireUser(null)).toThrow(AuthError);
    try {
      requireUser(null);
    } catch (e) {
      expect((e as AuthError).status).toBe(401);
    }
    expect(requireUser(admin)).toBe(admin);
  });

  it("requireWrite allows write roles and rejects read-only roles with a typed 403", () => {
    expect(requireWrite(admin)).toBe(admin);
    expect(requireWrite(accountant)).toBe(accountant);
    expect(() => requireWrite(viewer)).toThrow(ForbiddenError);
    try {
      requireWrite(viewer);
    } catch (e) {
      expect((e as ForbiddenError).status).toBe(403);
    }
  });

  it("requireWrite on an anonymous caller is AuthError, not ForbiddenError", () => {
    expect(() => requireWrite(null)).toThrow(AuthError);
  });

  it("hasWriteRole reflects the WRITE_ROLES set", () => {
    expect(hasWriteRole(admin)).toBe(true);
    expect(hasWriteRole(accountant)).toBe(true);
    expect(hasWriteRole(viewer)).toBe(false);
  });
});

describe("AuditLog trail (Engineering Posture #3)", () => {
  let userId = "";
  beforeEach(async () => {
    ({ userId } = await resetDb());
  });

  it("every financial mutation appends an audit row with actor + action + diff", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });
    await generateCharges(PERIOD, userId);
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: client.id } });
    await approveInvoice(charge.id, userId);

    const logs = await prisma.auditLog.findMany({ where: { entity: "Charge" } });
    const create = logs.find((l) => l.action === "w1.create");
    const approve = logs.find((l) => l.action === "approve");

    expect(create?.userId).toBe(userId);
    expect((create?.diff as { total?: number }).total).toBe(3_540_000);
    expect(approve?.userId).toBe(userId);
    expect((approve?.diff as { invoiceNumber?: string }).invoiceNumber).toBe("1-1/7-2026");
  });
});

const PERIOD = "2026-07";
