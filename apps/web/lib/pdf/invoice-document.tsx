import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatMKD } from "@smetko/shared";

export interface InvoiceLine {
  description: string;
  subDescription?: string; // sourceRefs traceability (§7)
  base: number; // дени
  vat: number; // дени
  amount: number; // дени (base + vat)
}

export interface InvoiceData {
  invoiceNumber: string;
  issueDate: string; // formatted dd.MM.yyyy
  dueDate: string;
  client: { name: string; taxId: string | null; address: string | null };
  lines: InvoiceLine[];
  subtotal: number;
  vatAmount: number;
  total: number;
}

// АЛМА ДИЗАЈН ДООЕЛ Скопје (D1, §7.1).
const ISSUER = {
  name: "АЛМА ДИЗАЈН ДООЕЛ Скопје",
  taxId: "4032023558371",
  account: "210-0768360001-38",
  bank: "НЛБ Банка АД Скопје",
};

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
  issuerLine: { fontSize: 9, color: muted },
  invoiceTitle: { fontSize: 20, fontWeight: 800, textAlign: "right" },
  invoiceMeta: { fontSize: 9, color: muted, textAlign: "right" },
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
  cDesc: { width: "52%" },
  cNum: { width: "16%", textAlign: "right" },
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
  footer: { marginTop: 34 },
  refNote: { fontSize: 10, fontWeight: 700 },
  sign: { marginTop: 40, flexDirection: "row", justifyContent: "flex-end" },
  signLine: {
    width: 180,
    borderTopWidth: 1,
    borderTopColor: muted,
    paddingTop: 4,
    fontSize: 9,
    color: muted,
    textAlign: "center",
  },
});

const den = (v: number) => `${formatMKD(v)} ден`;

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View>
            <View style={s.logoRow}>
              <Text style={s.logoBox}>GO</Text>
              <Text style={s.logoWord}>DIGITAL</Text>
            </View>
            <Text style={{ fontWeight: 700 }}>{ISSUER.name}</Text>
            <Text style={s.issuerLine}>Даночен број: {ISSUER.taxId}</Text>
            <Text style={s.issuerLine}>Жиро сметка: {ISSUER.account}</Text>
            <Text style={s.issuerLine}>{ISSUER.bank}</Text>
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
          {data.client.taxId ? <Text style={s.issuerLine}>ЕДБ: {data.client.taxId}</Text> : null}
          {data.client.address ? <Text style={s.issuerLine}>{data.client.address}</Text> : null}
        </View>

        <View style={s.tHead}>
          <Text style={[s.tHeadCell, s.cDesc]}>Опис</Text>
          <Text style={[s.tHeadCell, s.cNum]}>Основица</Text>
          <Text style={[s.tHeadCell, s.cNum]}>ДДВ 18%</Text>
          <Text style={[s.tHeadCell, s.cNum]}>Износ</Text>
        </View>

        {data.lines.map((l, i) => (
          <View style={s.tRow} key={i}>
            <View style={s.cDesc}>
              <Text>{l.description}</Text>
              {l.subDescription ? <Text style={s.subDesc}>{l.subDescription}</Text> : null}
            </View>
            <Text style={s.cNum}>{den(l.base)}</Text>
            <Text style={s.cNum}>{l.vat > 0 ? den(l.vat) : "—"}</Text>
            <Text style={s.cNum}>{den(l.amount)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text style={{ color: muted }}>Основица</Text>
            <Text>{den(data.subtotal)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={{ color: muted }}>ДДВ 18%</Text>
            <Text>{den(data.vatAmount)}</Text>
          </View>
          <View style={s.grandRow}>
            <Text style={s.grandLabel}>ВКУПНО</Text>
            <Text style={s.grandLabel}>{den(data.total)}</Text>
          </View>
        </View>

        <View style={s.footer}>
          <Text style={s.refNote}>
            При плаќање наведете повикување на број: {data.invoiceNumber}
          </Text>
        </View>

        <View style={s.sign}>
          <Text style={s.signLine}>Потпис и печат</Text>
        </View>
      </Page>
    </Document>
  );
}
