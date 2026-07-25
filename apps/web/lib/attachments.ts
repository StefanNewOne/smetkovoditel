/**
 * Resolve a stored attachment reference for display (shared by the Import center and Решавање).
 * Files uploaded via the app (or the Gmail worker) carry a servable `/api/attachments/<name>` URL;
 * historical bulk-imported docs carry a `local:<file>` marker whose bytes live on disk, not in the
 * app — those are shown by name only, not linked.
 */
export function attachmentRef(ref: string | null | undefined): {
  pdfUrl: string | null;
  pdfName: string | null;
} {
  if (!ref) return { pdfUrl: null, pdfName: null };
  if (ref.startsWith("/api/attachments/")) return { pdfUrl: ref, pdfName: null };
  const name =
    ref
      .replace(/^local:/, "")
      .split(/[\\/]/)
      .pop() || ref;
  return { pdfUrl: null, pdfName: name };
}
