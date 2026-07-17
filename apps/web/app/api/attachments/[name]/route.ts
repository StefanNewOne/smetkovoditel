import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { contentTypeFor, readAttachment } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/attachments/:name — serve a stored attachment (auth-gated, no path traversal). */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { name } = await params;
  const buf = await readAttachment(name);
  if (!buf) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": contentTypeFor(name), "Cache-Control": "private, max-age=3600" },
  });
}
