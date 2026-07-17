import cron from "node-cron";
import pino from "pino";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

/**
 * Worker (ADR-001 A2): Gmail polling + parsing (Ф2 SM-30, pending OAuth creds) and the cron
 * scheduler. Business logic lives in the web app; cron jobs are triggered via its guarded HTTP
 * endpoints (the GoDigital pattern). Timezone Europe/Skopje (Master Plan §11).
 */
const TZ = "Europe/Skopje";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

async function trigger(job: string): Promise<void> {
  try {
    const res = await fetch(`${APP_URL}/api/cron/${job}?secret=${encodeURIComponent(CRON_SECRET)}`);
    const body = await res.text();
    log.info({ event: `cron.${job}`, status: res.status, body }, `cron ${job} triggered`);
  } catch (err) {
    log.error({ event: `cron.${job}.error`, err }, `cron ${job} failed`);
  }
}

// W1 — Задолжувања: 1st of month 06:00.
cron.schedule("0 6 1 * *", () => void trigger("w1"), { timezone: TZ });

// W4 — Dunning: daily 06:30 (mark overdue; email reminders once Gmail is wired, SM-30).
cron.schedule("30 6 * * *", () => void trigger("dunning"), { timezone: TZ });

// W7 — Курс: daily 07:00 (НБРМ USD mid). Triggers the guarded app endpoint (SM-37).
cron.schedule("0 7 * * *", () => void trigger("w7"), { timezone: TZ });

// Gmail ingestion poll (Master Plan §4.1, SM-30). Triggers the guarded app endpoint, which
// no-ops until GMAIL_* OAuth secrets are configured at go-live.
const pollMinutes = Number(process.env.GMAIL_POLL_MINUTES ?? "12");
cron.schedule(`*/${pollMinutes} * * * *`, () => void trigger("gmail"), { timezone: TZ });

log.info({ tz: TZ, appUrl: APP_URL }, "Finance OS worker started — cron schedules registered");
