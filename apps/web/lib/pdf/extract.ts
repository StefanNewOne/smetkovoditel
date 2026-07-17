import "server-only";
// Use the lib entry directly — pdf-parse's index.js runs a debug block on import.
import pdfParse from "pdf-parse/lib/pdf-parse.js";

/** Extract text from a PDF buffer (NLB statements + Meta receipts). */
export async function extractPdfText(buf: Buffer): Promise<string> {
  const data = await pdfParse(buf);
  return data.text;
}

/** Route an uploaded document by content: Meta receipt vs NLB statement. */
export function detectDocType(text: string): "META" | "NLB" | "UNKNOWN" {
  if (/Receipt for /.test(text)) return "META";
  if (text.includes("210-0768360001-38")) return "NLB";
  return "UNKNOWN";
}
