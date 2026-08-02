import "server-only";
import { prisma } from "@smetko/db";

/**
 * SM-113 — the issuer identity used on invoices (Master Plan D1). Single "default" row. Defaults
 * mirror the seed so the invoice renders correctly even before the row is edited (or in tests).
 */
export const COMPANY_DEFAULTS = {
  name: "АЛМА ДИЗАЈН ДООЕЛ Скопје",
  address: "ул. Илинденска бр. 97, Скопје",
  phone: "078 243 197",
  email: "almadizajn@gmail.com",
  taxId: "4032023558371",
  bankName: "НЛБ Банка АД Скопје",
  account: "210-0768360001-38",
  director: "Маја Кекиќ",
  invoiceFooter:
    "По истекот на рокот за плаќање се пресметува затезна камата според банкарските услови. Дополнителни рекламации не се прифаќаат.",
};

export type CompanyProfileData = typeof COMPANY_DEFAULTS;

export async function getCompanyProfile(): Promise<CompanyProfileData> {
  const p = await prisma.companyProfile.findUnique({ where: { id: "default" } });
  if (!p) return COMPANY_DEFAULTS;
  return {
    name: p.name,
    address: p.address,
    phone: p.phone ?? "",
    email: p.email ?? "",
    taxId: p.taxId,
    bankName: p.bankName,
    account: p.account,
    director: p.director,
    invoiceFooter: p.invoiceFooter,
  };
}
