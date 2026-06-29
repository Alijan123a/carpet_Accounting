import { ipcMain } from 'electron'
import { and, or, eq, like, gte, lte, desc, sql, isNotNull, type SQL } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
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

  const rows = db
    .select()
    .from(schema.expenses)
    .where(where)
    .orderBy(desc(schema.expenses.expenseDate), desc(schema.expenses.id))
    .limit(params.limit)
    .offset(params.offset)
    .all()
  const totalRow = db.select({ c: sql<number>`COUNT(*)` }).from(schema.expenses).where(where).get()
  return { rows: rows as ExpenseView[], total: Number(totalRow?.c ?? 0) }
}

export function registerExpensesIpc(getDb: () => DB): void {
  ipcMain.handle('expenses:list', (_e, params: ExpensesListParams) => listExpenses(getDb(), params))

  ipcMain.handle('expenses:create', (_e, input: ExpenseInput): number => {
    const res = getDb()
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
    return Number(res.lastInsertRowid)
  })

  ipcMain.handle('expenses:update', (_e, id: number, input: ExpenseInput): void => {
    getDb()
      .update(schema.expenses)
      .set({
        category: input.category.trim() || 'general',
        amountCents: input.amountCents,
        currency: input.currency,
        expenseDate: input.expenseDate,
        note: input.note?.trim() || null
      })
      .where(eq(schema.expenses.id, id))
      .run()
  })

  ipcMain.handle('expenses:remove', (_e, id: number): void => {
    getDb().delete(schema.expenses).where(eq(schema.expenses.id, id)).run()
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
