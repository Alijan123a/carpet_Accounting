import { ipcMain } from 'electron'
import { and, or, eq, like, gte, lte, asc, desc, sql, isNotNull, type SQL, type AnyColumn } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { logChange } from '../changeLog'
import type {
  ExpenseInput,
  ExpensesListParams,
  ExpensesListResult,
  ExpenseView,
  ExpenseType,
  ExpenseTypeInput
} from '../../shared/contracts'

type DB = BetterSQLite3Database<typeof schema>

/** Ensure a category name exists in the managed expense_types list. */
function ensureType(db: DB, name: string): void {
  const n = name.trim()
  if (!n) return
  db.insert(schema.expenseTypes).values({ name: n }).onConflictDoNothing().run()
}

export function listExpenses(db: DB, params: ExpensesListParams): ExpensesListResult {
  const conds: (SQL | undefined)[] = []
  const search = params.search?.trim()
  if (search) conds.push(or(like(schema.expenses.category, `%${search}%`), like(schema.expenses.note, `%${search}%`)))
  if (params.category && params.category !== 'all') conds.push(eq(schema.expenses.category, params.category))
  if (params.currency && params.currency !== 'all') conds.push(eq(schema.expenses.currency, params.currency))
  if (params.fromDate != null) conds.push(gte(schema.expenses.expenseDate, params.fromDate))
  if (params.toDate != null) conds.push(lte(schema.expenses.expenseDate, params.toDate))
  const where = conds.length ? and(...conds) : undefined

  const EXPENSE_SORTS: Record<string, AnyColumn> = {
    expenseDate: schema.expenses.expenseDate,
    category: schema.expenses.category,
    currency: schema.expenses.currency,
    amountCents: schema.expenses.amountCents
  }
  const sortCol = EXPENSE_SORTS[params.sortBy ?? '']
  const dirFn = params.sortDir === 'asc' ? asc : desc
  const orderCols = sortCol
    ? [dirFn(sortCol), desc(schema.expenses.id)]
    : [desc(schema.expenses.expenseDate), desc(schema.expenses.id)]

  const rows = db
    .select()
    .from(schema.expenses)
    .where(where)
    .orderBy(...orderCols)
    .limit(params.limit)
    .offset(params.offset)
    .all()
  const totalRow = db.select({ c: sql<number>`COUNT(*)` }).from(schema.expenses).where(where).get()
  return { rows: rows as ExpenseView[], total: Number(totalRow?.c ?? 0) }
}

export function registerExpensesIpc(getDb: () => DB): void {
  ipcMain.handle('expenses:list', (_e, params: ExpensesListParams) => listExpenses(getDb(), params))

  const summaryOf = (input: ExpenseInput): string =>
    `${input.category.trim() || 'general'} — ${(input.amountCents / 100).toFixed(2)} ${input.currency}`

  ipcMain.handle('expenses:create', (_e, input: ExpenseInput): number => {
    const db = getDb()
    const category = input.category.trim() || 'general'
    const res = db
      .insert(schema.expenses)
      .values({
        category,
        amountCents: input.amountCents,
        currency: input.currency,
        expenseDate: input.expenseDate,
        note: input.note?.trim() || null,
        createdAt: Date.now()
      })
      .run()
    ensureType(db, category)
    const id = Number(res.lastInsertRowid)
    const row = db.select().from(schema.expenses).where(eq(schema.expenses.id, id)).get()
    logChange(db, { entity: 'expense', entityId: id, action: 'create', summary: summaryOf(input), after: row })
    return id
  })

  ipcMain.handle('expenses:update', (_e, id: number, input: ExpenseInput): void => {
    const db = getDb()
    const category = input.category.trim() || 'general'
    const before = db.select().from(schema.expenses).where(eq(schema.expenses.id, id)).get()
    db.update(schema.expenses)
      .set({
        category,
        amountCents: input.amountCents,
        currency: input.currency,
        expenseDate: input.expenseDate,
        note: input.note?.trim() || null
      })
      .where(eq(schema.expenses.id, id))
      .run()
    ensureType(db, category)
    const after = db.select().from(schema.expenses).where(eq(schema.expenses.id, id)).get()
    logChange(db, { entity: 'expense', entityId: id, action: 'update', summary: summaryOf(input), before, after })
  })

  ipcMain.handle('expenses:remove', (_e, id: number): void => {
    const db = getDb()
    const before = db.select().from(schema.expenses).where(eq(schema.expenses.id, id)).get()
    db.delete(schema.expenses).where(eq(schema.expenses.id, id)).run()
    if (before) {
      logChange(db, {
        entity: 'expense',
        entityId: id,
        action: 'delete',
        summary: `${before.category} — ${(before.amountCents / 100).toFixed(2)} ${before.currency}`,
        before
      })
    }
  })

  ipcMain.handle('expenses:categories', (): string[] => {
    const rows = getDb()
      .selectDistinct({ c: schema.expenses.category })
      .from(schema.expenses)
      .where(isNotNull(schema.expenses.category))
      .all()
    return rows.map((r) => r.c).filter((c): c is string => !!c)
  })
}

/**
 * User-managed expense categories («انواع مصارف»). The chosen name is still what
 * gets stored on expenses.category; this list curates the suggestions and allows
 * rename (cascaded to existing expenses) and delete (blocked while in use).
 */
export function registerExpenseTypesIpc(getDb: () => DB): void {
  const listTypes = (db: DB): ExpenseType[] =>
    db.select().from(schema.expenseTypes).orderBy(schema.expenseTypes.name).all()

  ipcMain.handle('expenseTypes:list', () => listTypes(getDb()))

  ipcMain.handle('expenseTypes:create', (_e, input: ExpenseTypeInput): { ok: boolean; reason?: string } => {
    const db = getDb()
    const name = input.name.trim()
    if (!name) return { ok: false, reason: 'name_required' }
    const exists = db
      .select({ id: schema.expenseTypes.id })
      .from(schema.expenseTypes)
      .where(eq(schema.expenseTypes.name, name))
      .get()
    if (exists) return { ok: false, reason: 'duplicate' }
    db.insert(schema.expenseTypes).values({ name }).run()
    return { ok: true }
  })

  ipcMain.handle('expenseTypes:rename', (_e, id: number, input: ExpenseTypeInput): { ok: boolean; reason?: string } => {
    const db = getDb()
    const name = input.name.trim()
    if (!name) return { ok: false, reason: 'name_required' }
    const cur = db.select().from(schema.expenseTypes).where(eq(schema.expenseTypes.id, id)).get()
    if (!cur) return { ok: false, reason: 'not_found' }
    if (name === cur.name) return { ok: true }
    const clash = db
      .select({ id: schema.expenseTypes.id })
      .from(schema.expenseTypes)
      .where(eq(schema.expenseTypes.name, name))
      .get()
    if (clash) return { ok: false, reason: 'duplicate' }
    db.transaction((tx) => {
      tx.update(schema.expenseTypes).set({ name }).where(eq(schema.expenseTypes.id, id)).run()
      // Cascade the rename so expenses that used the old name stay linked.
      tx.update(schema.expenses).set({ category: name }).where(eq(schema.expenses.category, cur.name)).run()
    })
    return { ok: true }
  })

  ipcMain.handle('expenseTypes:remove', (_e, id: number): { ok: boolean; reason?: string } => {
    const db = getDb()
    const cur = db.select().from(schema.expenseTypes).where(eq(schema.expenseTypes.id, id)).get()
    if (!cur) return { ok: false, reason: 'not_found' }
    const inUse = db
      .select({ c: sql<number>`COUNT(*)` })
      .from(schema.expenses)
      .where(eq(schema.expenses.category, cur.name))
      .get()
    if (Number(inUse?.c ?? 0) > 0) return { ok: false, reason: 'in_use' }
    db.delete(schema.expenseTypes).where(eq(schema.expenseTypes.id, id)).run()
    return { ok: true }
  })
}
