import { ipcMain } from 'electron'
import { and, or, eq, like, gte, lte, asc, desc, sql, isNotNull, type SQL, type AnyColumn } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { logChange } from '../changeLog'
import type { ExpenseInput, ExpensesListParams, ExpensesListResult, ExpenseView } from '../../shared/contracts'

type DB = BetterSQLite3Database<typeof schema>

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
    const res = db
      .insert(schema.expenses)
      .values({
        category: input.category.trim() || 'general',
        amountCents: input.amountCents,
        currency: input.currency,
        expenseDate: input.expenseDate,
        note: input.note?.trim() || null,
        createdAt: Date.now()
      })
      .run()
    const id = Number(res.lastInsertRowid)
    const row = db.select().from(schema.expenses).where(eq(schema.expenses.id, id)).get()
    logChange(db, { entity: 'expense', entityId: id, action: 'create', summary: summaryOf(input), after: row })
    return id
  })

  ipcMain.handle('expenses:update', (_e, id: number, input: ExpenseInput): void => {
    const db = getDb()
    const before = db.select().from(schema.expenses).where(eq(schema.expenses.id, id)).get()
    db.update(schema.expenses)
      .set({
        category: input.category.trim() || 'general',
        amountCents: input.amountCents,
        currency: input.currency,
        expenseDate: input.expenseDate,
        note: input.note?.trim() || null
      })
      .where(eq(schema.expenses.id, id))
      .run()
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
