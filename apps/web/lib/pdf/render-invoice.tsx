import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { ChargeKind, prisma } from "@smetko/db";
import { registerFonts } from "./fonts";
import { InvoiceDocument, type InvoiceData, type InvoiceLine } from "./invoice-document";

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("mk-MK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Render an issued invoice (INVOICE with a number) to a PDF buffer, or null if not eligible. */
export async function renderInvoicePdf(chargeId: string): Promise<Buffer | null> {
  const charge = await prisma.charge.findUnique({
    where: { id: chargeId },
    include: { client: true, lines: true },
  });
  if (!charge || charge.kind !== ChargeKind.INVOICE || !charge.invoiceNumber) return null;

  const lines: InvoiceLine[] = charge.lines.map((l) => {
    const vat = Math.round(l.amount * l.vatRate);
    const refs = (l.sourceRefs as { expenseId: string }[] | null) ?? [];
    return {
      description: l.description,
      subDescription:
        refs.length > 0 ? `Следливост: ${refs.length} ставки (sourceRefs)` : undefined,
      base: l.amount,
      vat,
      amount: l.amount + vat,
    };
  });

  const data: InvoiceData = {
    invoiceNumber: charge.invoiceNumber,
    issueDate: fmtDate(charge.issueDate),
    dueDate: fmtDate(charge.dueDate),
    client: {
      name: charge.client.name,
      taxId: charge.client.taxId,
      address: charge.client.address,
    },
    lines,
    subtotal: charge.subtotal,
    vatAmount: charge.vatAmount,
    total: charge.total,
  };

  registerFonts();
  return renderToBuffer(<InvoiceDocument data={data} />);
}
