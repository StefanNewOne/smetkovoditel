import "server-only";
import type {
  GmailAttachment,
  GmailClient,
  GmailLabel,
  GmailMessage,
} from "@/lib/workflows/gmail-pipeline";
import type { MailClient } from "@/lib/workflows/w4-reminders";
import { extractPdfText } from "@/lib/pdf/extract";

/**
 * Gmail REST adapter for the ingestion pipeline (Master Plan §4.1, §11, SM-30). Uses the OAuth2
 * offline refresh-token flow over the Gmail REST API (no MCP — CLAUDE.md "MCP Servers"). This is
 * the LIVE transport: it is exercised at go-live once GMAIL_* secrets exist, and is intentionally
 * NOT unit-tested (the pipeline logic in gmail-pipeline.ts is). createGmailClient() returns null
 * when credentials are absent so the cron endpoint degrades to a no-op instead of failing.
 */
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface GmailPart {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string };
  parts?: GmailPart[];
}

function collectAttachments(part: GmailPart | undefined, out: GmailAttachment[]): void {
  if (!part) return;
  if (part.filename && part.body?.attachmentId) {
    out.push({ attachmentId: part.body.attachmentId, filename: part.filename });
  }
  for (const p of part.parts ?? []) collectAttachments(p, out);
}

function headerValue(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** Build the live Gmail client, or null if OAuth env is not configured. */
export function createGmailClient(): GmailClient | null {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  let accessToken: string | null = null;
  const labelIds = new Map<string, string>();

  async function token(): Promise<string> {
    if (accessToken) return accessToken;
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        refresh_token: refreshToken!,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) throw new Error(`Gmail token HTTP ${res.status}`);
    const json = (await res.json()) as { access_token: string };
    accessToken = json.access_token;
    return accessToken;
  }

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${GMAIL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await token()}`, ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`Gmail ${path} HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }

  async function labelId(name: GmailLabel): Promise<string> {
    if (labelIds.has(name)) return labelIds.get(name)!;
    const { labels } = await api<{ labels: { id: string; name: string }[] }>("/labels");
    let found = labels.find((l) => l.name === name);
    if (!found) {
      found = await api<{ id: string; name: string }>("/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    }
    labelIds.set(name, found.id);
    return found.id;
  }

  return {
    async listInbox(): Promise<GmailMessage[]> {
      const list = await api<{ messages?: { id: string }[] }>(
        "/messages?q=" + encodeURIComponent("has:attachment -label:Processed -label:Failed"),
      );
      const messages: GmailMessage[] = [];
      for (const { id } of list.messages ?? []) {
        const full = await api<{
          payload: GmailPart & { headers: { name: string; value: string }[] };
        }>(`/messages/${id}?format=full`);
        const attachments: GmailAttachment[] = [];
        collectAttachments(full.payload, attachments);
        if (attachments.length === 0) continue;
        messages.push({ id, from: headerValue(full.payload.headers, "From"), attachments });
      }
      return messages;
    },

    async getAttachmentText(messageId: string, att: GmailAttachment): Promise<string> {
      const data = await api<{ data: string }>(
        `/messages/${messageId}/attachments/${att.attachmentId}`,
      );
      const buf = Buffer.from(data.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      return extractPdfText(buf);
    },

    async label(messageId: string, label: GmailLabel): Promise<void> {
      await api(`/messages/${messageId}/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addLabelIds: [await labelId(label)] }),
      });
    },
  };
}

async function fetchAccessToken(id: string, secret: string, refresh: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Gmail token HTTP ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/**
 * Live outbound mail sender over the Gmail REST API (invoice reminders — SM-50). Returns null
 * when OAuth/sender env is absent. Cyrillic-safe: the Subject uses a MIME encoded-word and the
 * body is UTF-8. Not unit-tested (the reminder selection logic in w4-reminders.ts is).
 */
export function createMailSender(): MailClient | null {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const sender = process.env.GMAIL_SENDER;
  if (!clientId || !clientSecret || !refreshToken || !sender) return null;

  return {
    async send({ to, subject, body }) {
      const token = await fetchAccessToken(clientId, clientSecret, refreshToken);
      const subjectMime = `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
      const raw = [
        `From: ${sender}`,
        `To: ${to}`,
        `Subject: ${subjectMime}`,
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="UTF-8"',
        "",
        body,
      ].join("\r\n");
      const res = await fetch(`${GMAIL}/messages/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: Buffer.from(raw, "utf8").toString("base64url") }),
      });
      if (!res.ok) throw new Error(`Gmail send HTTP ${res.status}`);
    },
  };
}
