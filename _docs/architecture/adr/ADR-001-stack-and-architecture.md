# ADR-001 — Stack & architecture (Phase 0 decisions closed)

**Status:** Accepted · **Date:** 2026-07-17 · **Decider:** delegated to Claude Code, per how
prior GoDigital/Go-Code-Mk projects were built.
**Context:** Master Plan §11 fixes the broad stack (Next.js/Node + Prisma + PostgreSQL, Docker on
VPS, Gmail ingestion). The remaining build decisions (A1–A7 in `IMPLEMENTATION_PLAN.md`) are
closed here so Phase 0 can begin. The domain (D1–D6, W1–W9, B1–B18, T1–T14) has zero open
questions.

## Decisions

| #   | Decision      | Chosen                                                                                                                                                      | Rationale                                                                                                                           |
| --- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A1  | App framework | **Next.js 15 (App Router)** full-stack (route handlers + server actions) + Prisma                                                                           | Master Plan §11 names Next.js; one deployable surface for UI + API; server-side PDF/Cyrillic rendering.                             |
| A2  | Worker / cron | **Separate `apps/worker`** process: Gmail polling, PDF parsing, matching; in-process `node-cron` for W1 (1st 06:00) and W7 (daily 07:00)                    | Matches §11's separate worker/cron Docker services; keeps long polling/parsing out of the request path.                             |
| A3  | Auth          | **App-managed session** — `bcryptjs` password hashing + `iron-session` encrypted cookie; role stored in session, re-validated server-side on every mutation | Few static employees (like sibling GoDigital's own auth); no external IdP dependency; fully auditable — right for a financial tool. |
| A4  | Repo layout   | **npm workspaces monorepo:** `apps/web`, `apps/worker`, `packages/db` (Prisma), `packages/shared` (Zod, `money.ts`, enums)                                  | Mirrors sibling GoDigital (npm workspaces); shares the Prisma client + Zod schemas across web and worker without duplication.       |
| A5  | Invoice PDF   | **`@react-pdf/renderer` server-side**, embedded Cyrillic font (Manrope)                                                                                     | Master Plan §7 requires Cyrillic typography; server-side keeps generation deterministic and testable (unlike client-side jsPDF).    |
| A6  | Attachments   | **MinIO (S3-compatible) locally**; local volume + **daily offsite backup** in prod; retention ≥ 10 y                                                        | Master Plan §11; S3 API means the cloud swap is a config change.                                                                    |
| A7  | Work tracking | **Local backlog** `_docs/plans/backlog.md` with `SM-<N>` IDs                                                                                                | Fresh personal repo, solo dev, no Jira project; local-first matches current sibling practice.                                       |

## Consequences

- Node 24+ runtime (dev env has Node 26). TypeScript `strict`, no `any`.
- Money is `Int` денари end to end; the only `Float` is `ExchangeRate.midMkd` (a USD rate, not money).
- The Prisma schema is transcribed **literally** from Master Plan ДЕЛ II — its `@@unique`
  constraints are load-bearing (they make duplicate import B13 and double-billing B15/B16
  structurally impossible).
- Deploy is local-first (`scripts/deploy.sh`) — no hosted CI, per CLAUDE.md Category 5.

## Values still required before go-live (not blocking Phase 0)

VPS IP + staging/production URLs · Gmail ingestion mailbox + sender + OAuth credentials · НБРМ
USD rate source URL · last invoice number (numbering continuation) · opening balances (bank +
blagajna) · final logo/design for the invoice template. Tracked in `IMPLEMENTATION_PLAN.md` §Go-live.
