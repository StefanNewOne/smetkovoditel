# GoDigital Finance OS — MASTER PLAN v2.1 (FINAL — за предавање)

**Датум:** 15.07.2026 · **Сопственик:** Александар Кекиќ · **Статус:** КОМПЛЕТЕН — нула отворени прашања
**Ги заменува:** сите претходни верзии (Сметководствена основа, PRD v1.0/v1.1, Додаток A, Master Plan v2.0)
**Верифицирано врз реални документи:** НЛБ изводи бр. 146 и 149 + три Meta фактури (фикстури за тестови)

---

## 0. РЕШЕНИ ОДЛУКИ (потврдени од сопственикот, 15.07.2026)

| # | Одлука | Ефект во спецификацијата |
|---|---|---|
| D1 | Правен субјект: **АЛМА ДИЗАЈН ДООЕЛ Скопје**, даночен бр. **4032023558371**, сметка **210-0768360001-38**, НЛБ Банка АД Скопје | Податоци на фактурен темплејт (§7.1); недостасува само лого/визуелен дизајн |
| D2 | Актери-ставка: **автоматски од хонорарска алокација** | §5 и W5 — билабилна алокација генерира billable Expense(ACTORS); без двоен внес |
| D3 | Валута: **СТРОГО МКД** — сите клиенти, сите фактури, сите задолжувања | EUR целосно отстрането од модел и текови; USD останува САМО како sanity-курс за Meta matching |
| D4 | Извод формат: **PDF е примарен** (тоа стигнува на meil); ако постои XML/CSV извоз — се додава како адаптер, PDF останува fallback | §4.2 — parser adapter pattern |
| D5 | Инфраструктура: **VPS + Gmail** | §11 — Gmail API ingestion, Docker deployment |
| D6 | Фискализација на кеш: **постоечки фискален уред, рачно** — системот само го евидентира бројот | Без интеграција со фискален уред во v1 |

---

# ДЕЛ I — ШТО СЕ ГРАДИ

## 1. Контекст

АЛМА ДИЗАЈН ДООЕЛ (бренд GoDigital) — маркетинг агенција:
- **25–30 клиенти на фактура** (18% ДДВ врз договорена основица) + **15–20 клиенти на кеш** (без фактура, без ДДВ, со месечно задолжување за следење на наплатата)
- Месечна сума по клиент, ретко променлива (верзионирано, никогаш edit)
- Дополнителни ставки кај дел од клиентите: **Meta Ads 1:1** и **актери** (од хонорарска алокација — D2)
- 2 вработени на плата; хонорарци претежно кеш од благајна
- Трошоци: тековни, реклами, опрема, гориво, кирија, струја, телефон, банкарски провизии
- Meta наплаќа од MasterCard ····8234 во **USD**; изводот книжи во **МКД**; сите Meta фактури на **еден Gmail mailbox**
- НЛБ изводи: PDF на meil или рачен multi-upload, неделно
- **Сè во системот е МКД (D3).** Единствена странска валута е USD, и тоа само како проверка на курс при Meta matching.

## 2. Четирите텍 текови на пари

| Тек | Извор на вистина | Документ |
|---|---|---|
| Банка ВЛЕЗ | НЛБ извод | фактура + повикување на број |
| Банка/картица ИЗЛЕЗ | НЛБ извод | извод-линија (+фактура од добавувач опционо) |
| Благајна ВЛЕЗ | Благајнички дневник | фискална (постоечки уред — D6) / каса-прими |
| Благајна ИЗЛЕЗ | Благајнички дневник | каса-исплати + договор/фактура + **задолжителна слика за кеш-сметки** |

**Правило бр. 1: нема движење на пари без запис, нема запис без документ.**

## 3. Централен концепт: CHARGE (задолжување)

Секој активен клиент, секој месец, точно едно задолжување:
```
kind = INVOICE          → фактура: број 1-{n}/{M}-{YYYY}, +18% ДДВ, PDF, email
kind = CASH_OBLIGATION  → интерна обврска: без број, без ДДВ, не се испраќа
kind = CREDIT_NOTE      → книжно одобрение (корекција на издадена фактура)
```
Заеднички: линии, статуси (DRAFT→OPEN→PARTIALLY_PAID→PAID / OVERDUE / CANCELLED), спарување, aging, dashboard. Еден workflow за сите клиенти.

---

# ДЕЛ II — DATA MODEL (Prisma, финален, само МКД)

```prisma
enum PaymentChannel { INVOICE CASH }
enum PayChannel     { BANK CARD CASH }
enum ClientStatus   { ACTIVE PAUSED CHURNED }
enum ChargeKind     { INVOICE CASH_OBLIGATION CREDIT_NOTE }
enum ChargeStatus   { DRAFT OPEN PARTIALLY_PAID PAID OVERDUE CANCELLED }
enum LineType       { SERVICE META_ADS ACTORS OTHER }
enum BillingMode    { PASSTHROUGH_ACTUAL FIXED }
enum MatchStatus    { UNMATCHED AUTO_MATCHED MANUAL_MATCHED }
enum Direction      { IN OUT }
enum CashDocType    { FISCAL KASA_PRIMI KASA_ISPLATI }
enum ExpenseCategory{ OPERATIONS ADS ACTORS EQUIPMENT FUEL RENT UTILITIES PHONE BANK_FEES SALARY HONORAR OTHER }
enum ContractorType { DOGOVOR_NA_DELO CONTRACTOR_INVOICE }
enum TaxMode        { WITHHOLD_10 NO_WITHHOLDING }
enum PeriodStatus   { OPEN CLOSED }
enum ImportSource   { EMAIL MANUAL_UPLOAD }
enum ImportStatus   { PARSED DUPLICATE_SKIPPED FAILED }
enum ParseStatus    { OK PARTIAL FAILED }

model Client {
  id              String   @id @default(cuid())
  name            String
  taxId           String?            // ЕДБ — required за INVOICE (app-валидација)
  address         String?
  contactEmail    String?
  contactPhone    String?
  paymentChannel  PaymentChannel
  vatApplicable   Boolean  @default(true)
  paymentTermDays Int      @default(15)
  status          ClientStatus @default(ACTIVE)
  creditBalance   Int      @default(0)      // преплата → авто-примена на следен Charge
  packages        ServicePackage[]
  lineTemplates   RecurringLineTemplate[]
  charges         Charge[]
  adAccounts      AdAccount[]
  createdAt       DateTime @default(now())
}

model ServicePackage {                       // ВЕРЗИОНИРАНО
  id            String    @id @default(cuid())
  clientId      String
  monthlyAmount Int                          // ОСНОВИЦА, МКД integer дени
  description   String?
  effectiveFrom DateTime
  effectiveTo   DateTime?
  createdById   String
  createdAt     DateTime  @default(now())
}

model RecurringLineTemplate {
  id          String      @id @default(cuid())
  clientId    String
  type        LineType    // META_ADS | ACTORS | OTHER
  billingMode BillingMode // META_ADS и ACTORS = PASSTHROUGH_ACTUAL (D2); OTHER = FIXED
  fixedAmount Int?
  active      Boolean @default(true)
}

model Charge {
  id            String       @id @default(cuid())
  clientId      String
  kind          ChargeKind
  period        String                        // "2026-08"
  seqInMonth    Int?
  invoiceNumber String?                       // "1-2/7-2026"; null за CASH_OBLIGATION
  issueDate     DateTime
  dueDate       DateTime
  status        ChargeStatus
  subtotal      Int                           // МКД
  vatAmount     Int                           // 0 за CASH_OBLIGATION
  total         Int
  paidAmount    Int          @default(0)
  relatedChargeId String?                     // CREDIT_NOTE → оригинал
  lines         ChargeLine[]
  payments      Payment[]
  pdfUrl        String?
  @@unique([clientId, period, kind])
  @@unique([seqInMonth, period])
}

model ChargeLine {
  id          String   @id @default(cuid())
  chargeId    String
  type        LineType
  description String
  amount      Int
  vatRate     Float                           // 0.18 или 0
  sourceRefs  Json?                           // [{expenseId}] за META_ADS/ACTORS следливост
}

model Payment {
  id           String      @id @default(cuid())
  clientId     String?
  chargeId     String?
  channel      PayChannel
  amount       Int
  date         DateTime
  reference    String?
  matchStatus  MatchStatus
  statementLineId String?  @unique
  cashEntryId  String?    @unique
}

model CashLedgerEntry {
  id               String      @id @default(cuid())
  direction        Direction
  amount           Int
  date             DateTime
  description      String
  counterpartyType String                     // CLIENT | CONTRACTOR | VENDOR | INTERNAL
  counterpartyId   String?
  documentType     CashDocType
  documentNumber   String?                    // број од фискалниот уред — рачен внес (D6)
  attachmentUrl    String?
  periodId         String
  createdById      String
  createdAt        DateTime @default(now())
}

model Expense {
  id              String          @id @default(cuid())
  category        ExpenseCategory
  vendor          String?
  amount          Int
  vatAmount       Int?
  date            DateTime
  paymentChannel  PayChannel
  clientId        String?
  isBillable      Boolean @default(false)
  billedOnLineId  String?                      // спречува двојно фактурирање (B15)
  attachmentUrl   String?
  statementLineId String?  @unique
  cashEntryId     String?  @unique
  adSpendReceiptId String? @unique
  contractorPaymentId String?                  // D2: актер-ставка од алокација
  ocrRaw          Json?
}

model Asset {
  id                String  @id @default(cuid())
  name              String
  purchaseExpenseId String  @unique
  purchaseValue     Int
  depreciationRate  Float
  depreciationStart DateTime
}

// ============ META ADS PIPELINE ============
model AdAccount {
  id            String  @id @default(cuid())
  metaAccountId String  @unique               // "2396006970755280"
  name          String
  clientId      String?                       // null = сопствен маркетинг
  active        Boolean @default(true)
}

model AdSpendReceipt {
  id              String      @id @default(cuid())
  emailMessageId  String      @unique         // Gmail Message-ID — dedupe 1
  transactionId   String      @unique         // dedupe 2
  metaInvoiceNo   String      @unique         // "FBADS-..." — dedupe 3
  referenceNumber String      @unique         // "QEC8CTD652" — MATCHING КЛУЧ
  accountName     String
  metaAccountId   String?
  amountUsd       Int                          // центи — САМО за sanity-проверка
  cardLast4       String
  invoiceDate     DateTime
  campaignsJson   Json?
  attachmentUrl   String                       // оригинален PDF — законски документ
  reverseChargeVat Boolean    @default(true)
  parseStatus     ParseStatus
  matchStatus     MatchStatus @default(UNMATCHED)
  statementLineId String?     @unique
  expenseId       String?     @unique
  receivedAt      DateTime
}

// ============ БАНКА ============
model BankAccount {
  id             String @id @default(cuid())
  bank           String @default("NLB")
  accountNumber  String @unique                // "210-0768360001-38"
  openingBalance Int
  openingDate    DateTime
}

model BankStatementImport {
  id              String       @id @default(cuid())
  bankAccountId   String
  statementNumber Int
  statementDate   DateTime
  source          ImportSource
  format          String       @default("NLB_PDF")  // adapter pattern (D4)
  fileRef         String
  openingBalance  Int
  totalDebit      Int
  totalCredit     Int
  closingBalance  Int
  orderCount      Int
  status          ImportStatus
  lines           StatementLine[]
  @@unique([bankAccountId, statementNumber])
}

model StatementLine {
  id          String   @id @default(cuid())
  importId    String
  lineHash    String   @unique
  date        DateTime
  amount      Int
  direction   Direction
  counterpartyName    String?
  counterpartyAccount String?
  description String
  reference   String?
  bankRef     String?                          // "Податоци за рекламација"
  classifiedAs String?                         // META_ADS | CARD_TX | CLIENT_PAYMENT | BANK_FEE | OTHER
  processed   Boolean  @default(false)
  linkedType  String?
  linkedId    String?
}

model VendorRule {
  id       String @id @default(cuid())
  pattern  String
  category ExpenseCategory
  vendor   String?
  hits     Int    @default(0)
}

model ExchangeRate {                           // D3: САМО USD, само за Meta sanity
  id     String   @id @default(cuid())
  date   DateTime
  code   String   @default("USD")
  midMkd Float
  @@unique([date, code])
}

// ============ ЛУЃЕ ============
model Contractor {
  id           String  @id @default(cuid())
  name         String
  idNumber     String?
  contractType ContractorType
  taxMode      TaxMode                         // B8: NO_WITHHOLDING само со CONTRACTOR_INVOICE
  isTalent     Boolean @default(false)         // D2: актер/on-camera — алокациите можат да се билабилни
  defaultRate  Int?
  contractUrl  String?
  active       Boolean @default(true)
}

model ContractorPayment {
  id             String   @id @default(cuid())
  contractorId   String
  period         String
  grossAmount    Int
  taxAmount      Int
  netAmount      Int
  paymentChannel PayChannel
  cashEntryId    String?  @unique
  documentUrl    String?
  allocations    Json     // [{clientId, amount, billable}] — D2
  status         String   // CALCULATED | PAID
}

model Employee   { id String @id @default(cuid()); name String; grossSalary Int; position String? }
model PayrollRun { id String @id @default(cuid()); period String; items Json; status String }

// ============ СИСТЕМ ============
model Period   { id String @id; status PeriodStatus @default(OPEN); closedAt DateTime?; closedById String? }
model AuditLog { id String @id @default(cuid()); entity String; entityId String; action String; diff Json; userId String; createdAt DateTime @default(now()) }
model User     { id String @id @default(cuid()); name String; email String @unique; role String }
```

---

# ДЕЛ III — ПАРСЕРИ И MATCHING (верифицирано врз реални документи)

## 4. Import инфраструктура

### 4.1 Gmail ingestion (D5)
Еден Gmail mailbox прима: (а) Meta фактури, (б) НЛБ изводи. Worker преку **Gmail API** (OAuth2, offline refresh token) polling на 10–15 мин: нови пораки → превземи PDF attachments → рутирање по испраќач/име на фајл (`Transaction__*` → Meta parser; `DpsStatement*` → НЛБ parser) → dedupe по Gmail Message-ID → обработка. Секоја порака се обележува со label (Processed/Failed) — идемпотентно и видливо во самиот Gmail.

### 4.2 НЛБ Statement Parser (PDF примарен — D4)
Adapter pattern: `format` поле на import; v1 = NLB_PDF; ако подоцна се обезбеди XML/CSV извоз, се додава втор адаптер без промена на остатокот од системот.

**Header:** број на извод, датум, сметка, претходна состојба, дневен промет, нова состојба, број на налози.
**Интегритет (блокирачки):** `претходна + побарува − долгува == нова` · `parsed lines == број на налози` · претходна состојба == нова состојба од претходниот извод (континуитет — фаќа прескокнат извод). Неуспех → FAILED, нула книжења, аларм.
**Линија:** примач, износ+direction, шифра, цел на дознаката, повикување на број, податоци за рекламација (→ lineHash).
**Износи:** `5.782,00` → 578200 (integer дени).

**Класификација (по приоритет):**
```
1. META_ADS (OUT):      /FACEBK\s*\*([A-Z0-9]+)/ → referenceNumber
2. CARD_TX (OUT):       /^MBDP:(\d{4}):/ → merchant → VendorRule (пр. PETROL→FUEL)
3. CLIENT_PAYMENT (IN): повикување на број → Charge.invoiceNumber
                        (нормализација: празни места, со/без година)
                        fallback: fuzzy износ+историја → предлог
4. BANK_FEE (OUT):      примач НЛБ + провизија → авто Expense(BANK_FEES)
5. OTHER → рачна редица
```
**Dedupe:** цел извод `(сметка, број)`; линија `lineHash`. Ист фајл × N = 0 дупликати.

### 4.3 Meta Receipt Parser
```
accountName:   /^Receipt for (.+)$/m           (кирилица — тестирано)
accountId:     /Account ID:\s*(\d+)/
reference:     /Reference Number:\s*([A-Z0-9]+)/     ← MATCHING КЛУЧ
transactionId: /Transaction ID\s*\n?([\d-]+)/
amountUsd:     прв /\$([0-9,]+\.\d{2})/ по "Paid"
invoiceNo:     /Invoice #\s*(FBADS-[\d-]+)/
cardLast4:     /(?:MasterCard|Visa)[^\d]*(\d{4})/
```
Некомплетен → PARTIAL → рачна редица со PDF preview.

### 4.4 Matching: receipt ↔ извод-линија
1. **Клуч:** `referenceNumber == FACEBK-кодот`. Само тоа. (Потврдено: FQ99UUHFD2, QEC8CTD652, BQCHDTM8B2.)
2. Име на носител == плаќач: секундарна потврда, никогаш услов.
3. **Sanity:** `amountMkd/amountUsd ∈ НБРМ_USD ± 6%` → чист match; надвор → warning + рачна потврда. (Примероци: 54,03–54,10.)
4. **Книжен и префактуриран износ = МКД од изводот, 1:1.**
5. Match → авто `Expense(ADS, CARD, clientId од AdAccount, attachment=Meta PDF, isBillable = clientId != null)`.
6. Редици: receipt без линија >7 дена → аларм; FACEBK линија без receipt → аларм веднаш со име на акаунт.

## 5. Актери-ставка (D2 — автоматски од хонорари)

Кога се пресметува хонорар на контрактор со `isTalent=true`, секоја алокација со `billable=true` автоматски создава:
```
Expense(category=ACTORS, paymentChannel = каналот на исплатата,
        clientId = од алокацијата, amount = алоцираниот БРУТО износ,
        isBillable=true, contractorPaymentId = исплатата)
```
W1 следниот месец ги собира овие Expenses во ACTORS линија на фактурата на клиентот — идентична механика како Meta Ads, со иста заштита од двојно фактурирање (`billedOnLineId`). Небилабилна алокација (интерна работа) не создава ставка, но влегува во маргината по клиент како трошок. **Нула двоен внес: една пресметка на хонорар ги храни и благајната, и фактурата на клиентот, и маргината.**

## 6. Нумерација на фактури
```
1-{n}/{M}-{YYYY}    n = редослед на ИЗДАВАЊЕ во месецот (глобален месечен бројач)
```
- `n` при DRAFT→OPEN — без дупки и покрај откажани драфтови
- Уникатен клуч `(seqInMonth, period)` — годината задолжителна
- Уплати-матчинг прифаќа со/без година, нормализирано
- Миграција: продолжува од следниот слободен број (go-live checklist т.4)

## 7. Фактурен темплејт (D1)
```
АЛМА ДИЗАЈН ДООЕЛ Скопје
Даночен број: 4032023558371
Жиро сметка: 210-0768360001-38 · НЛБ Банка АД Скопје
+ адреса и лого (асет од сопственикот пред крај на Фаза 1)
```
Задолжителни елементи: број, датум на издавање и валута(рок), податоци на издавач и примач (ЕДБ), опис по линии, основица, ДДВ 18%, вкупно, потпис. PDF генерирање со кирилична типографија.

---

# ДЕЛ IV — WORKFLOWS

**W1 — Задолжувања (cron 1-ви 06:00):** ACTIVE клиенти → активен пакет → SERVICE линија → темплејти: META_ADS = Σ нефактурирани billable ADS Expenses; ACTORS = Σ нефактурирани billable ACTORS Expenses (D2); OTHER фиксно → INVOICE: DRAFT + ДДВ; CASH_OBLIGATION: директно OPEN → creditBalance авто-примена → нотификација → одобрување → PDF + email.

**W2 — Import (Gmail авто + multi-upload):** dedupe → интегритет → класификација → авто-книжења + редици.

**W3 — Кеш-наплата:** клиент → отворени обврски → атомски Payment(CASH) + CashLedgerEntry(IN, FISCAL бр. од уредот — D6). Делумно ОК; преплата → creditBalance.

**W4 — Dunning:** INVOICE: email due+7/+21, OVERDUE +30. CASH_OBLIGATION: само интерна нотификација.

**W5 — Хонорари:** контрактор + период + бруто + алокации [{клиент, износ, billable}] → данок по taxMode → исплата → благајна/банка запис → D2 авто-ставки за billable алокации.

**W6 — Кеш-трошок (mobile-first):** камера → OCR prefill → категорија → атомски Expense + CashLedgerEntry + слика. Без слика = блокирано (B5). Картични: без слика (B6), изводот е записот.

**W7 — Курс (cron 07:00):** НБРМ USD среден → ExchangeRate. Fallback + warning >3 дена.

**W8 — Затворање месец:** блокери (нема DRAFT/UNMATCHED · линии processed · receipts решени · благајна == физички попис · плати и хонорари PAID) → CLOSED → immutable; корекции CREDIT_NOTE/сторно.

**W9 — Пакет за сметководител:** ZIP по затворање: 01 Излезни фактури (PDF + Kniga_izlezni.xlsx) · 02 Влезни трошоци (прилози + xlsx, reverse-charge колона) · 03 Изводи · 04 Благајна (дневник + слики) · 05 Хонорари · 06 Плати.

---

# ДЕЛ V — ПРАВИЛА, ЕКРАНИ, ПЛАН

## 8. Business rules

| # | Правило |
|---|---|
| B1 | Фактурен број: глобален месечен бројач, без дупки, при издавање |
| B2 | Billable ADS/ACTORS Expense без clientId → блокирано |
| B3 | Благајна никогаш негативна |
| B4 | Пакет-промена = нова верзија; edit на сума не постои |
| B5 | CASH трошок без слика → блокирано |
| B6 | CARD/BANK трошок — слика опционална |
| B7 | Кеш-исплата на хонорарец бара Contractor + документ |
| B8 | NO_WITHHOLDING само со CONTRACTOR_INVOICE + фактура |
| B9 | CLOSED период immutable; корекции CREDIT_NOTE/сторно |
| B10 | Пари = integer дени; float забранет |
| B11 | ДДВ и законски параметри = конфигурација |
| B12 | Еден Charge по клиент/период/вид |
| B13 | Дупликат извод/линија тивко скокнат + логиран |
| B14 | Интегритет на извод (салда + бр. налози + континуитет) блокирачки |
| B15 | ADS/ACTORS линија == Σ sourceRefs; секој Expense фактуриран макс. еднаш |
| B16 | Billable алокација на isTalent контрактор → точно еден billable Expense |
| B17 | КЕШ↔ФАКТУРА премин бара ЕДБ; историјата непроменета |
| B18 | Преплата → creditBalance → авто-примена |

## 9. Екрани
1. **Dashboard** — салда, задолжено/наплатено (фактура vs кеш), топ должници, редици
2. **Клиенти** — листа → Onboarding wizard (5 чекори, live ДДВ preview, AdAccount мапирање) → Профил (пакет-историја, timeline, ads/актери, маргина, документи)
3. **Задолжувања** — одобрување, CREDIT_NOTE
4. **Import центар** — авто-статус од Gmail + multi-upload, 4 редици
5. **Благајна** — дневник, попис, mobile кеш-трошок
6. **Хонорарци** — регистар, пресметка со алокации, исплати
7. **Извештаи** — P&L, маргина по клиент, aging, cash flow, благајна, W9 пакет
8. **Подесувања** — ДДВ, банка+салда, AdAccounts, VendorRules, RBAC, нумерација

## 10. Фази

**Ф1 Јадро:** клиенти+wizard, пакети, W1, W3, W6, W5. *DoD: цел месечен циклус рачно.*
**Ф2 Import:** Gmail ingestion, двата парсери, matching, редици, W7. *DoD: T1–T12 зелени + недела реални изводи без FAILED.*
**Ф3 Дисциплина:** W4, VendorRules, payroll, CREDIT_NOTE, W8. *DoD: прв месец затворен end-to-end.*
**Ф4 Извештаи:** reporting + W9. *DoD: сметководителот прифаќа пакет; маргина рачно верификувана за 3 клиенти.*

## 11. Инфраструктура (D5)

**VPS** (мин. 2 vCPU / 4GB): Docker Compose — app (Next.js/Node + Prisma), PostgreSQL, worker (Gmail polling + parsing), cron (W1, W7), nginx + TLS. Прилози: локален volume со дневен offsite backup (или S3-компатибилен storage). **Gmail API** со OAuth2 refresh token за ingestion; испраќање фактури/потсетници преку Gmail SMTP од фирмина адреса (волуменот ~50 меила месечно е далеку под лимити). Timezone Europe/Skopje, локал mk-MK. Golden-file тестови: реалните документи (изводи 146/149 + 3 фактури) се фикстури во repo. AuditLog на секој финансиски ентитет. Дневен DB backup, retention на прилози ≥10 год.

## 12. Go-live checklist

1. ☐ Billing email унифициран за сите ad акаунти *(сопственикот — во тек)*
2. ☐ AdAccounts внесени и мапирани
3. ☐ Клиенти внесени (wizard)
4. ☐ Последен фактурен број потврден → продолжување
5. ☐ Почетни салда: банка (последен извод) + благајна (попис)
6. ☐ Отворени побарувања внесени како историски Charges
7. ☐ Хонорарци внесени (тип, taxMode, isTalent)
8. ☐ VendorRules стартен сет
9. ☐ Лого/дизајн за фактурен темплејт доставени
10. ☐ Gmail OAuth поврзан; тест-порака поминува pipeline
11. ☐ Еден месец паралелна работа → споредба → систем = source of truth

## 13. Гаранција за точност (инженерски, не декларативно)

Внатрешната конзистентност е обезбедена со дизајн: секој денар има дефиниран пат и документ, секое авто-книжење е следливо и реверзибилно пред затворање, двојно фактурирање е структурно невозможно (B15/B16), дупликат-import е структурно невозможен (B13/B14). Единствени надворешни зависности се форматите на Meta и НЛБ PDF — промена таму никогаш не книжи погрешно, туку паѓа во рачна редица (parseStatus/FAILED), а golden-file тестовите ја фаќаат секоја регресија. Паралелниот месец (checklist т.11) е финалната верификација врз реални пари.

## ACCEPTANCE ТЕСТОВИ (фикстури = реалните документи)

| # | Тест | Очекувано |
|---|---|---|
| T1 | Извод 146 + receipt FQ99UUHFD2 ($16) | AUTO_MATCHED; Expense ADS 86.500 дени; клиент од AdAccount |
| T2 | Извод 149 (7 налози) | 5× META_ADS; 2× CARD_TX → FUEL предлог |
| T3 | Извод 149 × 3 пати | DUPLICATE_SKIPPED; 0 нови записи |
| T4 | Салдо извод 149 | 35.473 − 17.175 + 0 = 18.298 ✓; 7 == 7 ✓ |
| T5 | Уплата 21.594,00 „1-66/2026" | AUTO_MATCHED; Charge PAID |
| T6 | $107.00 ↔ 5.782,00 | rate 54,04 во опсег → чист match |
| T7 | 5 FACEBK линии, 3 receipts | 3 match + 2 аларми со имиња на акаунти |
| T8 | Receipt со кирилично име | парсирано коректно |
| T9 | W1 фактура-клиент 30.000 | 30.000 + 5.400 = 35.400; број 1-{n}/7-2026 |
| T10 | W1 кеш-клиент 20.000 | CASH_OBLIGATION без број/ДДВ, OPEN |
| T11 | Кеш-трошок без слика | блокирано |
| T12 | Ист ADS Expense во два W1 | втор пат исклучен (billedOnLineId) |
| T13 | Хонорар: Вања, 30.000 бруто, алокации Astibo 60% billable / интерно 40% | данок 3.000, нето 27.000; 1 ACTORS Expense 18.000 за Astibo; следен W1: ACTORS линија 18.000 на фактурата |
| T14 | Иста исплата, обид за втора ACTORS ставка | структурно невозможно (B16) |
