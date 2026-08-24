# ESTADO — Ejecución del plan de auditoría

> Bitácora viva de la ejecución del backlog de `04-plan.md`.
> Fuente del backlog: `docs/auditoria/04-plan.md`. Detalle de hallazgos: `01-flujos.md`, `02-permisos.md`, `03-redundancia.md`, `05-conexiones.md`.

**Última actualización:** 2026-07-24 — agregada Fase 5 (`05-conexiones.md`, hallazgos C1-C21 + backlog A24-A44 en `04-plan.md`). Nada de esta fase está ejecutado todavía (solo documentado).

> ⚠️ **Modo sin commits (decisión del usuario):** no se commitea ni se hace push hasta que el usuario pruebe todo en local y decida subir a GitHub/Railway. Todos los cambios de abajo están en el **working tree**, sin commitear. (Nota: un commit local NO despliega en Railway; solo `git push` lo hace.) Los 4 commits de una sesión previa se deshicieron con `reset --mixed 12bf4a5`; nada se perdió.

---

## COMPLETADOS (en working tree, verificados con tests + tsc, sin commitear)

- [x] **A1** — Turno ABIERTO al aprobar gasto (H3) — `resolverGasto` revalida turno ABIERTO en la tx; 409 si cerrado. Test: `servicios/__tests__/gastoAutorizacion.servicio.test.ts` (4).
- [x] **A2** — Bypass ADMIN/SUP en `confirmarSolicitud` (H1) — override para desatascar DESPACHADA; BODEGUERO sin bypass. Test: `servicios/__tests__/solicitudes.servicio.test.ts` (6).
- [x] **A3** — ~~`autorizar` en GET `/admin/registro-diario` (P3)~~ **OBSOLETO:** el módulo Registro Diario se eliminó por completo (ver "TRABAJOS FUERA DEL BACKLOG"), así que el endpoint ya no existe y P3 deja de aplicar. El test de política general de `autorizar` se mantiene.
- [x] **A4** — Guarda "último admin" en `editarUsuario`/`cambiarEstadoUsuario` (P4) — no degradar rol ni desactivar al único admin activo. Test: `servicios/__tests__/usuarios.servicio.test.ts` (8).
- [x] **A7** — Scope de PDV en `getTurnoActivo` (P6) — no-admin solo ve su turno o el de su PDV. Test: `servicios/__tests__/pos.turnoActivo.test.ts` (5).
- [x] **A6** — Adopción de `tiempoChile.ts` en admin.rutas / cierrePreventivo / rrhh (R4) — 6 sitios de rango pasan de offset fijo `-04:00` a `rangoFechaChile`/`rangoMesChile`/`fechaHoyChile` (DST-aware). **+ fix de raíz** en `tiempoChile.ts`: el offset se redondea a minuto entero (`Math.round`) — antes el borde `fin` `.999` se pasaba a la medianoche siguiente (afectaba también a `bodega.servicio` y `admin.servicio`, que ya usaban los helpers). Tests: `lib/__tests__/tiempoChile.test.ts` + `servicios/__tests__/rrhh.fechas.test.ts` (9).
- [x] **A5** — Ocultar RRHH/Nómina/sueldos a SUPERVISOR (D1/P1) — `rrhh.rutas.ts` pasa de `autorizar('ADMIN','SUPERVISOR')` a solo `'ADMIN'` (todo RRHH: personal/sueldos, nómina, horarios, seguimiento). Facturas/Proveedores sin cambio (ya permitía SUPERVISOR). Menú front: se agrega "Facturas" a `ITEMS_SUPERVISOR`. Tests de política en `middlewares/__tests__/autorizar.test.ts`.
- [x] **A13 (parte H12)** — Acceso a turno por **dueño exacto** (DP-H12) — `getTurnoConAcceso` (`pos.servicio.ts`) deja de aceptar el OR laxo (mismo PDV): un no-admin solo opera su propio turno; ADMIN/SUP cualquiera. Cierra la fuga de gastos/lecturas entre vendedores del mismo PDV. Test: `servicios/__tests__/pos.accesoTurno.test.ts` (5). **Pendiente de A13:** extracción `scope.ts` (R2) y decidir si `getTurnoActivo` (A7) también pasa a dueño exacto por consistencia — ver HALLAZGOS.
- [x] **A10** — `monto_retiro` informativo + **alerta** (DP-A10/H11) — `registrarCierrePreventivo` NO auto-genera RetiroTurno (cero doble conteo); si el retiro declarado supera al `RetiroTurno` registrado en el turno abierto del PDV, devuelve `alertaRetiro` (montos) y loguea. Frontend: `GestorCierrePreventivo` muestra toast de advertencia. Test: `servicios/__tests__/cierrePreventivo.servicio.test.ts` (4).

**Estado de verificación global:** backend `npx vitest run src` → **10 archivos, 67 tests verdes**; `tsc --noEmit` limpio. Frontend `tsc -b` + lint (POSDashboard, LayoutAdmin, GestorCierrePreventivo, admin.tipos) limpios.

### Archivos tocados (working tree)
- `backend/src/lib/tiempoChile.ts` (fix offset)
- `backend/src/rutas/admin.rutas.ts` (A3, A6)
- `backend/src/rutas/pos.rutas.ts` (A7)
- `backend/src/rutas/solicitudes.rutas.ts` (A2)
- `backend/src/servicios/gastoAutorizacion.servicio.ts` (A1) — nuevo/untracked
- `backend/src/servicios/solicitudes.servicio.ts` (A2)
- `backend/src/servicios/usuarios.servicio.ts` (A4)
- `backend/src/servicios/pos.servicio.ts` (A7)
- `backend/src/servicios/cierrePreventivo.servicio.ts` (A6)
- `backend/src/servicios/rrhh.servicio.ts` (A6)
- 6 archivos de test nuevos (`__tests__/`)

---

## BLOQUEADOS — requieren decisión de producto (no ejecutar a ciegas)

- **A8** (D3) — Máquina de estados de Depósito/Factura: falta la política de transiciones válidas. → **D3**.
- **A15** (D4) — Fusión Solicitud↔Despacho: semántica + migración. → **D4**.
- **A20** (D2) — UI del rol BODEGUERO: existe/no la pantalla; además es trabajo de frontend. → **D2**.

## SUB-ÍTEMS PENDIENTES (sin decisión, refactor acotado)

- **A13 (parte R2)** — Extraer `middlewares/scope.ts` (`esAutorizador`/`assertAccesoTurno`) y adoptarlo en pos/gastoAutorizacion/bodega (dedup, behavior-preserving). El fix de seguridad (H12) ya está hecho; esto es solo modularidad.
- **Consistencia getTurnoActivo** — decidir si `getTurnoActivo` (A7) también pasa a **dueño exacto** como `getTurnoConAcceso` (hoy sigue con OR mismo-PDV, ver HALLAZGOS).

## BLOQUEADOS — requieren migración (solo generar script, nunca ejecutar; BD local con drift)

- **A16** (H2) índice único parcial turno ABIERTO · **A18** (H9) enum CANCELADA · **A21** (H10) enum ANULADO · **A14** (P7) solo si Rol→enum.

## PENDIENTES mayores (ola 3-4, no quick wins)

- **A9** (R3) extraer `dominio/stock.servicio` — keystone; el plan exige tests de integración de stock ANTES (concurrencia/no-negativo/reserva). Alto riesgo (dinero/inventario). No tocar sin esos tests.
- **A19/A22** dependen de A9. **A11** (adoptar `formatearCLP`, 165 sitios front) y **A12** (`lib/http.ts`) = refactores amplios mecánicos, sin tests de frontend. **A17/A23** backlog.

---

## HALLAZGOS NUEVOS (fuera de alcance, anotados al pasar)

- **[bug corregido en A6]** `tiempoChile.deHoraChileAUtc` producía offset fraccionario (ms) → el borde `fin` del día/mes se pasaba a la medianoche siguiente. Corregido con `Math.round`. Beneficia a `bodega.servicio` y `admin.servicio` que ya lo usaban.
- **[R4 residual]** Quedan ~12 sitios que formatean fechas de salida con `toISOString().slice(0,10)` / `.split('T')[0]` (rrhh 134/199/212/418, finanzas 38-39, proveedores 85-86, preparacion 42). Formatean en UTC un timestamp chileno → pueden mostrar el día equivocado cerca de medianoche. Fix requiere un helper nuevo `formatearFechaChile(date)` en `tiempoChile.ts` (no existe). Separado del scope de bordes de A6.
- **[test infra]** `npm test` (sin filtro) recoge los `.js` compilados de `dist/servicios/__tests__/` y falla al cargarlos como CommonJS. Workaround: `npx vitest run src`. Fix: excluir `dist/` en la config de vitest o limpiar `dist/`.
- **[consistencia getTurnoActivo]** Tras A13, `getTurnoConAcceso` es dueño-exacto pero `getTurnoActivo` (A7) sigue con OR mismo-PDV. Decidir si unificar a dueño-exacto (es un endpoint PDV-scoped, menos sensible: solo id/apertura/saldoInicial). Sub-ítem pendiente.
- **[working tree]** El repo arrancó con ~50 archivos modificados sin commitear (feature "modo demo" y otros). Al no commitear, conviven con los cambios de la auditoría.

---

## DECISIONES DEL USUARIO

**Resueltas y ejecutadas (2026-07-22):**
- ✅ **D1 → A5: HECHO** (ver COMPLETADOS).
- ✅ **DP-H12 → A13: fix H12 HECHO** (ver COMPLETADOS). Queda la extracción `scope.ts` (R2) como sub-ítem.
- ✅ **DP-A10 → A10: HECHO** (ver COMPLETADOS).

**Pendientes:**
- **D2** — ¿Existe la UI del rol BODEGUERO o se reasignan sus permisos? (→ A20)
- **D3** — Transiciones válidas de Depósito y Factura. (→ A8)
- **D4** — ¿Confirmar solicitud debe mover stock (fusión)? (→ A15)

## TRABAJOS FUERA DEL BACKLOG DE AUDITORÍA (working tree, sin commitear)

- **Aviso de solicitudes de gasto para admin/supervisor** — pedido del usuario. Diagnóstico: el flujo YA estaba cableado (backend `/api/solicitudes-gasto` montado; front `/admin/gastos` → `AutorizarGastos` con menú en ambos roles), PERO el layout admin no tenía ningún indicador → nada avisaba de solicitudes nuevas. Agregado un **badge de pendientes** en el ítem "Gastos" del sidebar ([LayoutAdmin.tsx](frontend/src/componentes/admin/LayoutAdmin.tsx)) que consulta `/solicitudes-gasto/pendientes/contar` cada 20s (deshabilitado en demo). Verificado con `tsc -b` + lint limpios. **Pendiente opcional:** en modo demo `/solicitudes-gasto*` no está en `demoFixtures.ts` (la pantalla Gastos quedaría vacía al demostrar); y se podría agregar el `PanelNotificaciones` (campana) al layout admin para ver todas las notificaciones, no solo gastos.
- **Eliminación del módulo "Registro Diario" (vendedor)** — pedido del usuario (redundante: el turno activo ya entrega los datos a admin/supervisor). Removido: front (ruta `/pos/registro-diario` en `App.tsx`, ítem+mapa+icono en `BarraLateral.tsx`, `"registro-diario"` de `PaginaVendedor`, export en `admin/index.ts`, componente `ReporteDiarioSucursal.tsx` borrado) y back (rutas POST/GET `/admin/registro-diario` + schema + import en `admin.rutas.ts`, `reporte.servicio.ts` borrado, comentarios stale). Deja **A3 obsoleto**. Verificado: backend 63 tests + tsc; frontend tsc + lint limpios. **Pendiente de limpieza (no bloqueante):** el modelo Prisma `RegistroDiario` (schema.prisma:240 + relación en PDV) queda huérfano — borrarlo exige **migración** (no ejecutada); y el tipo `RegistroDiario` + `crearRegistroVacio` en el front quedan muertos pero inertes (exportados).
- **Conversión mezcla→paquetes en el cierre (POSDashboard)** — pedido del usuario. En [POSDashboard.tsx](frontend/src/paginas/POSDashboard.tsx): las mezclas consumidas (`disp − saldo final`) producen paquetes (`×factor`, `MEZCLA_A_PAQ`) que se **suman al disponible del paquete**; `vendidos` de paquetes = (stock vivo + producción) − saldo final. Las tarjetas de mezcla muestran las **mezclas consumidas** con el badge **"cocinadas"** (los paquetes producidos van al contador de la sección Paquetes, no al de la mezcla). `stockFinal` persiste igual (remanente por producto, sin doble conteo); backend intacto. Verificado con `tsc -b` + lint limpios (no hay tests de frontend). Falta prueba manual del usuario.

## DIRECCIÓN ACTUAL

▶️ **2026-07-22:** ejecutados todos los ítems del backlog que no requieren nuevas decisiones ni migración: **A1–A7, A5, A13(H12), A10** (9 ítems) + el fix de `tiempoChile` + la feature de mezclas fuera de backlog. Backend 67 tests verdes, frontend tsc+lint limpios. **Nada commiteado** (working tree).

**Para retomar hace falta:** (a) decisiones **D2/D3/D4** (desbloquean A20/A8/A15); (b) los sub-ítems sin decisión: extracción `scope.ts` (R2) y consistencia de `getTurnoActivo`; (c) los ítems con **migración** (A16/A18/A21) y el **keystone A9** (stock), que necesitan ventana y tests de integración. Todo lo demás del plan es refactor amplio (A11/A12/A23).

---

## FASE 5 — Conexiones de negocio (2026-07-24)

Auditoría dirigida pedida por el usuario ("muchos módulos no se están comunicando bien"), con foco distinto a las Fases 1-3: no máquinas de estado ni permisos, sino operaciones que cambian dinero/stock sin dejar rastro, o pantallas que muestran datos que el backend nunca calculó. **21 hallazgos (C1-C21)** documentados en `05-conexiones.md`, con backlog **A24-A44** agregado a `04-plan.md` (10 Alto · 7 Medio · 4 Bajo; 13 son quick wins sin migración).

**Confirmados con lectura directa de código de ambos lados** (no inferidos): saldo inicial de caja no hereda el cierre anterior del mismo PDV (C1, 🧭 D5); "a depositar" mezcla efectivo con tarjeta/transferencia y la función correcta `calcularADepositar` nunca se usa (C2); la confirmación de recepción del admin no genera ningún registro de pago y Nómina ignora `recepcion_confirmada` (C3, 🧭 D6); el cierre de turno y el ajuste manual de stock en bodega no dejan `HistorialInventario` (C4, C5); "Marcar Depositado" no captura el monto real (C9); notas del cierre preventivo dirigidas al vendedor quedan en rutas ADMIN/SUPERVISOR-only (C11); `resolverPDVHoy` calcula "hoy" en UTC en vez de hora de Chile y no filtra `publicado` (C17, C18 — corre en cada login/me); desactivar un vendedor con turno abierto lo deja huérfano sin forma de cerrarlo (C19). El resto (C6-C8, C10, C12-C16, C20-C21) son de severidad media/baja: enum `MERMA` muerto, campo `costo` sin reporte de margen, dashboard con sección "venta por categoría" siempre vacía sin guarda, vendedor sin historial propio de diferencias de caja, notificaciones para admin/supervisor que nunca se muestran, entre otros.

**Estado:** solo documentado, nada ejecutado (working tree limpio de esta fase salvo los 3 archivos `.md`). Quedan pendientes **D5** y **D6** (decisiones de producto) antes de A31/A39; el resto de los quick wins (A24-A30, A32-A34, A41, A44) no tiene decisiones bloqueantes.

---

## COMPLETADOS FASE 5 (2026-07-24, working tree, verificados con tsc + tests, sin commitear)

Ejecutados los 12 quick wins sin decisión bloqueante (A31 queda diferido: depende de **D5**).

- [x] **A25 (C17) + A26 (C18)** — `resolverPDVHoy` (`auth.servicio.ts`) pasa de "hoy" en UTC a `rangoFechaChile(fechaHoyChile())` (mata la ventana horaria ~20:00–23:59 que resolvía el PDV de mañana) y filtra `publicado: true` (un borrador de la grilla ya no cambia la sucursal). Corre en cada login y `/auth/me`.
- [x] **A24 (C2)** — Depósito del cierre (`cerrarTurno`, `pos.servicio.ts`) deja de mezclar tarjeta/transferencia: `monto_teorico = efectivoContado + retirosBD` (solo efectivo físico; misma fórmula que el frontend en `CierreCaja`/`POSDashboard`), `monto_real = 0` (nada depositado aún). ⚠️ **Desvío del plan:** NO se usó `calcularADepositar` — su fórmula (`efectivo − gastos − retiros`) es incorrecta para este negocio (resta retiros que deben sumarse; por eso nunca se usó). Ese helper sigue muerto; evaluar borrarlo o corregir su contrato.
- [x] **A30 (C4)** — Cierre de turno registra `HistorialInventario` por producto conciliado (delta, agrupado en un lote, con snapshot de nombre + usuario), dentro de la misma tx. La operación de stock más frecuente ya no es invisible en la pestaña Historial.
- [x] **A28 (C5)** — `ajustarStock` (bodega) ahora corre en tx y registra `HistorialInventario` del delta (quién/cuándo/cuánto). Se agregó el usuario a la firma (`ajustarStock(id, data, {id,nombre,rol})`) y su caller en `bodega.rutas.ts`.
- [x] **A29 (C9)** — "Marcar Depositado" exige el monto real: modal nuevo en `DepositosFinanzas.tsx` (input pre-cargado con el teórico) que envía `montoReal`; `actualizarDeposito` (`finanzas.servicio.ts`) rechaza (400) si falta en vez de copiar el teórico. `faltaDepositar` = teórico − real.
- [x] **A32 (C11)** — Nueva ruta `GET /cierres-preventivos/nota-vendedor` (scoped: el vendedor lee la de su PDV; admin/sup con `?pdvId=`) + `getNotaVendedorVigente`. El vendedor ve la "Tarea para ti" en un banner de `POSDashboard.tsx`.
- [x] **A33 (C12)** — `mapearFactura` incluye banco/tipo_cuenta/numero_cuenta del proveedor (`PROVEEDOR_FACTURA_SELECT`); `GestorFacturas.tsx` los muestra en el detalle de la factura ("Datos para transferir"). Tipo `FacturaProveedor` + demo actualizados.
- [x] **A34 (C20)** — `PanelNotificaciones` montado en `LayoutAdmin.tsx` (campana en branding desktop `hidden lg:block` + header móvil). Admin/supervisor ven al fin las notificaciones que ya se creaban para ellos.
- [x] **A27 (C14)** — Guarda de "sin datos" en "Venta del mes por categoría" (`PanelAdmin.tsx`): con `ventaPorCategoria` vacío muestra un texto explicativo en vez de un encabezado con nada debajo.
- [x] **A41 (C21)** — `formatearUsuario` (`usuarios.servicio.ts`) devuelve `esDemo`; `GestorUsuarios.tsx` muestra un badge "DEMO" junto al nombre. (Demo mode no repuebla el campo; badge solo en producción.)
- [x] **A44 (C8)** — Eliminado el endpoint muerto `PATCH /inventario/:pdvId` (sin UI): removidos ruta, `actualizarInventario` (servicio) y `inventario.schema.ts`. El stock de PDV se maneja por cierre de turno y despachos.

**Verificación:** backend `npx vitest run src` → **10 archivos, 63 tests verdes**; `tsc --noEmit` limpio. Frontend `tsc -b` limpio; `eslint` limpio en los 8 archivos tocados (los warnings/errores globales de `ConfigBonos.tsx`/`GestorInventario.tsx` son preexistentes, no de esta tanda).

**Notas / seguimiento:**
- **A31 (C1)** NO ejecutado: requiere decidir **D5** (fórmula del saldo inicial heredado). El resto de bloqueados por decisión sigue igual (A8/D3, A15/D4, A20/D2, A39/D6).
- **Sin migración:** ninguna de estas escrituras toca el esquema (usan tablas/campos existentes: `HistorialInventario`, `TurnoPlaneado.publicado`, `Usuario.es_demo`).
- **Falta prueba manual del usuario** (no hay tests de frontend): flujo de depósitos con monto real, banner de nota al vendedor, campana en el panel admin, y que el historial de cierre aparezca en la pestaña Historial de bodega.

---

## COMPLETADOS FASE 5 — TANDA 2 (2026-07-27, working tree, sin commitear)

Ítems de esfuerzo medio del backlog 1bis que no requieren decisión de producto: **A35-A38, A40** + fix de infra de tests. Con esto, de la Fase 5 solo quedan los bloqueados por decisión (A31/D5, A39/D6) y los que piden evaluar interés (A42 margen, A43 neto consolidado).

- [x] **A35 (C19)** — Guarda de turno ABIERTO al desactivar **y también al eliminar** usuario (`usuarios.servicio.ts`): 409 con turno y sucursal en el mensaje. Antes, desactivar a un vendedor con turno abierto lo dejaba huérfano (sesión revocada al instante, turno imposible de cerrar, PDV bloqueado para abrir otro). Tests: +5 en `usuarios.servicio.test.ts` (13 en total).
- [x] **A36 (C15)** — `GET /pos/turnos/mios` (`getMisTurnos`, scope implícito por token: solo turnos propios CERRADOS) + página nueva **"Mis Cierres"** en el layout POS ([MisCierres.tsx](frontend/src/paginas/MisCierres.tsx), ruta `/pos/mis-cierres`, ítem en `BarraLateral`): cada cierre con venta total, efectivo declarado, estado de recepción y chip de diferencia (sobrante/faltante/cuadrado) + resumen acumulado. Cierra la asimetría: la vendedora ve el mismo dato que afecta su nómina.
- [x] **A37 (C16)** — Grilla de horarios (`HorariosVendedoras.tsx`): tercer estado visual **"No llegó"** (badge rojo + X) cuando la fecha ya pasó y hay planeado sin turno real; se agregó a la leyenda. El corte pasado/futuro usa `fechaHoyChile()` (helper local espejo del backend, no la zona del navegador). Antes un no-show se veía idéntico a un turno de la próxima semana.
- [x] **A38 (C10)** — El diálogo de confirmación de depósitos (de A29) ahora permite elegir **Depósito o Transferencia**: envía `estado: CONFIRMADO | TRANSFERENCIA` con el monto real. El estado `TRANSFERENCIA` (badge+filtro sin ninguna acción que lo alcanzara) queda conectado. Handler demo actualizado para respetar `montoReal`/`estado`.
- [x] **A40 (C6)** — Flujo explícito de **MERMA**: `POST /bodega/stock/:inventarioId/merma` (`registrarMerma` + `mermaSchema` con motivo obligatorio) — tx: descuenta stock (no-negativo), crea `MovimientoInv` tipo `MERMA` (enum que existía sin uso alguno) y `HistorialInventario`. **Limitación aceptada:** ni `MovimientoInv` ni `HistorialInventario` tienen columna motivo (agregar una = migración), así que el motivo viaja en el snapshot `nombre` ("Producto — MERMA: vencido"), visible en la pestaña Historial. UI: sección "Registrar merma" (cantidad+motivo) dentro del diálogo Ajustar Stock de `GestorInventario.tsx`.
- [x] **[test infra]** — `backend/vitest.config.ts` nuevo con `include: ['src/**/*.test.ts']`: `npm test` sin filtro ya no recoge los `.js` compilados de `dist/` (workaround `npx vitest run src` ya no es necesario).
- [x] **[lint drive-by]** — `abrirEditar` en `GestorInventario.tsx` pasó de `useCallback` con deps manuales rotas a función plana (patrón ya adoptado en el mismo archivo para React Compiler): elimina el error preexistente `preserve-manual-memoization` (el archivo queda en 0 errores).

**Verificación tanda 2:** backend `npm test` → **10 archivos, 68 tests verdes**; `tsc --noEmit` limpio. Frontend `tsc -b` limpio; eslint limpio en todos los archivos tocados (los 5 warnings restantes en `HorariosVendedoras`/`BarraLateral` son preexistentes — verificado linteando la versión base vía `git stash`).

**Falta prueba manual (tanda 2):** pantalla Mis Cierres con datos reales, badge "No llegó" en la grilla, confirmación por transferencia, y una merma de prueba visible en la pestaña Historial.

---

## COMPLETADOS FASE 5 — TANDA 3 (2026-07-27, working tree, sin commitear)

Resueltas las decisiones pendientes con el usuario: **D5** (caja chica fija de $20.000, editable — el cliente no hereda el cierre anterior), **D6** (período de pago flexible: el admin elige día/semana/mes al generar), **A42 sí / A43 descartado**. Con esto la **Fase 5 queda completa**: 20 de 21 hallazgos ejecutados (C13/A43 descartado por decisión).

- [x] **A31 (C1, D5)** — `AperturaTurno.tsx`: el saldo inicial se precarga con la caja chica estándar (`CAJA_CHICA_DEFAULT = 20_000`), editable para festivos/casos especiales; el subtítulo del paso lo explica. **Decisión del cliente:** NO se hereda del cierre anterior — la caja chica es fija.
- [x] **A42 (C7)** — Reporte de margen: `GET /bodega/margenes` (**solo ADMIN**: expone costos/rentabilidad) cruza `costo` vs `precio_venta` (margen $ y % sobre precio; `margenPct: null` si no hay costo cargado). Pestaña **"Márgenes"** en `GestorInventario` (solo ADMIN) con promedio, aviso de productos sin costo y semáforo (<0 rojo, <20% ámbar). Además **`costo` dejó de ser solo-escritura**: editable por ADMIN en el diálogo "Ajustar Stock" (schema+servicio+UI), cualquier categoría.
- [x] **A39 (C3, D6)** — **Pagos de personal por rango flexible**:
  - **Schema (aditivo, `db push` aplicado en local + `prisma generate`):** modelo `PagoPersonal` (snapshot de nombre/creador, desde/hasta, días, base/bonos/descuentos/total) + `TurnoCaja.pago_id` nullable → guarda anti doble-pago.
  - **Servicio** [pagos.servicio.ts](backend/src/servicios/pagos.servicio.ts): elegibles = turnos CERRADOS + **`recepcion_confirmada: true`** + `pago_id: null` (cierra C3: ya no se puede pagar un turno cuyo dinero no fue confirmado). Cálculo idéntico a Nómina (Σ pago_diario + bonos ConfigBono − faltantes de caja). `getResumenPago` (preview + conteo de turnos sin recepción), `generarPagos` (tx con guardia `updateMany pago_id null` — aborta si otra generación tomó turnos), `getPagos`, `anularPago` (libera turnos).
  - **Rutas** en `rrhh.rutas.ts` (heredan ADMIN-only): `GET /rrhh/pagos/resumen?desde=&hasta=`, `POST /rrhh/pagos`, `GET /rrhh/pagos`, `DELETE /rrhh/pagos/:id`.
  - **UI** [PagosPeriodo.tsx](frontend/src/componentes/admin/PagosPeriodo.tsx) (componente nuevo, montado arriba de la pestaña Pagos de `ModuloRRHH`): rango con botones rápidos (Hoy / Últimos 7 días / Mes en curso), preview por vendedor, aviso ámbar de turnos sin recepción, confirmación, historial de pagos generados con anulación. La nómina mensual de abajo queda rotulada como **informativa**.

**Verificación tanda 3:** backend `npm test` → **68 tests verdes**, `tsc --noEmit` limpio. Frontend `tsc -b` limpio, eslint 0 errores en archivos tocados (solo warning preexistente de `GestorInventario`).

**⚠️ Deuda de migración (deploy):** `PagoPersonal` + `TurnoCaja.pago_id` se aplicaron en local con `db push` (BD con drift). Antes de desplegar a Railway hay que **generar la migración formal** (junto con la deuda previa ya anotada). El modo demo no simula `/rrhh/pagos*` ni `/bodega/margenes` (pantallas vacías en demo, igual que gastos).

**Falta prueba manual (tanda 3):** apertura con $20.000 precargado, pestaña Márgenes (editar un costo y ver el %), y el ciclo completo de pago: cerrar turno → confirmar recepción → generar pago del día → verlo en historial → anular.

---

## FIX FUERA DE BACKLOG — Notificación de despacho scoped al PDV (2026-07-27)

**Reporte del usuario:** un despacho a Mall Patio hizo llegar el aviso "Te llegó tu despacho" a la sesión de Cugat Rengo. **Causa raíz:** las notificaciones se guardan por `usuario_id`, no por PDV; el vendedor de prueba (Alexandra) tenía **dos turnos ABIERTOS a la vez** (Mall Patio #5 y Cugat Rengo #6, ambos suyos — anomalía de datos relacionada con H2/A16, sin unique por usuario), así que era destinataria del aviso de Mall Patio y lo veía en la sesión de Cugat Rengo.

**Fix (working tree):** la notificación ahora pertenece a un PDV.
- Schema: `Notificacion.pdv_id Int?` (null = global, se ve en cualquier contexto). Aditivo, `db push` aplicado en local.
- `notificarDespachoAlVendedor` etiqueta el aviso con el PDV destino; el aviso "Despacho confirmado" (admin/supervisor) queda global.
- `notificaciones.servicio` filtra por contexto (`scopePdv`): con `pdvId` muestra los de ese PDV + globales; sin él (admin) muestra todos. Aplica a listar, contar y "leer todas".
- Rutas leen `?pdvId=`; `PanelNotificaciones` recibe prop `pdvId` — la BarraLateral del POS pasa `turno.pdvId`, el LayoutAdmin no pasa nada (ve todo, sin cambios). Demo intacto (ya separaba el query string).

**Verificado:** backend 68 tests + tsc; frontend tsc + lint (PanelNotificaciones limpio). **Deuda de migración:** `Notificacion.pdv_id` va con la migración formal pendiente. **Nota:** los dos turnos abiertos simultáneos del mismo usuario siguen siendo posible sin A16 (unique parcial por PDV) — aparte de este fix.

---

## A18 (H9) — Rechazar solicitud de insumos (2026-07-27)

**Reporte del usuario:** al rechazar una solicitud, en el vendedor quedaba como PENDIENTE. **Causa:** el flujo de gastos SÍ tiene rechazo (funciona bien), pero las **solicitudes de insumos** solo tenían estados PENDIENTE→DESPACHADA→CONFIRMADA — no existía forma de rechazarlas (hallazgo A18/H9). Un pedido que no se despacharía quedaba pendiente para siempre.

**Fix (working tree):**
- **Schema (aditivo, `db push` local):** valor enum `EstadoSolicitud.RECHAZADA` + columna `Solicitud.motivo_rechazo String?`.
- **Servicio** `rechazarSolicitud(id, motivo?)`: solo desde PENDIENTE (409 si no); setea RECHAZADA + motivo + fecha_cierre; **notifica al vendedor scoped al PDV** de la solicitud (usa el `Notificacion.pdv_id` recién agregado). `formatearSolicitud` ahora expone `motivoRechazo`.
- **Ruta** `PATCH /solicitudes/:id/rechazar` (BODEGUERO/ADMIN/SUPERVISOR), body `{ motivo? }`.
- **Frontend:** tipo `EstadoSolicitud` +RECHAZADA, chip rojo, botón "Rechazar" que abre un **input de motivo inline dentro de la propia tarjeta** (a pedido del usuario, en vez del prompt del navegador): textarea + "Confirmar rechazo"/"Cancelar"; vacío = rechaza sin motivo. Muestra el motivo en la card, pestaña de filtro "Rechazada". Mismo patrón inline en el panel del dashboard admin (`ControlVentasSucursal`, con estado `rechazandoId` por tarjeta). Demo fixtures manejan el endpoint.

**Verificado:** backend 68 tests + tsc; frontend tsc + lint limpios. **Deuda de migración:** el enum RECHAZADA y `motivo_rechazo` van con la migración formal pendiente. **Aclaración dada al usuario:** el flujo de **gastos** ya rechazaba bien (gasto #2 quedó RECHAZADO con su motivo); lo que faltaba era el rechazo de **insumos**.

---

## BUG CRÍTICO — Cierre de turno no persistía / "cierre fantasma" (2026-07-27)

**Reporte del usuario:** cuadró la caja de Alexandra en Cugat Rengo pero el turno seguía ABIERTO en el admin (módulo Cierre de turno). **Diagnóstico (BD):** turno #6 ABIERTO con todos los campos de cierre en null → el cierre nunca llegó al backend. **Dos causas encadenadas:**

1. **Validación 422 falsa** (`pos.servicio.cerrarTurno`): la identidad de coherencia exigía `diferenciaCaja === efectivoContado − ventaEfectivo`, **sin contar el saldo de apertura**. El front calcula `diferencia = efectivoContado − ventaEfectivo − saldoInicial` (el float de caja chica es parte del efectivo esperado). Con $20.000 de caja chica y $0 de ventas, el 422 saltaba SIEMPRE. **Fix:** identidad ahora resta `saldo_inicial` y es **blanda** (console.warn, no 422) — el POS permite ingresos manuales que el server no conoce, y el modelo es de totales declarados.

2. **Cierre fantasma** (`POSDashboard.ejecutarCierre`): llamaba `cerrarTurno(payload)` sin `await` y hacía logout a los 1200ms incondicionalmente. Al fallar el PATCH, el logout borraba token + cola en memoria → turno ABIERTO para siempre. (CierreCaja.tsx ya estaba bien, pero **no está montado como ruta**; el caller real es POSDashboard.) **Fix:** `async` + `await` + solo logout si `ok` + toast de error si falla + estado `cerrando`. **Store** `cerrarTurno`: ya no marca CERRADO local ni encola si el server falla (reintento explícito).

**Módulo admin:** ya estaba completo (muestra "A depositar", ventas, saldos finales y botón "Recepción de Dinero — Dar término al turno" cuando el turno está CERRADO). No requería cambios: solo no se veía porque el cierre no persistía.

**Recuperación turno #6:** era huérfano (ABIERTO en server, CERRADO en el navegador local → el POS no lo puede retomar, `useSesionPOS` exige ABIERTO). Cerrado por script puntual invocando el servicio real (`cerrarTurno`) con cierre coherente $0 (efectivo $20.000 = float). Creó su Deposito (teórico $20.000, PENDIENTE). Script borrado tras usarse.

**Verificado:** backend 68 tests + tsc; frontend tsc + lint limpios. **Gap anotado:** falta pantalla admin para cerrar/recuperar turnos huérfanos, y unique parcial de turno ABIERTO por PDV (A16) — Alexandra tenía 2 turnos abiertos a la vez.

---

## Detalle de ventas por producto en Cierre de turno + entrega sin caja chica (2026-07-27)

Pedido del usuario, tres partes:

1. **Detalle de ventas por producto en el panel admin de Cierre de turno** (antes solo se guardaba `total_calculado`, sin desglose). **Schema (aditivo, `db push`):** `TurnoCaja.venta_detalle Json?` = `[{ productoId, cantidad, precioUnitario }]` (precio snapshot). El cierre (POSDashboard + CierreCaja) lo arma desde `estVendidos × precio` y lo envía en el payload (`cerrarTurnoSchema.ventaDetalle`, opcional). `getVentasSucursal` lo resuelve a `detalleVentas: [{ nombre, categoria, cantidad, precioUnitario, subtotal }]` ordenado por subtotal. `ControlVentasSucursal` muestra una tabla nueva "Detalle de ventas — {PDV}" con TOTAL VENDIDO (solo turno CERRADO). Es **por sucursal** (el panel ya es por PDV+fecha).

2. **El vendedor no ve montos:** ya se cumplía — el "Cuadre en tiempo real" con el total es solo `puedeEliminar` (admin/supervisor); las tarjetas del vendedor muestran solo unidades (disp./saldo final/vendidos). El detalle nuevo es solo backend→admin. No se expuso ningún monto al vendedor.

3. **La caja chica NO entra en la entrega/depósito:** el saldo de apertura pertenece al punto y queda para el turno siguiente. **Backend:** `deposito.monto_teorico = max(0, efectivoContado − saldo_inicial) + retiros` (antes `efectivoContado + retiros`). Reporte agrega `efectivoAEntregar = max(0, efectivoDeclarado − saldoInicial)` y `diferenciaRecepcion` compara contra eso. **Admin cierre:** "Efectivo a entregar", "A depositar (sin caja chica)" y la recepción usan `efectivoAEntregar`; se agregó la fila "− Caja chica (queda en el punto)". **POS** (cuadre admin-only): `aDepositar` también excluye la caja chica.

**Verificado:** backend 68 tests + tsc; frontend tsc + lint limpios. **Deuda de migración:** `TurnoCaja.venta_detalle` va con la migración formal pendiente. **Nota:** el turno #6 (cerrado antes por script) tiene `venta_detalle` vacío → su panel no muestra detalle; los cierres nuevos sí. El desglose por categoría de Sucursales (`ventasPorCategoria`) sigue vacío (limitación aparte); este detalle es por **producto**, no por categoría.

---

## Cierre administrativo de turnos huérfanos (2026-07-29)

Pedido del usuario: botón para que el admin cierre turnos que quedaron ABIERTOS sin cuadre (ej: turno #5 abierto desde el 24). Antes no había forma de cerrar un turno huérfano — el POS no lo puede retomar y no existía acción admin.

- **Backend** `cerrarTurnoAdministrativo(turnoId, usuario)` (`pos.servicio.ts`) + `PATCH /pos/turnos/:id/cerrar-admin` (ADMIN/SUPERVISOR): cierra en $0 (sin ventas declaradas), auto-finaliza la 2ª etapa (recepción confirmada, dinero recibido 0), marca `recibido_por_nombre = "Cierre administrativo — {admin}"` para distinguirlo de un cuadre real, y NO toca el stock. `updateMany` con guarda `estado ABIERTO` (anti-carrera).
- **Frontend** (`ControlVentasSucursal`): botón "Cerrar turno administrativamente" con confirmación inline (advierte que cierra en $0) en la tarjeta del turno ABIERTO, solo admin/supervisor. Demo: handler que devuelve ok.

**Verificado:** backend 68 tests + tsc; frontend tsc + lint. Smoke test HTTP: 404 en turno inexistente, 403 para VENDEDOR (autorización), turno #5 intacto ABIERTO para probar el botón. **Sin migración** (usa campos existentes).

### Diagnóstico previo — el "cierre falló" era transitorio, no un bug
El usuario reportó que un cierre en el POS falló con toast de error. Reproducido por el mismo camino del navegador (proxy Vite 5174) → **HTTP 200 OK**: el código funciona. La causa fue **backend reiniciándose** durante los `db push` (varios kills del proceso) + **múltiples instancias duplicadas** de dev-server corriendo (3 backends nodemon, 2 Vite, varios `npm run dev`). El toast de error es el comportamiento correcto (evita el cierre fantasma). Turno #5 se había cerrado al diagnosticar y se **revirtió a ABIERTO** para no consumir la prueba del usuario. Recomendado: dejar una sola instancia limpia de `npm run dev`.

---

## "Pagar a Vendedor" desde la caja del punto (2026-08-21)

Pedido del usuario: en Cierre de turno, debajo de "Recepción de Dinero", un menú para pagarle a un vendedor elegido en un combo, por N turnos impagos (1 a N), descontando esa plata del **"dinero a depositar"** de la sucursal, "tal cual como lo hace la planilla".

**Fuente en la planilla** (`01 Mall Patio Feb 2026.xlsx`, hoja de cada día): `E28` es el rótulo "Pagado a Vendedor (DC)", `E29` el nombre y `F29` el monto; el a depositar sale de `P22 = P15 + P26 − P21 − F29` (venta + diferencia − gastos − pagado). Los días 06 y 15 tienen pago (`$224.000` = `30000+194000`, y `$176.000`); el 15 el a depositar quedó en **−$72.400** → un depósito negativo es posible y no se bloquea.

- **Schema (aditivo, `db push`):** `Deposito.pago_vendedor Int @default(0)` (acumula lo pagado con esa caja; el bruto `monto_teorico` se conserva) y en `PagoPersonal` los snapshots `pdv_id` / `pdv_nombre` / `turno_pago_id` (+ índice) que marcan el pago como hecho contra la caja de un punto.
- **Servicio** [pagos.servicio.ts](backend/src/servicios/pagos.servicio.ts): `getVendedoresPendientesDePago()` lista TODOS los vendedores activos con sus turnos impagos (CERRADO + `recepcion_confirmada` + `pago_id` null, FIFO) y un arreglo `acumulados[k]` con el total de pagar los primeros k — se precalcula en el server porque el descuento de caja se aplica sobre el **neto** del conjunto con tolerancia, no turno a turno. `pagarTurnosDesdeCaja()` crea el `PagoPersonal`, marca los turnos (misma guarda anti doble-pago que `generarPagos`) e incrementa `deposito.pago_vendedor` en una transacción. `anularPago` devuelve el monto al depósito.
- **Candados:** el depósito debe seguir PENDIENTE con `monto_real = 0` (si ya se registró en Finanzas no se puede descontar), el pago calculado debe ser > 0, y `reabrirTurno` ahora **rechaza** un turno cuya caja pagó a alguien (reabrir borra el depósito y se perdería el descuento) — hay que anular el pago primero.
- **Rutas** (ADMIN-only, heredan el guard de RRHH): `GET /rrhh/pagos/pendientes`, `POST /rrhh/pagos/directo {usuarioId, cantidadTurnos, turnoId}`.
- **Neteo del "a depositar"** en todo el sistema: Finanzas (`montoADepositar = monto_teorico − pago_vendedor`, + `montoBruto`/`pagoVendedor` para explicarlo), dashboard (`pendienteDeposito` y el estado por sucursal), y `getVentasSucursal` expone `depositoBruto`/`pagoVendedorTotal`/`aDepositar`/`depositoBloqueado`/`pagosVendedor`.
- **Frontend:** [PagoVendedorCaja.tsx](frontend/src/componentes/admin/PagoVendedorCaja.tsx) (nuevo) montado bajo la recepción en `ControlVentasSucursal`, solo ADMIN y solo con turno CERRADO: combo de vendedores con su conteo de turnos impagos, stepper 1..N ("Todos"), lista de los turnos que se liquidan, desglose base/bonos/descuento, y el impacto en el a depositar (en rojo si queda negativo) con confirmación en dos pasos. El bloque "2 · Qué debe llegar al banco" suma la fila "− Pagado a vendedor/a desde esta caja". En Personal → Pagos, los pagos hechos con caja llevan el badge "caja {PDV}". También se renombró "Diferencia vs declarado" → "Diferencia" en la recepción.

**Verificado:** backend 119 tests + tsc; frontend tsc + lint limpios. Smoke test HTTP del ciclo completo sobre la BD local (pago de 1 turno a Anaís con la caja del turno #20: a depositar 60.000 → 32.000; reapertura rechazada con el mensaje nuevo; anulación → 60.000 y el turno vuelve a pendiente). Estado de la BD restaurado. **Deuda de migración:** `Deposito.pago_vendedor` y los campos de `PagoPersonal` van con la migración formal pendiente. **Demo:** `/rrhh/pagos/pendientes` devuelve los vendedores con 0 pendientes (el modo demo no simula la deuda), y `POST /rrhh/pagos/directo` no está simulado.
