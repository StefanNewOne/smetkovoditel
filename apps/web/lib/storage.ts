import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Attachment storage. Local disk in dev (STORAGE_DIR); swap to S3/MinIO later (A6) behind the
 * same interface. Files are served via /api/attachments/<name> (auth-gated).
 */
const DIR = process.env.STORAGE_DIR || path.join(process.cwd(), "uploads");
const NAME_RE = /^[a-zA-Z0-9_-]+\.[a-z0-9]+$/; // no path traversal

export async function saveAttachment(
  bytes: Buffer,
  ext: string,
): Promise<{ name: string; url: string }> {
  await mkdir(DIR, { recursive: true });
  const safeExt = (ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin").slice(0, 5);
  const name = `${randomUUID()}.${safeExt}`;
  await writeFile(path.join(DIR, name), bytes);
  return { name, url: `/api/attachments/${name}` };
}

export async function readAttachment(name: string): Promise<Buffer | null> {
  if (!NAME_RE.test(name)) return null;
  try {
    return await readFile(path.join(DIR, name));
  } catch {
    return null;
  }
}

export function contentTypeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  return "image/jpeg";
}
