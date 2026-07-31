import "server-only";
import type { ImportSource } from "@smetko/db";

/**
 * Gmail ingestion pipeline (Master Plan §4.1, SM-30). PURE routing + orchestration — no transport.
 * A GmailClient adapter (worker) supplies messages, attachment text, and labelling; this module
 * routes each attachment to the NLB or Meta ingester and labels the message Processed/Failed.
 *
 * Idempotency is layered: the adapter's listInbox() returns only UN-labelled messages, so a
 * re-poll skips already-handled mail; the ingesters themselves dedupe (B13/receipt Message-ID),
 * so even a re-delivered message books nothing twice.
 */
export type GmailLabel = "Processed" | "Failed";

export interface GmailAttachment {
  attachmentId: string;
  filename: string;
}
export interface GmailMessage {
  id: string; // Gmail Message-ID
  from: string;
  attachments: GmailAttachment[];
}
export interface GmailClient {
  /** Messages with attachments that are NOT yet labelled Processed/Failed. */
  listInbox(): Promise<GmailMessage[]>;
  /** Download an attachment and extract its text (PDF → text in the adapter). */
  getAttachmentText(messageId: string, att: GmailAttachment): Promise<string>;
  label(messageId: string, label: GmailLabel): Promise<void>;
}

export interface IngestHandlers {
  ingestStatement: (
    text: string,
    fileRef: string,
    source: ImportSource,
    userId: string,
  ) => Promise<{ status: string }>;
  ingestReceipt: (text: string, fileRef: string, userId: string) => Promise<{ status: string }>;
}

export type Route = "NLB" | "META" | null;

/**
 * Route an attachment by filename (primary) then sender (fallback), per §4.1:
 *   `DpsStatement*`  → NLB statement parser
 *   `Transaction__*` → Meta receipt parser
 */
export function routeAttachment(filename: string, from = ""): Route {
  const f = filename.toLowerCase();
  if (f.startsWith("dpsstatement")) return "NLB";
  if (f.startsWith("transaction_")) return "META";
  const sender = from.toLowerCase();
  if (sender.includes("nlb")) return "NLB";
  if (sender.includes("facebook") || sender.includes("meta")) return "META";
  return null;
}

export interface InboxSummary {
  messages: number;
  processed: number;
  failed: number;
  statements: number;
  receipts: number;
  skipped: number; // duplicates / non-routable
}

/**
 * Process every un-labelled inbox message. A message is labelled Failed if any routed attachment
 * throws or ingests as FAILED/PARTIAL (→ manual queue), otherwise Processed. Messages with no
 * routable attachment are left untouched (not ours).
 */
export async function processInbox(
  gmail: GmailClient,
  handlers: IngestHandlers,
  userId: string,
): Promise<InboxSummary> {
  const summary: InboxSummary = {
    messages: 0,
    processed: 0,
    failed: 0,
    statements: 0,
    receipts: 0,
    skipped: 0,
  };

  for (const msg of await gmail.listInbox()) {
    let handledAny = false;
    let anyFailure = false;

    for (const att of msg.attachments) {
      const route = routeAttachment(att.filename, msg.from);
      if (!route) continue;
      handledAny = true;
      const fileRef = `gmail:${msg.id}:${att.filename}`;
      try {
        const text = await gmail.getAttachmentText(msg.id, att);
        if (route === "NLB") {
          const r = await handlers.ingestStatement(text, fileRef, "EMAIL" as ImportSource, userId);
          if (r.status === "FAILED") anyFailure = true;
          else if (r.status === "PARSED") summary.statements++;
          else summary.skipped++; // DUPLICATE_SKIPPED
        } else {
          const r = await handlers.ingestReceipt(text, fileRef, userId);
          if (r.status === "PARTIAL") anyFailure = true;
          else if (r.status === "PARSED") summary.receipts++;
          else summary.skipped++; // DUPLICATE_SKIPPED
        }
      } catch {
        anyFailure = true; // parse/transport error → manual queue, never a wrong booking (§13)
      }
    }

    if (!handledAny) continue;
    summary.messages++;
    const label: GmailLabel = anyFailure ? "Failed" : "Processed";
    await gmail.label(msg.id, label);
    if (anyFailure) summary.failed++;
    else summary.processed++;
  }

  return summary;
}
