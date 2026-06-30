import { ipcMain } from 'electron'
import { eq, asc, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import type { ArchiveLists } from '../../shared/contracts'

type DB = BetterSQLite3Database<typeof schema>

/** All archived items, separated by type (for the dedicated Archive page). */
export function archiveLists(db: DB): ArchiveLists {
  const clients = db
    .select({ id: schema.clients.id, name: schema.clients.name })
    .from(schema.clients)
    .where(eq(schema.clients.archived, true))
    .orderBy(asc(schema.clients.name))
    .all()

  const carpets = db
    .select({
      id: schema.carpets.id,
      label: schema.carpets.labelNumber,
      currency: schema.carpets.currency,
      totalPriceCents: schema.carpets.totalPriceCents,
      status: schema.carpets.status
    })
    .from(schema.carpets)
    .where(eq(schema.carpets.archived, true))
    .orderBy(asc(schema.carpets.labelNumber))
    .all()

  const materials = db
    .select({
      id: schema.materials.id,
      name: schema.materials.name,
      currency: schema.materials.currency,
      stockKg: sql<number>`COALESCE(SUM(CASE WHEN ${schema.materialLines.direction}='buy' THEN ${schema.materialLines.kilograms} ELSE -${schema.materialLines.kilograms} END),0)`
    })
    .from(schema.materials)
    .leftJoin(schema.materialLines, eq(schema.materialLines.materialId, schema.materials.id))
    .where(eq(schema.materials.archived, true))
    .groupBy(schema.materials.id)
    .orderBy(asc(schema.materials.name))
    .all()

  return {
    clients,
    carpets,
    materials: materials.map((m) => ({ ...m, stockKg: Number(m.stockKg) }))
  }
}

export function registerArchiveIpc(getDb: () => DB): void {
  ipcMain.handle('archive:list', () => archiveLists(getDb()))
}
