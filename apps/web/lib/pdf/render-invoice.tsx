import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { ChargeKind, prisma } from "@smetko/db";
import { VAT_RATE } from "@smetko/shared";
import { getCompanyProfile } from "@/lib/company";
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

  const issuer = await getCompanyProfile();

  const lines: InvoiceLine[] = charge.lines.map((l) => {
    const refs = (l.sourceRefs as { expenseId: string }[] | null) ?? [];
    // Lines are single-amount in v1; the real invoices always show quantity 1 with the unit price
    // equal to the base. Kept explicit so a future multi-quantity line can slot in unchanged.
    return {
      description: l.description,
      subDescription:
        refs.length > 0 ? `Следливост: ${refs.length} ставки (sourceRefs)` : undefined,
      quantity: 1,
      unitPrice: l.amount,
      base: l.amount,
    };
  });

  // Derive the printed VAT rate from the charge so it can never mislabel (the owner's old Word
  // template showed "ДДВ 0 %" while charging 18%). Falls back to the configured VAT_RATE.
  const vatRatePct =
    charge.subtotal > 0
      ? Math.round((charge.vatAmount / charge.subtotal) * 100)
      : Math.round(VAT_RATE * 100);

  const data: InvoiceData = {
    invoiceNumber: charge.invoiceNumber,
    issueDate: fmtDate(charge.issueDate),
    dueDate: fmtDate(charge.dueDate),
    place: "Скопје",
    issuer,
    client: {
      name: charge.client.legalName || charge.client.name,
      taxId: charge.client.taxId,
      address: charge.client.address,
    },
    lines,
    subtotal: charge.subtotal,
    vatAmount: charge.vatAmount,
    vatRatePct,
    total: charge.total,
  };

  registerFonts();
  return renderToBuffer(<InvoiceDocument data={data} />);
}
