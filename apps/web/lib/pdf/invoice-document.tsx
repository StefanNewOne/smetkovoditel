import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatMKD } from "@smetko/shared";

export interface InvoiceLine {
  description: string;
  subDescription?: string; // sourceRefs traceability (§7)
  quantity: number;
  unitPrice: number; // дени
  base: number; // дени (= quantity * unitPrice)
}

export interface InvoiceIssuer {
  name: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
  bankName: string;
  account: string;
  director: string;
  invoiceFooter: string;
}

export interface InvoiceData {
  invoiceNumber: string;
  issueDate: string; // formatted dd.MM.yyyy
  dueDate: string;
  place: string; // место на издавање (Скопје)
  issuer: InvoiceIssuer;
  client: { name: string; taxId: string | null; address: string | null };
  lines: InvoiceLine[];
  subtotal: number;
  vatAmount: number;
  vatRatePct: number; // 18 (derived from the charge — never a hardcoded label)
  total: number;
}

const ink = "#1a2333";
const muted = "#5b6878";

const s = StyleSheet.create({
  page: { fontFamily: "Manrope", fontSize: 10, color: ink, padding: 46, lineHeight: 1.5 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 26 },
  logoRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  logoBox: {
    backgroundColor: "#3b76d1",
    color: "#fff",
    fontSize: 13,
    fontWeight: 800,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 3,
    marginRight: 5,
  },
  logoWord: { fontSize: 13, fontWeight: 800, letterSpacing: 2 },
  issuerName: { fontWeight: 700 },
  issuerLine: { fontSize: 9, color: muted },
  // Explicit lineHeight so the large title's line box is sized from its own fontSize (not the
  // inherited page lineHeight, which sized it from the 10px base and let the glyphs overflow onto
  // the "Бр." line). marginBottom guarantees clear separation from the invoice number.
  invoiceTitle: {
    fontSize: 20,
    fontWeight: 800,
    textAlign: "right",
    lineHeight: 1.3,
    marginBottom: 4,
  },
  invoiceMeta: { fontSize: 9, color: muted, textAlign: "right", lineHeight: 1.4 },
  recipientBox: {
    borderWidth: 1,
    borderColor: "#e7ecf3",
    borderRadius: 4,
    padding: 10,
    marginBottom: 20,
    width: "60%",
  },
  microLabel: {
    fontSize: 8,
    color: muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 3,
  },
  tHead: {
    flexDirection: "row",
    borderBottomWidth: 2,
    borderBottomColor: ink,
    paddingBottom: 5,
    marginBottom: 4,
  },
  tHeadCell: { fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 },
  tRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#f2f5f9",
  },
  cDesc: { width: "46%" },
  cQty: { width: "12%", textAlign: "right" },
  cNum: { width: "21%", textAlign: "right" },
  subDesc: { fontSize: 8, color: muted, marginTop: 1 },
  totals: { marginTop: 12, marginLeft: "auto", width: "45%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 2,
    borderTopColor: ink,
    marginTop: 4,
    paddingTop: 5,
  },
  grandLabel: { fontSize: 12, fontWeight: 800 },
  footer: { marginTop: 30 },
  refNote: { fontSize: 10, fontWeight: 700 },
  clauses: { fontSize: 8, color: muted, marginTop: 6 },
  placeDate: { fontSize: 9, color: muted, marginTop: 16 },
  sign: { marginTop: 28, flexDirection: "row", justifyContent: "flex-end" },
  signBox: { width: 200, alignItems: "center" },
  signLabel: { fontSize: 9, color: muted, marginBottom: 26 },
  signLine: {
    width: 200,
    borderTopWidth: 1,
    borderTopColor: muted,
    paddingTop: 4,
    fontSize: 9,
    fontWeight: 700,
    textAlign: "center",
  },
});

const den = (v: number) => `${formatMKD(v)} ден`;

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  const { issuer } = data;
  const contact = [issuer.phone, issuer.email].filter(Boolean).join(" · ");
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View>
            <View style={s.logoRow}>
              <Text style={s.logoBox}>GO</Text>
              <Text style={s.logoWord}>DIGITAL</Text>
            </View>
            <Text style={s.issuerName}>{issuer.name}</Text>
            <Text style={s.issuerLine}>{issuer.address}</Text>
            {contact ? <Text style={s.issuerLine}>{contact}</Text> : null}
            <Text style={s.issuerLine}>Даночен број: {issuer.taxId}</Text>
            <Text style={s.issuerLine}>
              {issuer.bankName} · {issuer.account}
            </Text>
          </View>
          <View>
            <Text style={s.invoiceTitle}>ФАКТУРА</Text>
            <Text style={s.invoiceMeta}>Бр. {data.invoiceNumber}</Text>
            <Text style={s.invoiceMeta}>Датум на издавање: {data.issueDate}</Text>
            <Text style={s.invoiceMeta}>Рок на плаќање: {data.dueDate}</Text>
          </View>
        </View>

        <View style={s.recipientBox}>
          <Text style={s.microLabel}>Примач</Text>
          <Text style={{ fontWeight: 700 }}>{data.client.name}</Text>
          {data.client.taxId ? (
            <Text style={s.issuerLine}>ЕДБ: {data.client.taxId}</Text>
          ) : (
            <Text style={[s.issuerLine, { color: "#c2483f" }]}>ЕДБ: — (недостасува)</Text>
          )}
          {data.client.address ? <Text style={s.issuerLine}>{data.client.address}</Text> : null}
        </View>

        <View style={s.tHead}>
          <Text style={[s.tHeadCell, s.cDesc]}>Опис</Text>
          <Text style={[s.tHeadCell, s.cQty]}>Количина</Text>
          <Text style={[s.tHeadCell, s.cNum]}>Единечна цена</Text>
          <Text style={[s.tHeadCell, s.cNum]}>Износ</Text>
        </View>

        {data.lines.map((l, i) => (
          <View style={s.tRow} key={i}>
            <View style={s.cDesc}>
              <Text>{l.description}</Text>
              {l.subDescription ? <Text style={s.subDesc}>{l.subDescription}</Text> : null}
            </View>
            <Text style={s.cQty}>{l.quantity}</Text>
            <Text style={s.cNum}>{den(l.unitPrice)}</Text>
            <Text style={s.cNum}>{den(l.base)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text style={{ color: muted }}>Основица</Text>
            <Text>{den(data.subtotal)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={{ color: muted }}>ДДВ {data.vatRatePct}%</Text>
            <Text>{den(data.vatAmount)}</Text>
          </View>
          <View style={s.grandRow}>
            <Text style={s.grandLabel}>За плаќање</Text>
            <Text style={s.grandLabel}>{den(data.total)}</Text>
          </View>
        </View>

        <View style={s.footer}>
          <Text style={s.refNote}>
            При плаќање наведете повикување на број: {data.invoiceNumber}
          </Text>
          {issuer.invoiceFooter ? <Text style={s.clauses}>{issuer.invoiceFooter}</Text> : null}
          <Text style={s.placeDate}>
            {data.place}, {data.issueDate}
          </Text>
        </View>

        <View style={s.sign}>
          <View style={s.signBox}>
            <Text style={s.signLabel}>Управител</Text>
            <Text style={s.signLine}>{issuer.director}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
