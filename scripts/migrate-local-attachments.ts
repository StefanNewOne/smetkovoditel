/**
 * One-time migration: copy the historically bulk-imported PDF documents (statements + Meta invoices)
 * into the app's servable attachment storage and rewrite their DB refs from `local:<file>` to a
 * servable `/api/attachments/<uuid>.pdf` URL, so every uploaded document becomes previewable in the
 * Import center.
 *
 * Sources (gitignored real data):
 *   statements → Фактури/ИЗВОДИ НЛБ/<filename>            (flat)
 *   receipts   → Фактури/ФАКТУРИ МЕТА/<client>/<file>.pdf  (tree; ref keeps the relative path)
 *
 * Target: apps/web/uploads — the dir the running Next.js server reads from (STORAGE_DIR="./uploads"
 * resolved against the server cwd = apps/web). NOT process.env.STORAGE_DIR, which would resolve
 * against this script's cwd (repo root) and miss the served dir.
 *
 * Idempotent: refs already pointing at /api/attachments/ are skipped; missing sources are reported,
 * their ref left untouched (still shows a name-only chip).
 *
 *   npx dotenv -e .env.local -- tsx scripts/migrate-local-attachments.ts           # dry-run
 *   npx dotenv -e .env.local -- tsx scripts/migrate-local-attachments.ts --apply   # copy + rewrite
 */
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { prisma } from "@smetko/db";

const ROOT = process.cwd();
const TARGET = path.join(ROOT, "apps", "web", "uploads");
const STMT_BASE = path.join(ROOT, "Фактури", "ИЗВОДИ НЛБ");
const META_BASE = path.join(ROOT, "Фактури", "ФАКТУРИ МЕТА");

/** Turn a `local:<rel>` ref into an absolute source path under `base` (handles \ and / separators). */
function sourcePath(base: string, ref: string): string {
  const rel = ref.replace(/^local:/, "");
  return path.join(base, ...rel.split(/[\\/]/));
}

interface Row {
  id: string;
  ref: string;
  base: string;
  label: string;
}

async function main() {
  const apply = process.argv.includes("--apply");

  const statements = await prisma.bankStatementImport.findMany({
    select: { id: true, fileRef: true, statementNumber: true },
  });
  const receipts = await prisma.adSpendReceipt.findMany({
    select: { id: true, attachmentUrl: true, referenceNumber: true },
  });

  const rows: Row[] = [
    ...statements
      .filter((s) => s.fileRef.startsWith("local:"))
      .map((s) => ({
        id: s.id,
        ref: s.fileRef,
        base: STMT_BASE,
        label: `извод ${s.statementNumber}`,
      })),
    ...receipts
      .filter((r) => r.attachmentUrl.startsWith("local:"))
      .map((r) => ({
        id: r.id,
        ref: r.attachmentUrl,
        base: META_BASE,
        label: `Meta ${r.referenceNumber}`,
      })),
  ];
  const isStmt = (base: string) => base === STMT_BASE;

  console.log("════ МИГРАЦИЈА НА ЛОКАЛНИ ДОКУМЕНТИ ════");
  console.log(
    `Изводи со local: ${statements.filter((s) => s.fileRef.startsWith("local:")).length} · Meta со local: ${receipts.filter((r) => r.attachmentUrl.startsWith("local:")).length}`,
  );
  console.log(`Извор изводи: ${STMT_BASE}\nИзвор Meta:  ${META_BASE}\nЦел:         ${TARGET}\n`);

  let copied = 0;
  const missing: string[] = [];
  if (apply) mkdirSync(TARGET, { recursive: true });

  for (const row of rows) {
    const src = sourcePath(row.base, row.ref);
    if (!existsSync(src)) {
      missing.push(`${row.label} → ${src}`);
      continue;
    }
    if (!apply) {
      copied++;
      continue;
    }
    const name = `${randomUUID()}.pdf`;
    copyFileSync(src, path.join(TARGET, name));
    const url = `/api/attachments/${name}`;
    if (isStmt(row.base)) {
      await prisma.bankStatementImport.update({ where: { id: row.id }, data: { fileRef: url } });
    } else {
      await prisma.adSpendReceipt.update({ where: { id: row.id }, data: { attachmentUrl: url } });
    }
    copied++;
  }

  console.log(`${apply ? "✓ Копирани + пренасочени" : "Ќе се копираат"}: ${copied}`);
  if (missing.length) {
    console.log(`\n⚠ ${missing.length} без изворен фајл (ref остана непроменет):`);
    missing.slice(0, 20).forEach((m) => console.log("  " + m));
    if (missing.length > 20) console.log(`  … +${missing.length - 20} повеќе`);
  }
  if (!apply) console.log("\n✓ Dry-run. Повтори со --apply.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
