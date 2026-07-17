# GoDigital Finance OS — Сметководител

Internal financial system for **АЛМА ДИЗАЈН ДООЕЛ Скопје** (brand GoDigital): monthly charging,
NLB statement import + matching, Meta Ads 1:1 re-billing, cash ledger, contractor payroll with
billable allocations, reporting, and monthly close. Strictly MKD; money is integer дени.

## Read first

- **`CLAUDE.md`** — the living constitution (rules, conventions, domain invariants).
- **`_docs/architecture/MASTER_PLAN_v2.1_FINAL.md`** — the authoritative domain spec (data model,
  parsers, W1–W9, B1–B18, T1–T14, D1–D6).
- **`_docs/plans/IMPLEMENTATION_PLAN.md`** + **`_docs/plans/backlog.md`** — phased build (Ф0–Ф4).
- **`_docs/architecture/adr/ADR-001-stack-and-architecture.md`** — closed stack decisions.
- **`_docs/design/`** — design tokens + the read-only Claude Design handoff.

## Stack

Next.js 15 (App Router) + React 19 + TypeScript + Prisma + PostgreSQL + Tailwind 4. A separate
worker handles Gmail ingestion, PDF parsing, matching, and cron (W1/W7). npm workspaces monorepo.

```
apps/web        Next.js app (UI + API)
apps/worker     Gmail poll + parsers + matching + cron
packages/db     Prisma schema + client (schema = Master Plan ДЕЛ II, literal)
packages/shared Zod schemas, money.ts (integer дени), nav
```

## Local development

```bash
cp .env.example .env.local          # fill in values
npm install
docker compose up -d                # Postgres + MinIO + Mailhog
npm run db:generate                 # prisma generate
npm run db:migrate                  # create the schema
npm run --workspace=@smetko/db seed # seed admin user + period + bank account
npm run dev                         # http://localhost:3000  (login: kekic@godigital.com.mk / smetko-dev)
```

Worker: `npm run dev --workspace=@smetko/worker`.

## Quality gate

```bash
npm run lint && npm run typecheck && npm run build   # runs on pre-push
npm test                                             # with the Docker stack up
```
