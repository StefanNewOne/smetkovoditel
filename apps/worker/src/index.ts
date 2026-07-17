import cron from "node-cron";
import pino from "pino";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

/**
 * Worker process (ADR-001 A2): Gmail polling + PDF parsing + matching, and the cron scheduler.
 * Phase 0 wires the schedule skeleton; the job bodies land in Ф1 (W1) and Ф2 (Gmail, parsers,
 * W7). Timezone Europe/Skopje (Master Plan §11).
 */
const TZ = "Europe/Skopje";

// W1 — Задолжувања: 1st of month 06:00 (Master Plan §W1).
cron.schedule(
  "0 6 1 * *",
  () => {
    log.info({ event: "cron.w1.charges.tick" }, "W1 charges — not implemented yet (Ф1, SM-12)");
  },
  { timezone: TZ },
);

// W7 — Курс: daily 07:00, НБРМ USD mid (Master Plan §W7).
cron.schedule(
  "0 7 * * *",
  () => {
    log.info({ event: "cron.w7.rate.tick" }, "W7 exchange rate — not implemented yet (Ф2, SM-37)");
  },
  { timezone: TZ },
);

// Gmail ingestion poll every N minutes (Master Plan §4.1). Body lands in Ф2 (SM-30).
const pollMinutes = Number(process.env.GMAIL_POLL_MINUTES ?? "12");
cron.schedule(`*/${pollMinutes} * * * *`, () => {
  log.info({ event: "gmail.poll.tick" }, "Gmail ingestion — not implemented yet (Ф2, SM-30)");
});

log.info(
  { tz: TZ, pollMinutes },
  "Finance OS worker started — cron schedules registered (job bodies pending Ф1/Ф2)",
);
