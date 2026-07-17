import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { renderInvoicePdf } from "@/lib/pdf/render-invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /charges/:id/invoice — streams the invoice PDF inline (auth-gated). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const pdf = await renderInvoicePdf(id);
  if (!pdf) return new NextResponse("Фактурата не постои или не е издадена.", { status: 404 });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="faktura-${id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
