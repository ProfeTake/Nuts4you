# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

ERP/POS system for **Nuts 4 You**, a Chilean confectionery and liquids retail chain with 5 branches (Mall Patio, Paseo, Open Plaza, Cugat Rengo, Cugat Baquedano) plus a central warehouse (bodega). The codebase is entirely in Spanish — models, routes, types, components, and variables all use Spanish naming.

Important scope rule: the **POS** module is not intended to issue receipts, invoices, or any other tax documents. Its purpose is to register internal sales and support the operational accounting flow of each shift, cash closing, and deposit control.

**Sales/stock model (declared, stock-flow):** individual sales live only in the browser during the shift (Zustand store, offline-first); there is no `Venta` model in the backend. Stock is **not** discounted in real time — it is **reconciled at shift close**: the vendor declares final stock counts and sales totals, and `PATCH /pos/turnos/:id/cerrar` persists them (turno + deposito + inventario) in a single transaction. The server validates internal coherence of the declared close (diferencia de caja vs efectivo contado/venta efectivo, 422 on mismatch) and logs discrepancies against gastos/retiros recorded in DB, but totals remain client-declared, not server-derived.

## Monorepo Structure

Two independent packages at the root — no workspace manager, each has its own `node_modules`:

- **`frontend/`** — React 19 + Vite 8 + TypeScript SPA
- **`backend/`** — Express 5 + Prisma + TypeScript REST API

## Files & folders to ignore (do not scan)

To avoid wasting time/tokens re-scanning generated or binary files, ignore these when searching or reading. A `.claudeignore` at the root mirrors this list (note: Codex also honors the existing `.gitignore`, which already excludes `node_modules/`, `dist/`, `build/`).

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

Never do both for the same goods — that double-counts stock. A linked despacho is acknowledged by confirming its **solicitud** (`confirmarSolicitud` also closes the despacho), so `getDespachosPendientes` excludes despachos with a `solicitud_id`; otherwise the vendor would see the same shipment twice. `Solicitud.items` keeps the original pedido, the linked despacho holds what shipped — that's how the UI shows "pidió vs envié".

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
