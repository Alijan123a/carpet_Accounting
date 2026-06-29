import { defineConfig } from 'drizzle-kit'

// Migrations output + schema location. No tables exist yet (Phase 0).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './src/main/db/migrations',
  verbose: true,
  strict: true
})
