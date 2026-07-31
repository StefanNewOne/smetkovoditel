/**
 * Import client giro accounts from the КЕШ_ФАКТУРА PDF (SM-85/90) — enables payer account → client
 * matching in the resolve screen. The PDF is plain-font (readable), unlike the NLB statements.
 * Format per invoice client: "<brand>ФАКТУРА<price> евра18%<ПРАВНО ЛИЦЕ>" then a line "<giro>".
 *   npx dotenv -e .env.local -- tsx scripts/import-giro.ts           # dry-run
 *   npx dotenv -e .env.local -- tsx scripts/import-giro.ts --apply   # write
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { prisma } from "@smetko/db";

const ROOT = resolve(import.meta.dirname, "..");
const GIRO = /^\d{3}-\d{10}-\d{2}$/;

const norm = (s: string) =>
  s
    .toUpperCase()
    .replace(/ДООЕЛ|Д\.?О\.?О\.?ЕЛ|Д\.?О\.?О\.?|ДОО|СКОПЈЕ|КОРП\.?/g, "")
    .replace(/[^А-ШA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function main() {
  const apply = process.argv.includes("--apply");
  const file = readdirSync(ROOT).find(
    (f) => f.toLowerCase().includes("кеш") && f.toLowerCase().endsWith(".pdf"),
  );
  if (!file) throw new Error("PDF со кеш/фактура не е најден во коренот.");
  const { text } = await pdfParse(readFileSync(resolve(ROOT, file)));
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Pair a legal name (tail after "18%") with the giro account on the following line.
  const pairs: { legal: string; giro: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/18%(.+)$/);
    const next = lines[i + 1] ?? "";
    if (m && GIRO.test(next)) pairs.push({ legal: m[1]!.trim(), giro: next });
  }

  const clients = await prisma.client.findMany({ select: { id: true, name: true } });
  const byNorm = new Map(clients.map((c) => [norm(c.name), c] as const));

  const matched: string[] = [];
  const unmatched: string[] = [];
  const conflicts: string[] = [];
  for (const p of pairs) {
    const client =
      byNorm.get(norm(p.legal)) ??
      clients.find(
        (c) => norm(c.name).includes(norm(p.legal)) || norm(p.legal).includes(norm(c.name)),
      );
    if (!client) {
      unmatched.push(`${p.legal} (${p.giro})`);
      continue;
    }
    const existing = await prisma.clientBankAccount.findUnique({ where: { account: p.giro } });
    if (existing && existing.clientId !== client.id) {
      conflicts.push(`${p.giro}: ${p.legal} vs веќе друг клиент`);
      continue;
    }
    matched.push(`${client.name} ← ${p.giro}`);
    if (apply) {
      await prisma.clientBankAccount.upsert({
        where: { account: p.giro },
        create: { clientId: client.id, account: p.giro, label: p.legal },
        update: { clientId: client.id, label: p.legal },
      });
    }
  }

  console.log(`════ ЖИРО-СМЕТКИ (${apply ? "APPLY" : "DRY-RUN"}) ════`);
  console.log(`Пронајдени парови: ${pairs.length}`);
  console.log(`\n✓ Спарени (${matched.length}):`);
  matched.forEach((m) => console.log("  " + m));
  console.log(`\n⚠ Неспарени клиенти (${unmatched.length}):`);
  unmatched.forEach((u) => console.log("  " + u));
  console.log(`\n⚠ Конфликти на сметка (${conflicts.length}):`);
  conflicts.forEach((c) => console.log("  " + c));
  console.log(apply ? "\n✓ Внесено." : "\n✓ Dry-run. Повтори со --apply.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
