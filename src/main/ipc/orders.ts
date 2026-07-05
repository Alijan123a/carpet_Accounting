import { ipcMain } from 'electron'
import { and, or, eq, like, desc, sql, type SQL } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import type {
  OrderInput,
  OrderStatus,
  OrderView,
  OrdersListParams,
  OrdersListResult
} from '../../shared/contracts'

type DB = BetterSQLite3Database<typeof schema>

function toView(row: schema.OrderRow, buyerName: string | null): OrderView {
  return {
    id: row.id,
    buyerClientId: row.buyerClientId,
    buyerName,
    title: row.title,
    quality: row.quality,
    length: row.length,
    width: row.width,
    quantity: row.quantity,
    priceCents: row.priceCents,
    currency: row.currency,
    status: row.status as OrderStatus,
    orderDate: row.orderDate,
    dueDate: row.dueDate,
    deliveredAt: row.deliveredAt,
    notes: row.notes,
    createdAt: row.createdAt,
    archived: row.archived
  }
}

export function listOrders(db: DB, params: OrdersListParams): OrdersListResult {
  const conds: (SQL | undefined)[] = []
  if (!params.includeArchived) conds.push(eq(schema.orders.archived, false))
  if (params.status && params.status !== 'all') conds.push(eq(schema.orders.status, params.status))
  const search = params.search?.trim()
  if (search) {
    conds.push(
      or(
        like(schema.orders.title, `%${search}%`),
        like(schema.orders.quality, `%${search}%`),
        like(schema.clients.name, `%${search}%`)
      )
    )
  }
  const where = conds.length ? and(...conds) : undefined

  const rows = db
    .select({ order: schema.orders, buyerName: schema.clients.name })
    .from(schema.orders)
    .leftJoin(schema.clients, eq(schema.orders.buyerClientId, schema.clients.id))
    .where(where)
    .orderBy(desc(schema.orders.orderDate), desc(schema.orders.id))
    .limit(params.limit)
    .offset(params.offset)
    .all()

  const totalRow = db
    .select({ c: sql<number>`COUNT(*)` })
    .from(schema.orders)
    .leftJoin(schema.clients, eq(schema.orders.buyerClientId, schema.clients.id))
    .where(where)
    .get()

  return { rows: rows.map((r) => toView(r.order, r.buyerName)), total: Number(totalRow?.c ?? 0) }
}

/** Shared field mapping for create/update (excludes lifecycle-only columns). */
function valuesFromInput(input: OrderInput): {
  buyerClientId: number
  title: string
  quality: string | null
  length: number | null
  width: number | null
  quantity: number
  priceCents: number
  currency: OrderInput['currency']
  status: OrderStatus
  orderDate: number
  dueDate: number | null
  notes: string | null
} {
  return {
    buyerClientId: input.buyerClientId,
    title: input.title.trim(),
    quality: input.quality?.trim() || null,
    length: input.length ?? null,
    width: input.width ?? null,
    quantity: input.quantity > 0 ? Math.trunc(input.quantity) : 1,
    priceCents: input.priceCents,
    currency: input.currency,
    status: input.status,
    orderDate: input.orderDate,
    dueDate: input.dueDate ?? null,
    notes: input.notes?.trim() || null
  }
}

export function registerOrdersIpc(getDb: () => DB): void {
  ipcMain.handle('orders:list', (_e, params: OrdersListParams) => listOrders(getDb(), params))

  ipcMain.handle('orders:create', (_e, input: OrderInput): number => {
    const now = Date.now()
    const v = valuesFromInput(input)
    const res = getDb()
      .insert(schema.orders)
      .values({
        ...v,
        // Stamp delivery time up front if the order is created already delivered.
        deliveredAt: v.status === 'delivered' ? now : null,
        createdAt: now
      })
      .run()
    return Number(res.lastInsertRowid)
  })

  ipcMain.handle('orders:update', (_e, id: number, input: OrderInput): void => {
    const db = getDb()
    const existing = db.select().from(schema.orders).where(eq(schema.orders.id, id)).get()
    if (!existing) return
    const v = valuesFromInput(input)
    // Keep delivered_at coherent with the (possibly changed) status.
    const deliveredAt =
      v.status === 'delivered' ? existing.deliveredAt ?? Date.now() : null
    db.update(schema.orders).set({ ...v, deliveredAt }).where(eq(schema.orders.id, id)).run()
  })

  ipcMain.handle('orders:setStatus', (_e, id: number, status: OrderStatus): void => {
    const db = getDb()
    const existing = db.select().from(schema.orders).where(eq(schema.orders.id, id)).get()
    if (!existing) return
    const deliveredAt = status === 'delivered' ? existing.deliveredAt ?? Date.now() : null
    db.update(schema.orders).set({ status, deliveredAt }).where(eq(schema.orders.id, id)).run()
  })

  ipcMain.handle('orders:remove', (_e, id: number): void => {
    getDb().delete(schema.orders).where(eq(schema.orders.id, id)).run()
  })
}
