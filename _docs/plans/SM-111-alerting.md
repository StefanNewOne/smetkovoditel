# SM-111 — Import / worker alerting

**Type:** Feature · **Refs:** Master Plan §13 (a format change never books incorrectly → alarm),
B14 (integrity gate → alarm), §4.4 (rate sanity ±6% → alarm). Builds on SM-110 (the guards now
exist; this makes their failures visible).

## Problem

The Master Plan mandates an **alarm** when a statement fails the integrity gate, continuity breaks,
or the USD/MKD rate sanity is outside ±6%. Today these only reach a Pino `log.error/warn` line —
nobody is notified, and there is no durable, acknowledgeable record. A failed automated Gmail import
can therefore pass unnoticed until someone opens the Import center.

## Design

1. **`SystemAlert` table** (append-only until acknowledged) — `type`, `severity`, `title`, `detail`,
   `context Json?`, `createdAt`, `acknowledgedAt?`, `acknowledgedById?`. Enum `AlertType`:
   `INTEGRITY_FAILED · CONTINUITY_GAP · IMPORT_FAILED · RATE_SANITY · MATCH_ERROR`.

2. **`raiseAlert()`** (`lib/alerts.ts`) — persists the row, logs it (structured, no PII/amounts tied
   to a named party), and **best-effort** emails `ALERT_EMAIL` (fallback `GMAIL_SENDER`) via the
   existing `createMailSender()`. Email is wrapped so a send failure never breaks the import path.
   Also `listAlerts()`, `acknowledgeAlert()`, `countOpenAlerts()`.

3. **Emission points** (`w2.ts`): continuity gap, integrity fail, rate-sanity out of band (runMatching),
   and the per-receipt match error (the SM-110 catch). Each raiseAlert is fire-and-forget-safe.

4. **Surface:** an "Аларми" nav item with an unacknowledged-count badge (mirrors `openImportCount`),
   and an `/alerts` page listing alerts with an "Означи како видено" (acknowledge) action (writer only).

5. **Env:** `ALERT_EMAIL` added to `.env.example`.

## Tests

Integration: a statement that fails the integrity gate raises exactly one `INTEGRITY_FAILED` alert;
acknowledging it drops the open count. Rate-sanity path raises a `RATE_SANITY` alert.

## Out of scope (follow-up)

Telegram/SMS transport, per-user alert routing, auto-resolution when a later statement fills a
continuity gap.
