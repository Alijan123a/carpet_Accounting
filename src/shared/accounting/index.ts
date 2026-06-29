/**
 * Pure accounting engine — barrel export.
 *
 * Everything here is dependency-free (no Electron, no better-sqlite3) and is the
 * single source of truth for accounting math. The Electron main-process DB layer
 * fetches rows and delegates to these functions; unit tests exercise them
 * directly under plain Node.
 */
export * from './types'
export * from './money'
export * from './sign'
export * from './balance'
export * from './carpet'
export * from './material'
export * from './period'
export * from './reverse'
export * from './devReport'
