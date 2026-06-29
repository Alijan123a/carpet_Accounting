# CLAUDE.md — Qaleen Trader (Afghan Carpet Accounting App)

> **این فایل را در ریشه پروژه قرار بده. Claude Code همیشه قبل از هر کاری این فایل را می‌خواند.**
> Place this file at the project root. Claude Code reads it before every task.
> **هرگز قوانین این فایل را نقض نکن. اگر چیزی با این فایل در تضاد بود، این فایل اولویت دارد.**

---

## 1. What we are building

An **offline desktop accounting app** for a single Afghan carpet (qaleen) trader.
The trader buys carpets and raw material (thread / "tar") from some clients on credit,
and sells them to other clients on credit. Every transaction is credit-based (no cash-only).
Each client has ONE unified account that accumulates debit and credit and shows a final balance.

This is a **single-user, password-protected, fully offline** app. No cloud, no server, no internet.

---

## 2. Tech stack (DO NOT deviate)

- **Shell:** Electron (latest stable)
- **UI:** React 18 + TypeScript (strict mode)
- **Styling:** Tailwind CSS + shadcn/ui components
- **Database:** SQLite via `better-sqlite3` (synchronous, fast)
- **ORM:** Drizzle ORM (type-safe)
- **Charts:** Recharts
- **PDF export:** `@react-pdf/renderer`
- **State:** Zustand
- **Build:** Vite + electron-vite, packaged with electron-builder
- **Dates:** `date-fns` + `date-fns-jalali` (for Hijri Shamsi calendar)
- **i18n:** `i18next` + `react-i18next`

### Performance rules (NON-NEGOTIABLE — app must never lag)
- SQLite in **WAL mode**.
- **Index** every column used in WHERE / ORDER BY / JOIN.
- **Never** load all rows into memory. Always paginate DB queries.
- Use **virtual scrolling** (`@tanstack/react-virtual`) for any list/table that can grow.
- Run heavy work (PDF generation, big reports) **off the main render path**.

---

## 3. Money & accounting rules (HIGHEST PRIORITY — extreme care)

1. **Money is stored as INTEGER cents** in the database (e.g. 45.50 → 4550). Never store money as floating point.
2. **Display** money rounded to **2 decimal places**.
3. **Two currencies only: AFN (Afghani) and USD.** They are NEVER mixed or summed together. Each currency has its OWN separate balance per client. Exchange rate is set manually by the user per transaction; we do NOT auto-convert.
4. **Every transaction is IMMUTABLE.** To fix a mistake, create a reversing transaction — never edit or delete a posted transaction.
5. **A client's balance is ALWAYS computed by summing their transactions.** Never store a separate "balance" number that could drift out of sync.
6. **Every transaction carries a precise timestamp** (created_at) and a business date (transaction_date, which the user can set).
7. Write **unit tests** for every accounting calculation (profit, balance, deductions). Calculations must be provably correct.

### Sign convention (define once, use everywhere)
For a client account, per currency:
- **We buy from a client (purchase)** → we owe them → their balance moves so it shows *we are debtor*.
- **We sell to a client (sale)** → they owe us → their balance moves so it shows *they are debtor*.
- **Client pays us / we pay client (payment)** → reduces the open balance accordingly.
> Implement this with a single, clearly-documented helper. Decide one consistent sign (e.g. positive = client owes us, negative = we owe client) and NEVER deviate.

---

## 4. Core domain model (summary — full schema in Phase 1)

- **Client** — one unified account. Can act as buyer in one deal and seller in another. Has separate AFN and USD balances. Can be archived (soft) only when both balances are zero.
- **Carpet** — physical item with: label number, length, width, area (= length × width), sort grade, price-per-meter, sort deduction (fixed amount subtracted from price-per-meter), total price = (price_per_meter − deduction) × area. Status (in-warehouse / sold) where statuses are **user-extendable**. A carpet is sold whole to ONE client (never split).
- **Material (Tar)** — measured in **kilograms**. Bought from a client, sold to others. Profit = (sell_price_per_kg − buy_price_per_kg) × kg.
- **Transaction** — immutable record: type (purchase / sale / payment / reversal / adjustment), client, currency, amount (cents), date, optional link to a carpet or material line.
- **Expense** — business costs (rent, transport, wages…) that are subtracted from total profit.
- **Profit** — per-carpet and per-material-line profit, plus aggregate profit minus expenses for a period.

### Deductions
Sort deduction is a **fixed amount** subtracted from price-per-meter, and can apply on **both** the buy side and the sell side.

---

## 5. Features checklist (nothing may be dropped)

- [ ] Clients: unified accounts, multi-role, dual-currency balances
- [ ] Carpets: full attributes, area auto-calc, sort deduction, total auto-calc, extendable status
- [ ] Material (tar): kg-based buy/sell
- [ ] Credit transactions + flexible partial payments
- [ ] Profit per item + aggregate, minus expenses
- [ ] Expenses tracking
- [ ] Dual currency (AFN / USD) kept separate, manual rate
- [ ] Flexible reports with date-range and custom filters
- [ ] Archive system (manual, soft / hide — never delete)
- [ ] Backup: automatic + manual
- [ ] Bilingual UI (Farsi/Dari + English) with RTL/LTR
- [ ] Dual calendar (Hijri Shamsi + Gregorian)
- [ ] Light / dark theme, switchable in settings
- [ ] Password protection
- [ ] Dashboard overview

### Reports required
Client statement, warehouse list (carpets + material stock), periodic profit (after expenses),
sold list, purchased list, total receivables/payables, stagnant carpets, top clients, periodic turnover.

---

## 6. UI guidelines

- Style: **semi-minimal + modern**. Clean, not cluttered, but with good color and a modern feel.
- **Design accent:** subtle Afghan carpet motifs and authentic colors (laaki red, indigo blue, gold) used sparingly as accents — never overwhelming.
- Default brand color and theme are chosen by the implementer for the best "modern + Afghan authenticity" feel; expose theme + color options in **Settings**.
- Full **RTL** support for Farsi, **LTR** for English. This is architected from day one, not bolted on later.
- Persian-friendly font (e.g. Vazirmatn).
- Numbers grouped clearly (e.g. 123,456). Meaningful colors: receivable green, payable red.

---

## 7. How to work (instructions to the AI agent)

- Work **phase by phase**. Do not jump ahead. Finish and verify the current phase before the next.
- Keep changes **focused**. One concern at a time.
- After each phase: ensure the app **builds and runs**, and that you have not broken earlier work.
- Prefer **clear, documented, testable** code over clever code.
- When unsure about a business rule, re-read this file. If still unclear, ask before guessing — do NOT hallucinate a rule.
- Write code comments in English; UI strings go through i18n (both languages).

## 8. Github push
- after every functionality developed. push it to the github repo and commit the changes with clear commit.