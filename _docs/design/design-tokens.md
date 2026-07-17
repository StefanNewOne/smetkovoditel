# Design Tokens — GoDigital Finance OS

Extracted **verbatim from the prototype** `../design/handoff/finance-os-prototype.dc.html` (the
read-only Claude Design handoff). This file is the editable, developer-facing token reference;
the handoff HTML remains the pixel tiebreaker. Values here seed `apps/web/tailwind.config.ts`
and `apps/web/app/globals.css`.

> The prototype has **no `:root` variables** — only the `accent` is themeable (default `#3b76d1`).
> The accent **tints are hardcoded** (`#eef4fd`, `#d3e0f4`, `#b9cff0`, `#2a5cab`) and do NOT
> recompute if the accent changes. Treat them as fixed tokens.

## Colors

| Token            | Hex       | Use                                                           |
| ---------------- | --------- | ------------------------------------------------------------- |
| `accent`         | `#3b76d1` | logo, primary buttons, active nav, links, KPI totals          |
| `accent-hover`   | `#2a5cab` | link hover, OPEN badge text, mobile OCR text                  |
| `accent-50`      | `#eef4fd` | active nav bg, avatar bg, outline-button hover, OPEN badge bg |
| `accent-200`     | `#d3e0f4` | outline-accent button border                                  |
| `accent-300`     | `#b9cff0` | dashed upload border, card hover border                       |
| `bg`             | `#f6f8fb` | app body, mobile inner screen                                 |
| `surface`        | `#ffffff` | cards, panels, sidebar, header                                |
| `inset`          | `#f8fafc` | inset stat tiles, secondary-button hover                      |
| `chip`           | `#f0f4f9` | neutral pill/chip bg, nav hover                               |
| `track`          | `#eef2f7` | progress-bar track, thin dividers                             |
| `border`         | `#e7ecf3` | card/panel/sidebar/header borders                             |
| `border-2`       | `#eef2f7` | table-header underline, section dividers                      |
| `border-3`       | `#f2f5f9` | table row dividers                                            |
| `input`          | `#dfe6ef` | input borders                                                 |
| `ink`            | `#1a2333` | text primary, dark panels, toast, heavy invoice borders       |
| `ink-2`          | `#3d4a5e` | inactive sidebar nav label                                    |
| `muted`          | `#5b6878` | secondary text/buttons                                        |
| `muted-2`        | `#8a97ab` | helper text, table headers, meta                              |
| `success`        | `#4caf7d` | positive values, period dot                                   |
| `success-700`    | `#2e7d55` | PAID badge text, deep success on tint                         |
| `success-50`     | `#e8f5ee` | success tint bg                                               |
| `success-border` | `#cfe9db` | success box border                                            |
| `warning`        | `#e8a33d` | amber bars/accents                                            |
| `warning-700`    | `#a3690f` | PARTIALLY_PAID text                                           |
| `warning-50`     | `#fdf4e5` | warning tint bg                                               |
| `danger`         | `#c2483f` | negative values, OVERDUE text                                 |
| `danger-50`      | `#fdecec` | danger tint bg, sidebar count badge bg                        |
| dark bezel       | `#0e1420` | mobile phone frame                                            |

### Status badge map (`statusBadge()`)

| Status            | bg        | text      | label     |
| ----------------- | --------- | --------- | --------- |
| DRAFT             | `#f0f4f9` | `#5b6878` | `DRAFT`   |
| OPEN              | `#eef4fd` | `#2a5cab` | `OPEN`    |
| PARTIALLY_PAID    | `#fdf4e5` | `#a3690f` | `ДЕЛУМНО` |
| PAID              | `#e8f5ee` | `#2e7d55` | `PAID`    |
| OVERDUE           | `#fdecec` | `#c2483f` | `OVERDUE` |
| ФАКТУРА (channel) | `#eef4fd` | `#2a5cab` | —         |
| КЕШ (channel)     | `#fdf4e5` | `#a3690f` | —         |

## Typography

- Font: **Manrope** (Google Fonts, weights 400/500/600/700/800), Cyrillic-capable,
  `-webkit-font-smoothing:antialiased`.
- Sizes (px): 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 17, 18, 19, 20, 22, 26, 34.
- Key mappings: KPI numbers **26/800** · panel & card titles **14/800** · table cells **13/400**
  (name cell 700) · table headers **11/700 uppercase, letter-spacing 0.5px** · badges **11/700** ·
  helper/meta **11–12/600** · sidebar nav **13.5px** (active 800, inactive 600) · header title
  **16/800** · P&L / queue numbers **20–22/800**.
- Letter-spacing: `0.5px` (logo GO, table headers, wizard step), `0.8px` (invoice big header),
  `1px` (invoice micro-labels), `2px` ("DIGITAL" wordmark).
- Numbers: `toLocaleString('de-DE')` → `1.284.400`; currency suffix `ден`.

## Radius

`sm 8` (outline btn, chips) · `md 9` (nav item, primary btn, input) · `lg 11` (queue/statement
cards, mobile input) · `xl 14` (**main cards/panels/tables**) · pill `12` (status badge) / `20`
(filter chip) · modal `18` (wizard) / `6` (invoice) · mobile frame `44` / inner `34` · dots `50%`.

## Layout

- Sidebar `236px` (padding `20px 14px`, nav item `10px 12px`).
- Header `60px` (padding `0 28px`, gap `14px`).
- Content padding `28px`; `animation: fadeUp .25s ease` on screen change.
- Shell `min-width: 1180px` (horizontal scroll below). **No media queries** — fixed desktop;
  mobile is a simulated 375×740 phone-frame overlay.
- Grid templates (see prototype): KPI `repeat(4,1fr)`; dashboard `1.4fr 1fr`; clients table
  `2fr 1fr 1fr 1fr 1fr 0.8fr`; charges `1.8fr 1.1fr 0.9fr 1fr 1fr 1fr 1.3fr`; profile `1fr 320px`;
  reports `1.3fr 1fr`; settings `repeat(3,1fr)`.

## Elevation & motion

- **Cards have no shadow** — they rely on the `1px #e7ecf3` border.
- Only shadows: toast `0 12px 32px rgba(10,20,40,0.3)`; invoice modal `0 24px 60px
rgba(10,20,40,0.35)`; mobile phone `0 30px 80px rgba(0,0,0,0.45)`.
- Keyframe: `@keyframes fadeUp { from {opacity:0; transform:translateY(8px)} to {opacity:1;
transform:none} }`. Content `.25s`, modals/toast `.2s`.
- No CSS transitions declared (hovers are instant in the prototype — add subtle Tailwind
  `transition` on hover states in the rebuild).
- Scrollbar: width 10px, thumb `#d6dde8` radius 6px.
- z-index: overlays/modals `60`, toast `90`.

## Icons

Prototype uses **Unicode/emoji placeholders** (`◧ ◔ ▤ ⇣ ▦ ◑ ◫ ◕` for nav; `📱 🏦 💰 🧾 💵 📄 🎬
📷 📎 ⛔ ✓` for accents). **Replace with Lucide React** in the rebuild (Master Plan / handoff note).

## Screens & nav labels (verbatim)

`Dashboard` · `Клиенти` (list + profile) · `Задолжувања` · `Import центар` (red badge = unresolved
count) · `Благајна` · `Хонорарци` · `Извештаи` · `Подесувања`.
Overlays: Toast · Wizard "Нов клиент" (5 steps: Основни податоци · Канал на наплата · Месечен
пакет · Дополнителни ставки · Потврда) · Invoice PDF "ФАКТУРА" · Mobile PWA "Нов кеш-трошок (W6)".
Sidebar footer: `АЛМА ДИЗАЈН ДООЕЛ` · `Александар Кекиќ · Admin` · `Период 2026-07 · ОТВОРЕН`.
Header pill: `Gmail sync · пред 4 мин`.
