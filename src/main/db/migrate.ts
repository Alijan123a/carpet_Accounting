import type Database from 'better-sqlite3'

/**
 * Schema DDL, executed at startup. Idempotent (CREATE ... IF NOT EXISTS), so it
 * is safe to run on every launch.
 *
 * Kept deliberately as embedded SQL (rather than a file-based drizzle migrator)
 * so it works identically in dev and in a packaged build with no path lookups.
 * Must stay in sync with src/main/db/schema.ts (the typed query surface).
 *
 * IMMUTABILITY: triggers on `transactions` block UPDATE and DELETE, enforcing
 * CLAUDE.md §3 rule 4 at the database level — the only way to undo a posted
 * transaction is to post a reversal row.
 */
const SCHEMA_SQL = /* sql */ `
CREATE TABLE IF NOT EXISTS clients (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  phone       TEXT,
  notes       TEXT,
  kind        TEXT NOT NULL DEFAULT 'both',
  created_at  INTEGER NOT NULL,
  archived    INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_archived ON clients(archived);
-- NOTE: idx_clients_kind is created in runColumnUpgrades(), AFTER the kind
-- column is guaranteed to exist (on an existing DB the column is added by an
-- ALTER there). Creating it here would fail on older DBs with a missing column.

CREATE TABLE IF NOT EXISTS carpet_statuses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT NOT NULL UNIQUE,
  label_fa   TEXT NOT NULL,
  label_en   TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS materials (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  currency    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  archived    INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_materials_currency ON materials(currency);
CREATE INDEX IF NOT EXISTS idx_materials_archived ON materials(archived);

CREATE TABLE IF NOT EXISTS transactions (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id               INTEGER NOT NULL REFERENCES clients(id),
  type                    TEXT NOT NULL,
  currency                TEXT NOT NULL,
  amount_cents            INTEGER NOT NULL,
  carpet_id               INTEGER REFERENCES carpets(id),
  material_line_id        INTEGER REFERENCES material_lines(id),
  transaction_date        INTEGER NOT NULL,
  created_at              INTEGER NOT NULL,
  reverses_transaction_id INTEGER REFERENCES transactions(id),
  note                    TEXT
);
CREATE INDEX IF NOT EXISTS idx_tx_client ON transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_tx_client_currency ON transactions(client_id, currency);
CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_tx_currency ON transactions(currency);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_tx_carpet ON transactions(carpet_id);
CREATE INDEX IF NOT EXISTS idx_tx_material_line ON transactions(material_line_id);
CREATE INDEX IF NOT EXISTS idx_tx_reverses ON transactions(reverses_transaction_id);

CREATE TABLE IF NOT EXISTS carpets (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  label_number               TEXT NOT NULL UNIQUE,
  length                     REAL NOT NULL,
  width                      REAL NOT NULL,
  area                       REAL NOT NULL,
  sort_grade                 TEXT,
  quality                    TEXT,
  price_per_meter_cents      INTEGER NOT NULL,
  sort_deduction_cents       INTEGER NOT NULL DEFAULT 0,
  currency                   TEXT NOT NULL,
  total_price_cents          INTEGER NOT NULL,
  status                     TEXT NOT NULL DEFAULT 'in_warehouse',
  bought_from_client_id      INTEGER REFERENCES clients(id),
  buy_transaction_id         INTEGER REFERENCES transactions(id),
  sell_price_per_meter_cents INTEGER,
  sell_sort_deduction_cents  INTEGER,
  sell_total_price_cents     INTEGER,
  sold_to_client_id          INTEGER REFERENCES clients(id),
  sell_transaction_id        INTEGER REFERENCES transactions(id),
  sold_at                    INTEGER,
  created_at                 INTEGER NOT NULL,
  archived                   INTEGER NOT NULL DEFAULT 0,
  archived_at                INTEGER
);
CREATE INDEX IF NOT EXISTS idx_carpets_status ON carpets(status);
CREATE INDEX IF NOT EXISTS idx_carpets_currency ON carpets(currency);
CREATE INDEX IF NOT EXISTS idx_carpets_bought_from ON carpets(bought_from_client_id);
CREATE INDEX IF NOT EXISTS idx_carpets_sold_to ON carpets(sold_to_client_id);
CREATE INDEX IF NOT EXISTS idx_carpets_archived ON carpets(archived);
CREATE INDEX IF NOT EXISTS idx_carpets_created ON carpets(created_at);

CREATE TABLE IF NOT EXISTS material_lines (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id       INTEGER NOT NULL REFERENCES materials(id),
  direction         TEXT NOT NULL,
  client_id         INTEGER NOT NULL REFERENCES clients(id),
  kilograms         REAL NOT NULL,
  price_per_kg_cents INTEGER NOT NULL,
  total_cents       INTEGER NOT NULL,
  currency          TEXT NOT NULL,
  transaction_id    INTEGER REFERENCES transactions(id),
  transaction_date  INTEGER NOT NULL,
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ml_material ON material_lines(material_id);
CREATE INDEX IF NOT EXISTS idx_ml_client ON material_lines(client_id);
CREATE INDEX IF NOT EXISTS idx_ml_direction ON material_lines(direction);
CREATE INDEX IF NOT EXISTS idx_ml_currency ON material_lines(currency);
CREATE INDEX IF NOT EXISTS idx_ml_date ON material_lines(transaction_date);

CREATE TABLE IF NOT EXISTS expenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category     TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency     TEXT NOT NULL,
  expense_date INTEGER NOT NULL,
  note         TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_currency ON expenses(currency);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);

CREATE TABLE IF NOT EXISTS invoices (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  number            TEXT NOT NULL,
  buyer_client_id   INTEGER NOT NULL REFERENCES clients(id),
  currency          TEXT NOT NULL,
  total_cents       INTEGER NOT NULL,
  lines_json        TEXT NOT NULL,
  transaction_date  INTEGER NOT NULL,
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(number);
CREATE INDEX IF NOT EXISTS idx_invoices_buyer ON invoices(buyer_client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(transaction_date);

-- Immutable ledger: block edits and deletes of posted transactions.
CREATE TRIGGER IF NOT EXISTS trg_tx_no_update
BEFORE UPDATE ON transactions
BEGIN
  SELECT RAISE(ABORT, 'transactions are immutable: post a reversal instead of editing');
END;

CREATE TRIGGER IF NOT EXISTS trg_tx_no_delete
BEFORE DELETE ON transactions
BEGIN
  SELECT RAISE(ABORT, 'transactions are immutable: post a reversal instead of deleting');
END;
`

/** Seed the user-extendable carpet statuses (idempotent). */
const SEED_SQL = /* sql */ `
INSERT OR IGNORE INTO carpet_statuses (key, label_fa, label_en, is_default) VALUES
  ('in_warehouse', 'در انبار', 'In warehouse', 1),
  ('sold',         'فروخته شده', 'Sold', 0);
`

/** True if `table` already has a column named `column`. */
function hasColumn(sqlite: Database.Database, table: string, column: string): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return cols.some((c) => c.name === column)
}

/**
 * Idempotent column additions for databases created by an earlier version.
 * Each ALTER is guarded by a PRAGMA check so re-running is safe. New tables are
 * handled by the CREATE ... IF NOT EXISTS statements above.
 */
function runColumnUpgrades(sqlite: Database.Database): void {
  // clients.kind — buyer / seller / both (Buyer/Seller list split). Add the
  // column first if an older DB lacks it, THEN index it (the index is created
  // here — not in SCHEMA_SQL — so it always runs after the column exists, for
  // both fresh and upgraded databases).
  if (!hasColumn(sqlite, 'clients', 'kind')) {
    sqlite.exec(`ALTER TABLE clients ADD COLUMN kind TEXT NOT NULL DEFAULT 'both';`)
  }
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_clients_kind ON clients(kind);`)

  // carpets.quality — free-text quality note (کیفیت), separate from sort grade.
  if (!hasColumn(sqlite, 'carpets', 'quality')) {
    sqlite.exec(`ALTER TABLE carpets ADD COLUMN quality TEXT;`)
  }
}

/** Create all tables/indexes/triggers and seed reference data. */
export function runMigrations(sqlite: Database.Database): void {
  sqlite.exec(SCHEMA_SQL)
  runColumnUpgrades(sqlite)
  sqlite.exec(SEED_SQL)
}
