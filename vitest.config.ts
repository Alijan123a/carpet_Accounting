import { defineConfig } from 'vitest/config'

// Unit tests target the PURE accounting engine in src/shared/accounting.
// These files have no Electron / better-sqlite3 (native) dependencies, so they
// run cleanly under plain Node — independent of the Electron-ABI native binary.
export default defineConfig({
  test: {
    include: ['src/shared/**/*.test.ts'],
    environment: 'node',
    globals: false
  }
})
