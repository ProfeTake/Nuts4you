# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ERP/POS system for **Nuts 4 You**, a Chilean confectionery and liquids retail chain with 5 branches (Mall Patio, Paseo, Open Plaza, Cugat Rengo, Cugat Baquedano) plus a central warehouse (bodega). The codebase is entirely in Spanish — models, routes, types, components, and variables all use Spanish naming.

Important scope rule: the **POS** module is not intended to issue receipts, invoices, or any other tax documents. Its purpose is to register internal sales, discount inventory in real time, and support the operational accounting flow of each shift, cash closing, and deposit control.

## Monorepo Structure

Two independent packages at the root — no workspace manager, each has its own `node_modules`:

- **`frontend/`** — React 19 + Vite 8 + TypeScript SPA
- **`backend/`** — Express 5 + Prisma + TypeScript REST API

## Development Commands

### Frontend (from `frontend/`)
```bash
npm run dev          # Vite dev server with HMR
npm run build        # tsc -b && vite build
npm run lint         # ESLint
```

### Backend (from `backend/`)
```bash
npm run dev          # nodemon + ts-node (watches src/)
npm run build        # tsc → dist/
npm run start        # node dist/servidor.js
npm run prisma:generate   # Generate Prisma client
npm run prisma:migrate    # Run migrations (dev)
npm run prisma:studio     # Open Prisma Studio GUI
```

### Environment Variables
- Backend: `PUERTO` (default 3001), `DATABASE_URL` (MySQL), `NODE_ENV`
- Frontend: `VITE_API_URL` (production backend URL; dev uses proxy to localhost:3001)

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
  - **POS layout** (`BarraLateral` wrapper) — for VENDEDOR/BODEGUERO roles: dashboard, inventory, sales history, cash closing, daily report. This module records internal sales and immediate stock discounts only; it does not handle receipt or tax-document issuance.
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

### Key Data Patterns
- All monetary values are **CLP integers** (Chilean pesos, no decimals)
- Dates display as `dd/MM/yyyy` with `America/Santiago` timezone
- Prisma schema uses Spanish field names matching the domain
- POS sales are operational records for stock and cash control, not fiscal sales documents

## Deployment
- Frontend: Docker multi-stage build (node:22-alpine → serve static), deployed on Railway
- Backend: Railway with MySQL plugin (provides `DATABASE_URL` automatically)
- Node.js >= 22.12.0 required
