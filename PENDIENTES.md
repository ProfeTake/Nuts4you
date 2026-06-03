# PENDIENTES — Nuts 4 You ERP/POS

Ruta de trabajo ordenada por prioridad. Cada fase desbloquea la siguiente.
_Última actualización: 2026-05-26_

---

## ✅ FASE 1 — Limpieza base (COMPLETADA 2026-04-29)
- [x] Iconos SVG → lucide-react, React Router real, Logout funcional, `formatearCLP` unificado

## ✅ FASE 2 — Mock data correcto + flujo POS (COMPLETADA 2026-04-30)
- [x] Categorías, productos, credenciales mock → datos reales del negocio
- [x] `useSesionPOS`, `useCajaStore`, stores Zustand, flujo apertura→dashboard→cierre

## ✅ FASE 3 — Backend Auth + Turno (COMPLETADA 2026-05-14)
- [x] `POST /api/auth/login` + `GET /api/auth/me` con JWT
- [x] `POST /api/pos/turnos` — abre turno, rechaza si PDV ya tiene uno abierto
- [x] `PATCH /api/pos/turnos/:id/cerrar` — cierra turno con datos del stock flow
- [x] `GET /api/pos/turnos/activo?pdvId=` — turno abierto del PDV
- [x] `POST/GET /api/pos/turnos/:id/retiros` — retiros de caja
- [x] `GET /api/inventario/:pdvId` + `PATCH` — stock por sucursal
- [x] Seed: roles, 6 sucursales, 15 productos + 9 usuarios reales (incluye las 7 vendedoras)
- [x] Schema Prisma sincronizado con BD local (XAMPP)
- ~~[ ] `POST /api/pos/ventas`~~ **OBSOLETO** — el negocio usa stock flow; la tabla `Venta` fue eliminada en normalización (2026-05-26)

## ✅ FASE 4 — Módulos Admin conectados a API (COMPLETADA 2026-05-14 → 2026-05-22)
- [x] **PanelAdmin** — KPIs, selector de mes, gráficos Recharts, resumen diario por sucursal
- [x] **ControlVentasSucursal** — PDV CRUD completo (crear/editar/activar/desactivar/eliminar)
- [x] **GestorInventario Bodega** — CRUD stock conectado a API, `POST/DELETE /bodega/stock`
- [x] **EscánerCodigos** — FAB + bottom sheet, escaneo EAN-13 (`@zxing`), generador + descarga PNG
- [x] **CatálogoCodigos** — 15 productos con EAN-13 prefijo Chile (780), imprimir catálogo
- [x] **DepositosFinanzas** — gestión de depósitos bancarios
- [x] **FormularioDespacho** — despacho de bodega a sucursales

## ✅ FASE 5 — Módulos RRHH + Usuarios (COMPLETADA 2026-05-22 → 2026-05-26)
- [x] **GestorUsuarios** — CRUD completo: crear/editar (incluyendo RUT)/desactivar/eliminar
- [x] Eliminación de usuario: preserva historial financiero (`usuario_id = null`), elimina planificación
- [x] Columna "Sucursal" en tabla Usuarios → muestra PDV del último turno real trabajado
- [x] **ModuloRRHH — Horarios de Personal**:
  - [x] Importar Excel (formato "Turnos Vendedoras 2026.xlsx") — parser adapado al formato real
  - [x] Plantilla Excel descargable (un PDV por columna, un día por fila)
  - [x] Entrada manual en calendario (clic en celda vacía → selector)
  - [x] Vista calendario mensual: planeado vs real, con indicadores de estado
  - [x] Generar automático: bloques de N días consecutivos por PDV, rotación continua entre meses
  - [x] Limpiar mes — elimina turnos planeados conservando los reales
  - [x] `TurnoPlaneado` model + endpoints CRUD + `limpiarHorariosMes`
- [x] **ModuloRRHH — Seguimiento de Vendedores**:
  - [x] KPIs mensuales: turnos, ventas, diferencias, faltantes
  - [x] Tarjeta por vendedor: por PDV breakdown, últimos 12 turnos
  - [x] `GET /api/rrhh/seguimiento?mes=` — agrega desde TurnoCaja real
- [x] Lenguaje neutro en todo RRHH (vendedor/a, no vendedora)
- [x] Admin/Supervisor puede operar como vendedor ("Operar en sucursal" → selector PDV → modo POS)
- [x] Vendedores sin PDV fijo → pantalla informativa, no bloqueante de login
- [x] Tab Horarios y Seguimiento integrados en ModuloRRHH con tabs carrusel

## ✅ NORMALIZACIÓN BD (COMPLETADA 2026-05-26)
- [x] Eliminadas tablas vacías contrarias al modelo stock flow: `Venta`, `VentaDetalle`, `PagoVenta`, enum `MetodoPago`
- [x] `usuario_id` nullable en `TurnoCaja`, `RetiroTurno`, `Solicitud` (preservar historial al eliminar usuario)
- [x] Índices en FK de alta consulta: `TurnoCaja`, `Inventario`, `MovimientoInv`, `Solicitud`, `TurnoPlaneado`, etc.
- [x] Nómina corregida: usa `total_calculado` directamente (antes fallaba con `ventas.reduce` = 0)
- [x] BD queda en **15 tablas**, todas en 3FN
- [x] `folio_sii` en TurnoCaja eliminado (Fase 6 obsoleta — cliente confirmó que POS no emite documentos tributarios)

---

## 🔴 FASE 6 — OBSOLETA (POS no emite documentos tributarios)
~~Boleta SII~~ — El módulo POS registra ventas internas únicamente. La tabla `Venta` y el campo `folio_sii` fueron eliminados en la normalización. Si en el futuro se integra con SII, requiere un módulo separado.

---

## 🟡 PENDIENTES CRÍTICOS (bloquean operación real)

### ✅ P1 — Gastos persistidos en BD (COMPLETADO 2026-05-27)
**Estado actual:** Los gastos (Art. Aseo, Líquidos comprados, Otros) y retiros que el vendedor registra en el POSDashboard se guardan solo en Zustand local. Al recargar la página se pierden. La BD tiene las tablas `GastoTurno` y `RetiroTurno` preparadas pero sin datos (0 registros).

**Lo que falta:**
- [ ] `POST /api/pos/turnos/:id/gastos` — guardar gasto en `GastoTurno`
- [ ] `GET /api/pos/turnos/:id/gastos` — cargar gastos del turno al recargar
- [ ] `DELETE /api/pos/turnos/:id/gastos/:gastoId` — eliminar gasto
- [ ] Conectar `POSDashboard.tsx` a estos endpoints vía TanStack Query (eliminar Zustand para gastos/retiros)
- [ ] Hacer lo mismo para retiros (endpoint de retiros ya existe: `POST /api/pos/turnos/:id/retiros`)

**Impacto:** Sin esto, cada recarga del navegador pierde el estado del turno.

---

### ✅ P2 — Inventario Bodega inicializado (COMPLETADO 2026-05-27)
**Estado actual:** El seed que inicializa los 15 productos en la tabla `Inventario` de la Bodega Central nunca corrió correctamente (el comando `npx prisma db seed` no ejecutaba el script TypeScript). La tabla tiene 0 registros.

**Lo que falta:**
- [ ] Correr manualmente el script de inventario:
  ```bash
  cd backend
  node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  async function main() {
    const bodega = await p.pDV.findFirst({ where: { nombre: 'Bodega Central' } });
    const prods  = await p.producto.findMany();
    for (const prod of prods) {
      await p.inventario.upsert({
        where: { pdv_id_producto_id: { pdv_id: bodega.id, producto_id: prod.id } },
        update: {},
        create: { pdv_id: bodega.id, producto_id: prod.id, stock_actual: 0, stock_critico: 0 },
      });
    }
    console.log('Inventario bodega: ' + prods.length + ' productos');
    await p.\$disconnect();
  }
  main().catch(console.error);
  "
  ```
- [ ] Corregir `package.json` para que `npx prisma db seed` funcione con ts-node en Windows

---

### ✅ P3 — Solicitudes end-to-end corregidas (COMPLETADO 2026-05-27)
**Estado actual:** El módulo `SolicitudesPDV.tsx` existe en el POS y el backend tiene endpoints, pero la integración UI↔API no está completa.

**Lo que falta:**
- [ ] Verificar que `SolicitudesPDV.tsx` consume correctamente `GET/POST /api/solicitudes`
- [ ] Vista admin de solicitudes pendientes en GestorInventario (ya existe `SolicitudesPendientes` pero necesita prueba end-to-end)
- [ ] Flujo completo: vendedor crea → bodeguero despacha → vendedor confirma

---

### P4 — RegistroDiario sin integración real
**Estado actual:** La tabla `RegistroDiario` tiene 0 registros. El código del reporte diario existe (`reporte.servicio.ts`) pero no hay evidencia de que se esté guardando data real desde el frontend.

**Lo que falta:**
- [ ] Revisar si `ReporteDiarioSucursal.tsx` está activo en alguna ruta del admin
- [ ] Decidir si mantener como JSON blob o estructurar como tabla normalizada
- [ ] Si se mantiene: conectar al cierre de caja para generar el registro automáticamente al cerrar turno

---

## 🟠 PENDIENTES IMPORTANTES (mejoran confiabilidad)

### P5 — POSDashboard sin conexión completa a backend
**Estado actual:** El turno se abre/cierra via API, pero el estado intermedio (stock ingresado, mezclas cocinadas, saldo) persiste solo en Zustand. Si el navegador se cierra a mitad de turno, se pierde el estado.

**Lo que falta:**
- [ ] Al abrir el POSDashboard: cargar datos del turno activo desde `GET /api/pos/turnos/activo`
- [ ] Al cerrar turno: enviar gastos y movimientos antes del `PATCH /api/pos/turnos/:id/cerrar`
- [ ] Reemplazar `useState` locales por `useQuery` + `useMutation` de TanStack Query

---

### P6 — Bonos configurables (hoy hardcoded)
**Estado actual:** Los umbrales de bonos están en `calculos.servicio.ts` como constante en código.

**Lo que falta:**
- [ ] Tabla `ConfigBono` en BD: `pdv_id`, `umbral_venta`, `monto_bono`, `activo`
- [ ] Admin puede editar umbrales desde panel (sin tocar código)
- [ ] `calcularBono` lee desde BD en lugar de constante

---

### P7 — Producción Railway
**Estado actual:** El sistema corre en desarrollo local. Railway tiene la infraestructura pero las variables de entorno de producción no están configuradas.

**Lo que falta:**
- [ ] Variables de entorno en Railway: `DATABASE_URL` (ya provisto por plugin MySQL), `JWT_SECRET`, `VITE_API_URL`
- [ ] Verificar que `railway.toml` del backend y Dockerfile del frontend estén actualizados post-normalización
- [ ] Generar `prisma migrate` formal para `migrate deploy` en producción (actualmente solo `db push`)
- [ ] Probar flujo completo en entorno Railway antes de entregar al cliente

---

## 🔵 PENDIENTES A FUTURO (cuando el cliente lo pida)

- [ ] **Buffer offline POS** — ventas/gastos en `localStorage` si no hay red, sincronizar al reconectar. Crítico para sucursales con internet intermitente.
- [ ] **Validaciones Zod en frontend** — formularios de apertura y cierre de caja sin validación client-side
- [ ] **Campo `teléfono`** en modelo Usuario — migración requerida
- [ ] **Tabla `ConfigBono`** configurable por admin (ver P6)
- [ ] **Tests de integración** — flujo login → apertura → cierre → reabrir
- [ ] **Importar Horarios con Excel de Sueldos** — el Excel "Sueldos Feb 2026.xlsx" tiene historial de turnos por sucursal; potencial fuente de datos históricos
- [ ] **Módulo de Horarios planificados** — calendario anual 2026 completo desde admin (el Excel ya está importado)
- [ ] **Conectar `MovimientoInv`** — la tabla existe pero los despachos de bodega no generan registros de movimiento (bodega.servicio.ts sí llama `movimientoInv.create` pero hay que verificar)

---

## 📊 Estado por módulo (2026-05-26)

| Módulo | Frontend | Backend | BD | Estado |
|---|---|---|---|---|
| Auth / Login | ✅ | ✅ | ✅ | Operativo |
| POS - Apertura turno | ✅ | ✅ | ✅ | Operativo |
| POS - Dashboard (stock) | ✅ | ⚠️ parcial | ⚠️ gastos/retiros sin persistir | **Incompleto** |
| POS - Cierre de caja | ✅ | ✅ | ⚠️ gastos no guardados | **Incompleto** |
| POS - Solicitudes | ✅ | ✅ | ✅ | Revisar end-to-end |
| Admin - Dashboard | ✅ | ✅ | ✅ | Operativo |
| Admin - Sucursales (PDV) | ✅ | ✅ | ✅ | Operativo |
| Admin - Bodega (stock) | ✅ | ✅ | ⚠️ inventario vacío | **Revisar seed** |
| Admin - Bodega (despachos) | ✅ | ✅ | ✅ | Operativo |
| Admin - Códigos de barras | ✅ | — | — | Operativo |
| Admin - Finanzas (depósitos) | ✅ | ✅ | ✅ | Operativo |
| Admin - RRHH Personal | ✅ | ✅ | ✅ | Operativo |
| Admin - RRHH Horarios | ✅ | ✅ | ✅ | Operativo |
| Admin - RRHH Seguimiento | ✅ | ✅ | ✅ | Operativo |
| Admin - RRHH Liquidaciones | ✅ | ✅ | ✅ | Operativo |
| Admin - Gestión Usuarios | ✅ | ✅ | ✅ | Operativo |
| Admin operar como vendedor | ✅ | ✅ | ✅ | Operativo |
| Producción Railway | ⚠️ | ⚠️ | ⚠️ | **Pendiente configurar** |
