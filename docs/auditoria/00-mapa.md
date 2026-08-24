# Fase 0 — Mapa del proyecto (auditoría READ-ONLY)

> ERP/POS de **Nuts 4 You** (confitería/líquidos, 5 sucursales + bodega central). Monorepo de 2 paquetes independientes, código íntegramente en español. POS **no** emite documentos tributarios; registra ventas internas y controla caja/stock por turno.

---

## 1. Stack

| Capa | Tecnología |
|------|-----------|
| **Backend** | Node ≥22.12, Express 5.2, TypeScript, Prisma 6.19 (MySQL), Zod 4, jsonwebtoken 9, bcryptjs 3, express-rate-limit 8, nodemailer 8 |
| **Frontend** | React 19.2 + Vite 8, React Router 7.14, Zustand 5, TanStack Query 5, Tailwind 4 + shadcn/ui, recharts 3, sonner, date-fns 4, xlsx, @zxing (escáner códigos), zod 4 |
| **Infra** | Railway (front Docker estático + back + MySQL plugin). Sin workspace manager: `frontend/` y `backend/` tienen su propio `node_modules` |

---

## 2. Estructura de carpetas

```
backend/src/
  servidor.ts            # entry: Express app, CORS, JSON limits, monta /api
  config/                # entorno.ts (dotenv), prisma.ts (cliente singleton)
  rutas/                 # 17 archivos *.rutas.ts + index.ts (registro central)
  middlewares/           # autenticar.ts (JWT+revocación), autorizar.ts (rol), manejarErrores.ts
  servicios/             # lógica de negocio (19 archivos) + shared/usuario.query.ts + __tests__/
  validaciones/          # 13 schemas Zod (uno por dominio)
  lib/                   # errores.ts (ErrorApp), tiempoChile.ts
  prisma/schema.prisma   # 26 modelos + 9 enums; seeds/seed.ts

frontend/src/
  main.tsx, App.tsx      # entry + routing/guards por rol
  paginas/               # 7 páginas POS (Login, AperturaTurno, POSDashboard, CierreCaja, ...)
  componentes/
    admin/               # 15 módulos admin (Gestor*, Control*, Modulo*, Panel*, ...)
    layout/              # BarraLateral, LayoutAdmin, ErrorBoundary, PanelNotificaciones
    bodega/ pos/         # escáner, catálogo, modal gasto
  components/ui/         # shadcn primitives
  hooks/                 # useAuth, useCarrito, useSesionPOS, useMenuAdmin, useTituloPagina
  store/                 # auth.store, caja.store (Zustand)
  lib/                   # api.ts (fetch+Bearer), money, dates, permisos, rut, gastos, demoFixtures
  tipos/                 # pos.tipos.ts, admin.tipos.ts
  validaciones/          # pos.schema.ts
```

---

## 3. Backend — capas y flujo

**Cadena de request:** `servidor.ts` → `/api` → `rutas/index.ts` → `*.rutas.ts` → `autenticar` → `autorizar(...)` → validación Zod → `servicios/*` → Prisma.

- **Entry** [servidor.ts](backend/src/servidor.ts): CORS falla-seguro en prod (exige `FRONTEND_URL`), body-parser 100kb global + **6mb solo** para `/api/solicitudes-gasto` (fotos base64). `manejarErrores` al final.
- **Registro de rutas** [index.ts](backend/src/rutas/index.ts): 17 routers montados. Prefijos: `/salud /auth /pos /inventario /admin /finanzas /bodega /rrhh /usuarios /solicitudes /notificaciones /proveedores /cierres-preventivos /config-bonos /preparaciones /solicitudes-gasto`.
- **Auth** [autenticar.ts](backend/src/middlewares/autenticar.ts:23): verifica JWT (8h, stateless) y **revalida contra BD en cada request** (activo + rol) → revocación efectiva. Bloqueo de cuentas **demo** (`esDemo`) fuera de `/api/auth/*`. El rol del token se **sobrescribe** con el de la BD.
- **Authz** [autorizar.ts](backend/src/middlewares/autorizar.ts:9): `autorizar(...roles)` compara `req.usuario.rol` contra lista blanca. Debe ir después de `autenticar`.
- **Errores** [errores.ts](backend/src/lib/errores.ts) + `manejarErrores.ts`: `ErrorApp(status, msg)`.

**Patrón de aplicación de auth (inconsistente — a verificar en Fase 2):**
- `rrhh.rutas` y `usuarios.rutas`: `router.use(autenticar, autorizar(...))` global.
- `notificaciones.rutas`: `router.use(autenticar)` sin `autorizar` (scope por `usuario.id`).
- La mayoría (`pos`, `bodega`, `admin`, `proveedores`, ...): `autenticar` + `autorizar()` **por endpoint** → riesgo de olvido puntual.
- `inventario.rutas` GET: `autenticar` + **scope manual** (VENDEDOR solo su `pdvId`), sin `autorizar()`.

---

## 4. Frontend — routing, estado, API

- **Guards en [App.tsx](frontend/src/App.tsx:150)** (client-side, NO seguridad real):
  - No autenticado → `/login`.
  - VENDEDOR/BODEGUERO sin PDV → pantalla `SinPDVAsignado`.
  - ADMIN/SUPERVISOR → `LayoutAdminConRutas` (`/admin/*`); pueden entrar a "modo POS" (`modoPos`) y operar como vendedor.
  - VENDEDOR/BODEGUERO → `LayoutPOS` (`/pos/*`): sin turno → wizard `AperturaTurno`; con turno → `BarraLateral` + rutas.
- **Rutas admin:** `sucursales, cierre-preventivo, preparacion, gastos, bodega, finanzas, facturas, personal, usuarios`.
- **Rutas POS:** `index (dashboard), solicitudes, registro-diario`.
- **Permisos front** [permisos.ts](frontend/src/lib/permisos.ts): matriz `Rol × Módulo × Acción` (`ver/crear/editar/eliminar`). **Independiente** de la lista de roles del backend `autorizar()` → posible divergencia (Fase 2).
- **API client** [api.ts](frontend/src/lib/api.ts): fetch + Bearer, helpers `apiGet/Post/Patch/Delete`.
- **Estado:** Zustand (`auth.store`, `caja.store`) + hooks. Ventas del turno viven solo en el navegador (offline-first); no hay modelo `Venta` en backend.
- **Modo demo** [demoFixtures.ts](frontend/src/lib/demoFixtures.ts): datos ficticios en navegador; token demo bloqueado en backend.

---

## 5. Módulos (backend ↔ frontend)

| Dominio | Ruta API | Servicio backend | UI principal |
|---------|----------|------------------|--------------|
| Auth | `/auth` | auth.servicio (101) | Login.tsx |
| POS/Turnos/Caja | `/pos` | pos.servicio (246) | POSDashboard, CierreCaja, AperturaTurno |
| Inventario PDV | `/inventario` | inventario.servicio (47) | InventarioPDV, GestorInventario |
| Bodega/Despachos | `/bodega` | **bodega.servicio (618)** | GestorInventario, FormularioDespacho |
| Solicitudes (pedidos) | `/solicitudes` | solicitudes.servicio (130) | SolicitudesPDV |
| Solicitudes de gasto | `/solicitudes-gasto` | gastoAutorizacion.servicio (193) | ModalSolicitarGasto, AutorizarGastos |
| Preparación turno | `/preparaciones` | preparacion.servicio (283) | PreparacionSiguienteTurno |
| Cierre preventivo | `/cierres-preventivos` | cierrePreventivo.servicio (131) | GestorCierrePreventivo |
| Finanzas/Depósitos | `/finanzas` | finanzas.servicio (68) | DepositosFinanzas |
| Proveedores/Facturas | `/proveedores` | proveedores.servicio (197) | GestorFacturas |
| RRHH/Horarios/Pagos | `/rrhh` | **rrhh.servicio (506)** | ModuloRRHH, HorariosVendedoras |
| Config bonos | `/config-bonos` | configBono.servicio (114) + calculos.servicio (105) | ConfigBonos |
| Admin/Reportes | `/admin` | **admin.servicio (372)** | PanelAdmin, ControlVentasSucursal, ReporteDiarioSucursal |
| Usuarios | `/usuarios` | usuarios.servicio (166) | GestorUsuarios |
| Notificaciones | `/notificaciones` | notificaciones.servicio (27) | PanelNotificaciones |

---

## 6. Máquinas de estado declaradas (a reconstruir en Fase 1)

Enums en `schema.prisma`:

- **TurnoCaja** `EstadoTurno`: `ABIERTO → CERRADO` (cierre = transacción turno+depósito+inventario; validación de coherencia 422).
- **Solicitud** (pedido) `EstadoSolicitud`: `PENDIENTE → DESPACHADA → CONFIRMADA`. **No mueve stock** (solo estado).
- **Despacho** `EstadoDespacho`: `ENVIADO → CONFIRMADO`. **Único flujo que mueve stock** (bodega→PDV, transaccional, agrupado por `lote_id`). Stock se suma al despachar, no al confirmar.
- **PreparacionTurno** `EstadoPreparacion`: `PENDIENTE → CONFIRMADA` / `ANULADA` (reserva/devuelve stock en bodega).
- **SolicitudGasto** `EstadoGasto`: `PENDIENTE → APROBADO` (crea `GastoTurno`) / `RECHAZADO`.
- **Deposito** `EstadoDeposito`: `PENDIENTE / CONFIRMADO / TRANSFERENCIA`.
- **FacturaProveedor** `EstadoFactura`: `PENDIENTE → PAGADA / ANULADA`.
- **MovimientoInv** `TipoMovimiento`: `INGRESO / TRASPASO / VENTA / MERMA`.

⚠️ **Doble paso deliberado** (documentado en CLAUDE.md): Solicitud (estado) y Despacho (stock) son pasos separados; si se juntan sin quitar uno, el stock se contabiliza doble. Punto crítico de Fase 1.

---

## 7. Roles y permisos (resumen; detalle en Fase 2)

- **4 roles**, definidos en 3 lugares distintos (posible fuente de divergencia):
  1. **BD**: tabla `Rol` sembrada en [seed.ts:23](backend/prisma/seeds/seed.ts) → `ADMIN, SUPERVISOR, BODEGUERO, VENDEDOR`.
  2. **Backend**: strings literales en `autorizar('ADMIN', ...)` repartidos por los `*.rutas.ts`.
  3. **Frontend**: matriz en `permisos.ts` + guards en `App.tsx`.
- No hay enum de rol en el schema (es tabla + string libre) → `autorizar()` usa strings mágicos sin type-safety.

---

## 8. 🔥 ZONAS CALIENTES (leer a fondo en fases siguientes)

Ordenadas por concentración de lógica de negocio / riesgo:

| # | Archivo | Por qué |
|---|---------|---------|
| 1 | [bodega.servicio.ts](backend/src/servicios/bodega.servicio.ts) (618) | Único flujo que mueve stock; despachos transaccionales por lote. Máximo riesgo de race/doble-conteo. |
| 2 | [pos.servicio.ts](backend/src/servicios/pos.servicio.ts) (246) | Cierre de turno (turno+depósito+inventario en 1 tx), validación de coherencia de caja. |
| 3 | [rrhh.servicio.ts](backend/src/servicios/rrhh.servicio.ts) (506) | Horarios, pagos, bonos; mayor servicio, lógica de cálculo pesada. |
| 4 | [admin.servicio.ts](backend/src/servicios/admin.servicio.ts) (372) | Reportes agregados y control de ventas por sucursal. |
| 5 | [solicitudes.servicio.ts](backend/src/servicios/solicitudes.servicio.ts) (130) | Estado del pedido; frontera con despacho (doble paso). |
| 6 | [preparacion.servicio.ts](backend/src/servicios/preparacion.servicio.ts) (283) | Reserva/devolución de stock por estado; interactúa con bodega. |
| 7 | [gastoAutorizacion.servicio.ts](backend/src/servicios/gastoAutorizacion.servicio.ts) (193) | Aprobación crea `GastoTurno`; idempotencia al aprobar. |
| 8 | [cierrePreventivo.servicio.ts](backend/src/servicios/cierrePreventivo.servicio.ts) (131) | Checklist/estado de cierre; solapamiento posible con cierre de caja. |
| 9 | [autenticar.ts](backend/src/middlewares/autenticar.ts) + [autorizar.ts](backend/src/middlewares/autorizar.ts) | Núcleo de seguridad; revocación por BD, bloqueo demo. |
| 10 | [permisos.ts](frontend/src/lib/permisos.ts) + [App.tsx](frontend/src/App.tsx) | Matriz de permisos y guards; contrastar con backend. |
| 11 | [calculos.servicio.ts](backend/src/servicios/calculos.servicio.ts) + [configBono.servicio.ts](backend/src/servicios/configBono.servicio.ts) | Cálculo de bonos configurables; único servicio con tests. |
| 12 | [finanzas.servicio.ts](backend/src/servicios/finanzas.servicio.ts) (68) | Depósitos/confirmación; frontera con cierre de turno. |
| 13 | Rutas con authz por-endpoint: [pos.rutas.ts](backend/src/rutas/pos.rutas.ts), [bodega.rutas.ts](backend/src/rutas/bodega.rutas.ts), [admin.rutas.ts](backend/src/rutas/admin.rutas.ts) | Mayor superficie de olvido de `autorizar()`. |
| 14 | [usuarios.servicio.ts](backend/src/servicios/usuarios.servicio.ts) (166) | Alta/edición de usuarios y roles → escalada de privilegio. |

**Front (solo si Fase 3 lo exige, por tamaño):** `HorariosVendedoras.tsx` (2004), `GestorInventario.tsx` (1565), `ControlVentasSucursal.tsx` (1382), `ModuloRRHH.tsx` (1143), `GestorFacturas.tsx` (1133) — candidatos a duplicación de lógica de negocio en cliente.

---

## Notas de método
- Todo lo anterior se derivó de listados, imports, grep de `autorizar()`/enums y lectura selectiva de entry-points y middlewares. **No** se leyeron servicios completos aún (se hará en las zonas calientes).
- Lo que **no puede** determinarse sin ejecutar el sistema (p. ej. comportamiento real de transacciones concurrentes, contenido de migraciones vs. schema) se marcará explícitamente en cada fase.

---

**FASE 0 COMPLETA.** Esperando tu **"continúa"** para iniciar la Fase 1 (flujos de tareas / máquinas de estado reales).
