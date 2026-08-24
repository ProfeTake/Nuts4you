# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ERP/POS system for **Nuts 4 You**, a Chilean confectionery and liquids retail chain with 5 branches (Mall Patio, Paseo, Open Plaza, Cugat Rengo, Cugat Baquedano) plus a central warehouse (bodega). The codebase is entirely in Spanish — models, routes, types, components, and variables all use Spanish naming.

Important scope rule: the **POS** module is not intended to issue receipts, invoices, or any other tax documents. Its purpose is to register internal sales and support the operational accounting flow of each shift, cash closing, and deposit control.

**Sales/stock model (declared, stock-flow):** individual sales live only in the browser during the shift (Zustand store, offline-first); there is no `Venta` model in the backend. Stock is **not** discounted in real time — it is **reconciled at shift close**: the vendor declares final stock counts and sales totals, and `PATCH /pos/turnos/:id/cerrar` persists them (turno + deposito + inventario) in a single transaction.

**Cash reconciliation (cuadre) — server-authoritative.** The client declares only the *inputs* (sales totals by payment method, and the cash it counted). The **cuadre itself is computed by the server** in `cerrarTurno`, using the gastos/retiros that are in the DB, and persisted to `venta_efectivo` / `diferencia_caja`. The identities come from the client's spreadsheet (`excel nuts 4 you/01 Mall Patio Feb 2026.xlsx`, cells P15/P21/P22/P24/P25/P26) and live as pure functions in `calculos.servicio.ts`:

```
ventaEfectivo = totalCalculado − tarjeta − transferencia
esperadoCaja  = ventaEfectivo − gastos − retiros
diferencia    = efectivoContado − esperadoCaja
aDepositar    = efectivoContado + retiros
```

The **caja chica** (saldo de apertura) stays out of the cuadre: the vendor counts and hands over only sales cash; the float stays at the branch. When the client's declared cuadre disagrees with the server's, the server persists its own and logs a `[coherencia]` warning — that means the POS was out of sync, not that the vendor is short.

A **negative `esperadoCaja` is physically impossible** — more cash left the till than entered it — and is almost always a retiro charged to the wrong shift or with an extra zero. It cannot be blocked at retiro time (mid-shift the server does not know the sales yet: they are declared at close), so it is detected at close (`[coherencia]` warn) and flagged in red in the admin cuadre. Left unflagged it reads as a large *surplus*, because subtracting a negative expectation inflates the difference.

**Undoing a close.** `PATCH /pos/turnos/:id/reabrir` (ADMIN) reverts a mis-declared cuadre: it restores the PDV inventory from the `saldo_anterior` of the `HistorialInventario` rows anchored by `TurnoCaja.cierre_lote_id`, deletes the generated `Deposito` and the `VentaTurnoItem` rows, clears the cuadre and recepción fields, and sets the shift back to ABIERTO. It refuses when the shift is already in a `PagoPersonal`, when its deposit is no longer PENDIENTE, or when the PDV has another open shift. Shifts closed before `cierre_lote_id` existed reopen with `stockRestaurable: false` — the inventory is *not* reverted and the caller is told so. Gastos and retiros survive a reopen on purpose (they are real movements of the point); correct them separately with `DELETE /pos/turnos/:id/retiros/:retiroId` or `.../gastos/:gastoId`, which only work while the shift is ABIERTO.

**Retiros are admin-only.** Only ADMIN/SUPERVISOR create them (`POST /pos/turnos/:id/retiros`); the vendor's POS *reads* them (`cargarRetirosDesdeAPI` → GET on the same path, scoped to the shift owner) and shows them read-only in the cuadre. This is not cosmetic: before, admin retiros never reached the POS store, so the vendor's "expected in drawer" was inflated by the retired amount and every close produced a phantom faltante of exactly that size.

**Payroll — one module, one formula (`Excel nuts 4 you/Sueldos Feb 2026.xlsx`, hoja `PAGO TURNOS`).** Sueldos and Bonos are a single tab (**Personal → Sueldos**, sub-tabs *Liquidar período* / *Configuración*); there is no separate "Bonos" tab. Each closed shift is one row of the spreadsheet and the period total is cell `K162`:

```
fila (turno)  = pagoDiario + bono(tramos del PDV, venta) + valorExtra × extra     (cols I, J, E)
período       = Σ filas − descuentoCaja + adicional − cotizaciones                (K162)
```

Pure functions in `configNomina.servicio.ts` (`pagoDiarioDe`, `calcularMontoExtra`, `calcularDescuentoCaja`, `calcularTotalPago`) + `calcularBono` in `calculos.servicio.ts`; shared by the three consumers (`getNomina`, `getResumenPago`/`generarPagos`, `pagarTurnosDesdeCaja`) so they cannot diverge.

- **`ConfigNomina`** (single row, id=1) holds all the global knobs: `pago_diario_base` (P13, $28.000), `valor_extra` (the 3.000 multiplying column E), `cotizaciones_default` (H164) and `tolerancia_faltante` (the −1.000 of K162).
- **`Usuario.pago_diario` is a nullable *override*** — `null` means "use the global". Always resolve with `pagoDiarioDe()`, never read the column directly.
- **Cash tolerance**: the discount is applied over the **net** of all the period's `diferencia_caja` values (surpluses offset shortfalls), and only when that net is worse than `tolerancia_faltante` — the spreadsheet's `IF(neto < −1000; neto; 0)`. The whole net is discounted, not just the excess.
- **`TurnoCaja.extra_decimas`** is the "Adicional"/Extra of column E, in tenths (`5` = 0,5 · `10` = 1 · `15` = 1,5) to keep the all-integers convention. **The ADMIN loads it at liquidation time** (`PATCH /rrhh/turnos/:id/extra`), not the vendor at close; it is refused on a shift that is already paid, and it *survives* `anularPago` on purpose.
- **`adicional` / `cotizaciones`** are per-period, per-vendor: sent in the body of `POST /rrhh/pagos` (`ajustes[]`) or `POST /rrhh/pagos/directo`, and frozen in `PagoPersonal.monto_adicional` / `monto_cotizaciones`. A pay that does not come out positive is refused (it would record a debt as if it were a payment).
- **`POST /rrhh/pagos` accepts `usuarioIds`** to liquidate only some vendors; omitting it pays everyone in the range (the historical behaviour).

**Payroll UI mirrors the spreadsheet, not the database.** `PagosPeriodo` shows **one vendor's sheet at a time**: her shifts as rows (fecha · sucursal · venta · diferencia · pago diario · bono · horas extra · total) and, underneath, the closing block (Subtotal → descuento de caja → ajuste → cotizaciones → TOTAL A PAGAR). That is the grain the client actually thinks in; an aggregate-per-vendor table with the shifts hidden behind a disclosure was measurably harder to read than the Excel. Naming: the sheet calls both column E and cell H163 "Adicional", so the UI says **"horas extra"** (per shift) and **"ajuste"** (per period) to keep them apart. The **nómina informativa** lives in the *Seguimiento* tab, never next to the liquidation — the two measure different sets on purpose and side by side they read as a contradiction.

Known divergence from the sheet: Mall Patio's $350.000 tier uses a strict `>` in Excel while every other tier uses `>=`; `calcularBono` uses `>=` throughout, so a shift of exactly $350.000 at Mall pays 19.000 here vs 12.000 there.

**Paying a vendor out of the branch's cash ("Pagar a Vendedor").** The admin can hand a vendor their pay with the cash just collected at a point; that money never reaches the bank, so it is subtracted from that shift's deposit — the spreadsheet's `F29` ("Pagado a Vendedor (DC)"), which feeds `A DEPOSITAR = venta + diferencia − gastos − F29`. It is persisted as `Deposito.pago_vendedor` (an accumulator; `monto_teorico` keeps the gross), so **everything that reports "a depositar" must net it**: `monto_teorico − pago_vendedor`. The payment itself is a normal `PagoPersonal` — same calculation as the Nómina — tagged with `pdv_id`/`turno_pago_id`, settling the vendor's unpaid shifts oldest-first (any branch, not just this one). `POST /rrhh/pagos/directo` (ADMIN); `anularPago` returns the money to the deposit. Two locks: the deposit must still be PENDIENTE with `monto_real = 0`, and `reabrirTurno` refuses a shift whose cash paid someone (reopening deletes the deposit and the deduction with it) — anular the payment first. A **negative** "a depositar" is allowed here: paying more than the shift collected is normal in the spreadsheet (Mall Patio, Feb 15: −$72.400).

## Monorepo Structure

Two independent packages at the root — no workspace manager, each has its own `node_modules`:

- **`frontend/`** — React 19 + Vite 8 + TypeScript SPA
- **`backend/`** — Express 5 + Prisma + TypeScript REST API

## Files & folders to ignore (do not scan)

To avoid wasting time/tokens re-scanning generated or binary files, ignore these when searching or reading. A `.claudeignore` at the root mirrors this list (note: Claude Code also honors the existing `.gitignore`, which already excludes `node_modules/`, `dist/`, `build/`).

- **Dependencies**: `node_modules/` (in root, `frontend/`, and `backend/`)
- **Build output**: `dist/`, `build/`, `*.tsbuildinfo`
- **Test coverage**: `coverage/`
- **Lockfiles**: `package-lock.json` (large, low-signal)
- **Binary assets**: images, fonts, icons under `frontend/public/` and any `*.png/*.jpg/*.svg/*.ico/*.woff*`
- **Prisma migration history**: `backend/prisma/migrations/` (read `schema.prisma` instead, which is the current source of truth)
- **Env files**: `.env*` (secrets — never read or commit)

Where to look instead: business logic in `backend/src/servicios/` and `frontend/src/componentes/`, the data model in `backend/prisma/schema.prisma`, and the architecture audit under `docs/auditoria/`.

## Development Commands

### Frontend (from `frontend/`)
```bash
npm run dev          # Vite dev server with HMR
npm run build        # tsc -b && vite build
npm run lint         # ESLint
npm run preview      # Preview the production build locally
```

### Backend (from `backend/`)
```bash
npm run dev          # nodemon + ts-node (watches src/)
npm run build        # tsc → dist/
npm run start        # node dist/servidor.js
npm test             # Vitest (run once)
npm run test:watch   # Vitest watch mode
npm run prisma:generate   # Generate Prisma client
npm run prisma:migrate    # Run migrations (dev)
npm run prisma:seed       # Seed the database (prisma/seeds/seed.ts)
npm run prisma:deploy     # Apply migrations in production (migrate deploy)
npm run prisma:studio     # Open Prisma Studio GUI
```

### Tests
- **Backend**: Vitest. Run all with `npm test` (from `backend/`). Test files live next to services under `src/servicios/__tests__/` (e.g. `calculos.servicio.test.ts`). Coverage is thin — only pure-calculation services are tested today.
- **Frontend**: no test suite configured — `npm run lint` (ESLint) is the only automated check.

### Environment Variables
- Backend: `PUERTO` (default 3001), `DATABASE_URL` (MySQL), `NODE_ENV`
- Backend seed (production only): `SEED_PASSWORD_ADMIN`, `SEED_PASSWORD_STAFF` — with `NODE_ENV=production` the seed refuses to run without them (no weak default credentials); in dev it falls back to `admin`/`1234`
- Frontend: `VITE_API_URL` (production backend URL; dev uses proxy to localhost:3001)

Note (Windows): `npm run dev` (nodemon) launched from a non-interactive shell leaves an orphaned child serving without visible logs. To run the backend as a service use `npm run build && npm start`.

## Architecture

### Backend
- **Entry point**: `src/servidor.ts` — Express app, mounts all routes under `/api`
- **Routes**: `src/rutas/` — central registry in `index.ts`, individual route files named `*.rutas.ts`
- **Middleware**: `src/middlewares/` — error handler, auth (`autenticar.ts`), authorization (`autorizar.ts`)
- **Database**: MySQL via Prisma ORM. Schema at `prisma/schema.prisma`. Seeds in `prisma/seeds/`
- **Validation**: Zod schemas in `src/validaciones/`
- **Services**: Business logic in `src/servicios/`
- **Config**: `src/config/entorno.ts` loads env vars via dotenv

### Frontend
- **Routing**: React Router v7 in `App.tsx`. Two main layouts:
  - **POS layout** (`BarraLateral` wrapper) — for VENDEDOR/BODEGUERO roles: dashboard, inventory, sales history, cash closing, daily report. This module records internal sales locally in the browser and reconciles stock at shift close (see "Sales/stock model" above); it does not handle receipt or tax-document issuance.
  - **Admin layout** (`LayoutAdmin` wrapper) — for ADMIN/SUPERVISOR roles: dashboard, branch control, warehouse, deposits/finance, HR
- **Pages**: `src/paginas/` — full page components
- **Components**: `src/componentes/` (project-specific) and `src/components/ui/` (shadcn/ui primitives)
- **State**: Zustand stores via custom hooks in `src/hooks/` (useAuth, useCarrito, useSesionPOS, useMenuAdmin)
- **API client**: `src/lib/api.ts` — fetch wrapper with Bearer token auth, helpers `apiGet`, `apiPost`, `apiPatch`, `apiDelete`
- **Types**: `src/tipos/` — `pos.tipos.ts` (POS domain) and `admin.tipos.ts` (admin modules)
- **Utilities**: `src/lib/money.ts` (CLP formatting, no decimals), `src/lib/dates.ts` (Chile timezone, date-fns with `es` locale), `src/lib/permisos.ts` (role-based permission matrix)
- **Path alias**: `@/*` maps to `src/*`
- **UI**: Tailwind CSS v4, shadcn/ui components, Geist font, lucide-react icons, recharts for charts, sonner for toasts
- **React Compiler** is enabled (babel-plugin-react-compiler)

### Roles & Permissions
Four roles: `ADMIN`, `SUPERVISOR`, `VENDEDOR`, `BODEGUERO`. Permission matrix in `lib/permisos.ts` controls module access (pos, inventario, bodega, finanzas, rrhh, usuarios, admin).

### Domain Vocabulary
All code uses Spanish terms matching the business domain:
- **Mezclas** (mixes): MM, MA, MN, MPr — confectionery product categories
- **PDV** = punto de venta (point of sale / branch)
- **Turno** = shift/cash session, **Cierre de caja** = cash closing
- **Deposito** = bank deposit tracking, **A depositar** = amount pending deposit
- **Bodega** = central warehouse
- **Sucursal** = branch location

### Warehouse Flows (solicitud and despacho are fused — A15)
Dispatching a solicitud **moves stock**. There are two entry points, both landing on the same transactional core (`ejecutarDespachoEnTx`: decrement bodega with a `gte` guard, increment PDV, `MovimientoInv` TRASPASO, `Despacho` header, all grouped by `lote_id`):
- **From a solicitud** — `PATCH /solicitudes/:id/despachar` → `bodega.servicio.despacharSolicitudConStock`. The bodeguero declares the quantities actually sent (may be fewer than requested, or 0 for an item out of stock; products outside the pedido are rejected). Marks the solicitud DESPACHADA and links the despacho via `Despacho.solicitud_id`.
- **Ad-hoc, no pedido** — `POST /bodega/despachos` → `bodega.servicio.registrarDespacho` (`solicitud_id` null).

Never do both for the same goods — that double-counts stock. `Solicitud.items` keeps the original pedido, the linked despacho holds what shipped — that's how the UI shows "pidió vs envié".

**When the PDV actually gets the stock differs by entry point** (`ejecutarDespachoEnTx` takes a `creditarPDV` flag):
- **Ad-hoc** (`creditarPDV: true`, the default) — the PDV inventory is incremented at dispatch. Confirming (`confirmarDespacho`) only marks it received; it does not touch stock.
- **From a solicitud** (`creditarPDV: false`, *deferred*) — bodega is decremented and the `MovimientoInv` rows are written, but the goods stay "en camino": the PDV inventory is credited only when the vendor confirms, by `acreditarDespachoEnPDV` inside `confirmarSolicitud`. **Until then the vendor's stock reads 0**, so a shipment that is never confirmed silently blocks the whole shift.

Because of that, a linked despacho **must** be acknowledged through `PATCH /solicitudes/:id/confirmar`, never through `PATCH /bodega/despachos/:loteId/confirmar` — the latter would close it leaving the stock uncredited, and now rejects linked despachos with a 409. `getDespachosPendientes` returns **both** kinds with a `solicitudId` field (null = ad-hoc) so the POS can route the confirmation; it used to exclude linked ones, which hid the only actionable path behind a collapsed card in Solicitudes.

Frontend: the dispatch bandeja lives in **Bodega → tab Solicitudes** (`SolicitudesBodega`), not in Sucursales. The dispatch form itself is `componentes/solicitudes/ModalDespacharSolicitud`, shared with the POS page (`SolicitudesPDV`) because BODEGUERO runs in the POS layout.

### Key Data Patterns
- All monetary values are **CLP integers** (Chilean pesos, no decimals)
- Dates display as `dd/MM/yyyy` with `America/Santiago` timezone
- Prisma schema uses Spanish field names matching the domain
- POS sales are operational records for stock and cash control, not fiscal sales documents

## Deployment
- Frontend: Docker multi-stage build (node:22-alpine → serve static), deployed on Railway
- Backend: Railway with MySQL plugin (provides `DATABASE_URL` automatically)
- Node.js >= 22.12.0 required
