/**
 * SM-85/SM-87 backfill: assign a fixed client number to every client (stable, by name), then set
 * the internal reference `1-{clientNo}/{M}-{YYYY}` on every existing charge. Idempotent — only fills
 * rows that are still null.
 *   npx dotenv -e .env.local -- tsx scripts/backfill-revision1.ts
 */
import { prisma } from "@smetko/db";
import { internalRef } from "@smetko/shared";

async function main() {
  const toNumber = await prisma.client.findMany({
    where: { number: null },
    orderBy: { name: "asc" },
  });
  const max = await prisma.client.aggregate({ _max: { number: true } });
  let next = (max._max.number ?? 0) + 1;
  for (const c of toNumber) {
    await prisma.client.update({ where: { id: c.id }, data: { number: next } });
    console.log(`  #${next} → ${c.name}`);
    next++;
  }

  const charges = await prisma.charge.findMany({
    where: { internalRef: null },
    include: { client: { select: { number: true } } },
  });
  let set = 0;
  for (const ch of charges) {
    if (ch.client.number == null) continue;
    await prisma.charge.update({
      where: { id: ch.id },
      data: { internalRef: internalRef(ch.client.number, ch.period) },
    });
    set++;
  }
  console.log(`\n✓ Client numbers assigned: ${toNumber.length} · internalRef set: ${set}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
