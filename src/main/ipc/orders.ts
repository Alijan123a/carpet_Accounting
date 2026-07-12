import { ipcMain } from 'electron'
import { and, or, eq, like, asc, desc, sql, type SQL, type AnyColumn } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { logChange } from '../changeLog'
import type {
  OrderAssignment,
  OrderInput,
  OrderItem,
  OrderItemStatus,
  OrderStatus,
  OrderView,
  OrdersListParams,
  OrdersListResult,
  SellerAssignmentView
} from '../../shared/contracts'

type DB = BetterSQLite3Database<typeof schema>

const ITEM_STATUSES = new Set(['pending', 'on_work', 'complete', 'delivered'])
/**
 * Status of a stored hand-off. A hand-off existing at all means its pieces are
 * with a بافنده, so it is never «در انتظار» — 'pending' (incl. legacy entries
 * saved before this rule) reads as on_work. Only an item's still-unassigned
 * remainder counts as pending (see statusCounts in the renderer).
 */
const asStatus = (v: unknown): OrderItemStatus => {
  const s = ITEM_STATUSES.has(v as string) ? (v as OrderItemStatus) : 'on_work'
  return s === 'pending' ? 'on_work' : s
}

/** Normalize one raw assignment row, dropping invalid entries (returns null). */
function normalizeAssignment(raw: unknown, fallbackDate: number, seq: number): OrderAssignment | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Partial<OrderAssignment>
  if (a.sellerClientId == null) return null
  const quantity = Number(a.quantity)
  return {
    id: typeof a.id === 'string' && a.id ? a.id : `${fallbackDate}-${seq}`,
    sellerClientId: Number(a.sellerClientId),
    sellerName: typeof a.sellerName === 'string' ? a.sellerName : '',
    quantity: Number.isFinite(quantity) && quantity > 0 ? Math.trunc(quantity) : 0,
    assignedDate: Number.isFinite(Number(a.assignedDate)) ? Number(a.assignedDate) : fallbackDate,
    status: asStatus(a.status)
  }
}

/**
 * Normalize one raw item, filling the assignments array. Legacy items saved with
 * a single `sellerClientId`/`status` are migrated to a one-entry assignment.
 */
function normalizeItem(raw: OrderItem, fallbackDate: number): OrderItem {
  const legacy = raw as OrderItem & {
    sellerClientId?: number | null
    sellerName?: string | null
    status?: OrderItemStatus
  }
  let assignments: OrderAssignment[] = []
  if (Array.isArray(raw.assignments)) {
    assignments = raw.assignments
      .map((a, i) => normalizeAssignment(a, fallbackDate, i))
      .filter((a): a is OrderAssignment => a !== null)
  } else if (legacy.sellerClientId != null) {
    const one = normalizeAssignment(
      {
        sellerClientId: legacy.sellerClientId,
        sellerName: legacy.sellerName ?? '',
        quantity: raw.quantity,
        assignedDate: fallbackDate,
        status: legacy.status ?? 'on_work'
      },
      fallbackDate,
      0
    )
    if (one) assignments = [one]
  }
  return {
    carpetType: raw.carpetType,
    graph: raw.graph,
    width: raw.width,
    length: raw.length,
    sqm: raw.sqm,
    textColor: raw.textColor,
    borderColor: raw.borderColor,
    quantity: raw.quantity,
    description: raw.description,
    assignments
  }
}

/** Parse the items_json snapshot ([] for legacy single-line orders / bad JSON). */
function parseItems(json: string | null, fallbackDate: number): OrderItem[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? (arr as OrderItem[]).map((it) => normalizeItem(it, fallbackDate)) : []
  } catch {
    return []
  }
}

function toView(row: schema.OrderRow, buyerName: string | null): OrderView {
  return {
    id: row.id,
    buyerClientId: row.buyerClientId,
    buyerName,
    orderNo: row.orderNo,
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
    archived: row.archived,
    items: parseItems(row.itemsJson, row.orderDate)
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
        like(schema.orders.orderNo, `%${search}%`),
        like(schema.orders.title, `%${search}%`),
        like(schema.orders.quality, `%${search}%`),
        like(schema.clients.name, `%${search}%`)
      )
    )
  }
  const where = conds.length ? and(...conds) : undefined

  const ORDER_SORTS: Record<string, AnyColumn> = {
    orderDate: schema.orders.orderDate,
    dueDate: schema.orders.dueDate,
    orderNo: schema.orders.orderNo,
    title: schema.orders.title,
    status: schema.orders.status,
    quantity: schema.orders.quantity,
    priceCents: schema.orders.priceCents,
    buyerName: schema.clients.name
  }
  const sortCol = ORDER_SORTS[params.sortBy ?? '']
  const dirFn = params.sortDir === 'asc' ? asc : desc
  const orderCols = sortCol
    ? [dirFn(sortCol), desc(schema.orders.id)]
    : [desc(schema.orders.orderDate), desc(schema.orders.id)]

  const rows = db
    .select({ order: schema.orders, buyerName: schema.clients.name })
    .from(schema.orders)
    .leftJoin(schema.clients, eq(schema.orders.buyerClientId, schema.clients.id))
    .where(where)
    .orderBy(...orderCols)
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
  orderNo: string | null
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
  itemsJson: string | null
} {
  return {
    buyerClientId: input.buyerClientId,
    orderNo: input.orderNo?.trim() || null,
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
    notes: input.notes?.trim() || null,
    itemsJson: input.items?.length ? JSON.stringify(input.items) : null
  }
}

/** Suggested next «نمبر سفارش»: sequential over the orders table. */
export function nextOrderNo(db: DB): string {
  const row = db.select({ m: sql<number>`COALESCE(MAX(${schema.orders.id}), 0)` }).from(schema.orders).get()
  return String(Number(row?.m ?? 0) + 1)
}

export function registerOrdersIpc(getDb: () => DB): void {
  const orderRow = (db: DB, id: number): schema.OrderRow | undefined =>
    db.select().from(schema.orders).where(eq(schema.orders.id, id)).get()

  ipcMain.handle('orders:list', (_e, params: OrdersListParams) => listOrders(getDb(), params))

  ipcMain.handle('orders:get', (_e, id: number): OrderView | null => {
    const db = getDb()
    const row = db
      .select({ order: schema.orders, buyerName: schema.clients.name })
      .from(schema.orders)
      .leftJoin(schema.clients, eq(schema.orders.buyerClientId, schema.clients.id))
      .where(eq(schema.orders.id, id))
      .get()
    return row ? toView(row.order, row.buyerName) : null
  })

  ipcMain.handle('orders:create', (_e, input: OrderInput): number => {
    const db = getDb()
    const now = Date.now()
    const v = valuesFromInput(input)
    const res = db
      .insert(schema.orders)
      .values({
        ...v,
        // Stamp delivery time up front if the order is created already delivered.
        deliveredAt: v.status === 'delivered' ? now : null,
        createdAt: now
      })
      .run()
    const id = Number(res.lastInsertRowid)
    logChange(db, { entity: 'order', entityId: id, action: 'create', summary: v.title, after: orderRow(db, id) })
    return id
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
    logChange(db, { entity: 'order', entityId: id, action: 'update', summary: v.title, before: existing, after: orderRow(db, id) })
  })

  ipcMain.handle('orders:setStatus', (_e, id: number, status: OrderStatus): void => {
    const db = getDb()
    const existing = db.select().from(schema.orders).where(eq(schema.orders.id, id)).get()
    if (!existing) return
    const deliveredAt = status === 'delivered' ? existing.deliveredAt ?? Date.now() : null
    db.update(schema.orders).set({ status, deliveredAt }).where(eq(schema.orders.id, id)).run()
    logChange(db, {
      entity: 'order',
      entityId: id,
      action: 'update',
      summary: `${existing.title}: ${existing.status} → ${status}`,
      before: existing,
      after: orderRow(db, id)
    })
  })

  ipcMain.handle('orders:updateItems', (_e, id: number, items: OrderItem[]): void => {
    const db = getDb()
    const existing = db.select().from(schema.orders).where(eq(schema.orders.id, id)).get()
    if (!existing) return
    const normalized = (Array.isArray(items) ? items : []).map((it) =>
      normalizeItem(it, existing.orderDate)
    )
    const quantity = normalized.reduce((s, it) => s + (it.quantity > 0 ? Math.trunc(it.quantity) : 0), 0) || 1
    db.update(schema.orders)
      .set({ itemsJson: normalized.length ? JSON.stringify(normalized) : null, quantity })
      .where(eq(schema.orders.id, id))
      .run()
    logChange(db, {
      entity: 'order',
      entityId: id,
      action: 'update',
      summary: `${existing.title}: اقلام به‌روزرسانی شد`,
      before: existing,
      after: orderRow(db, id)
    })
  })

  ipcMain.handle('orders:assignedToSeller', (_e, sellerClientId: number): SellerAssignmentView[] => {
    const db = getDb()
    // Scan orders (single-user, offline dataset) and flatten matching hand-offs.
    const rows = db
      .select({ order: schema.orders, buyerName: schema.clients.name })
      .from(schema.orders)
      .leftJoin(schema.clients, eq(schema.orders.buyerClientId, schema.clients.id))
      .where(eq(schema.orders.archived, false))
      .all()

    const out: SellerAssignmentView[] = []
    for (const { order, buyerName } of rows) {
      const items = parseItems(order.itemsJson, order.orderDate)
      items.forEach((it, itemIndex) => {
        for (const a of it.assignments ?? []) {
          if (a.sellerClientId !== sellerClientId) continue
          out.push({
            orderId: order.id,
            orderNo: order.orderNo,
            buyerName,
            orderDate: order.orderDate,
            itemIndex,
            assignmentId: a.id,
            carpetType: it.carpetType,
            graph: it.graph,
            width: it.width,
            length: it.length,
            sqm: it.sqm,
            quantity: a.quantity,
            assignedDate: a.assignedDate,
            status: a.status
          })
        }
      })
    }
    // Newest hand-offs first.
    out.sort((a, b) => b.assignedDate - a.assignedDate || b.orderId - a.orderId)
    return out
  })

  ipcMain.handle('orders:nextOrderNo', () => nextOrderNo(getDb()))

  ipcMain.handle('orders:remove', (_e, id: number): void => {
    const db = getDb()
    const before = orderRow(db, id)
    db.delete(schema.orders).where(eq(schema.orders.id, id)).run()
    if (before) {
      logChange(db, { entity: 'order', entityId: id, action: 'delete', summary: before.title, before })
    }
  })
}
