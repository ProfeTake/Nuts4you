import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // En 'error' a propósito: el patrón "sincronizar query → estado local con un
      // useEffect + setState" ya se erradicó del código (ConfigBonos,
      // GestorInventario, PreparacionSiguienteTurno usan estado derivado). Además
      // del render extra, pisaba lo que el admin estuviera escribiendo cada vez que
      // refrescaba la query. Se deja duro para que no vuelva a entrar.
      'react-hooks/set-state-in-effect': 'error',
    },
  },
  {
    // shadcn/ui es código vendorizado: exportar `buttonVariants` junto a `Button`
    // es su convención upstream, y tocarlo rompería `npx shadcn add` al actualizar.
    // La regla solo afecta a Fast Refresh en dev, nunca al runtime.
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Punto de entrada: monta la app y no exporta nada, así que no hay frontera de
    // Fast Refresh que preservar.
    files: ['src/main.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
