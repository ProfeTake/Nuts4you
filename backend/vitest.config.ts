import { defineConfig } from 'vitest/config'

// Sin esta config, `npm test` (vitest run sin filtro) recogía también los .js
// compilados en dist/servicios/__tests__/ y fallaba al cargarlos como CommonJS.
// Solo los tests TypeScript de src/ son la suite real.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
