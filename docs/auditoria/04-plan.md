# Fase 4 — Plan de acción

> Backlog priorizado por **impacto ÷ esfuerzo**, en pasos **independientes y desplegables por separado**. Consolida los 31 hallazgos de las fases 1-3.
> Impacto (I) y Esfuerzo (E) en escala 1-5. 🟢 quick win (E≤2, sin migración) · 🗄️ requiere migración de datos · 🧭 requiere decisión de producto antes.

---

## 0. Decisiones de producto que bloquean fixes (resolver primero)

| 🧭 | Decisión | Depende | Impacto de no decidir |
|----|----------|---------|-----------------------|
| D1 | **¿SUPERVISOR debe ver RRHH/Nómina y Facturas?** El backend dice sí, el menú dice no (P1) | P1 | Sueldos expuestos o funcionalidad rota, según se elija |
| D2 | **¿Existe el rol BODEGUERO en la UI?** Hoy tiene permisos backend sin pantalla (P5) | P5 | Rol inoperable o permisos muertos |
| D3 | **Transiciones válidas** de Depósito y Factura (H7) | H7/R6 | No se puede validar sin la política |
| D4 | **¿Confirmar solicitud debe mover stock?** (fusión H4) | H4 | Define el refactor keystone |
| D5 | **¿Fórmula del saldo inicial heredado?** ¿`efectivo_declarado` completo del cierre anterior, o el remanente tras el retiro del admin (`efectivo_declarado − dinero_recibido`)? (Fase 5, C1) | C1 | Sin esto, no se puede precargar el saldo de apertura sin arriesgar el monto equivocado |
| D6 | **¿Unidad de pago de turno?** ¿Se genera un pago por turno individual al confirmar recepción, o se agrupan turnos en un período (semanal/mensual) que el admin cierra explícitamente? (Fase 5, C3) | C3 | Define el modelo de datos del nuevo `PagoPersonal`/`Liquidacion` |

---

## 1. Tabla de priorización (ordenada por ratio I÷E)

| # | Acción | Refs | I | E | I÷E | Flags |
|---|--------|------|:-:|:-:|:---:|-------|
| A1 | Re-validar turno **ABIERTO** al aprobar gasto | H3 | 4 | 1 | 4.0 | 🟢 |
| A2 | Bypass ADMIN/SUP en `confirmarSolicitud` (desatasca DESPACHADA) | H1 | 4 | 1 | 4.0 | 🟢 |
| A3 | `autorizar` en `GET /admin/registro-diario` | P3 | 3 | 1 | 3.0 | 🟢 |
| A4 | Guarda "último admin" en editar/estado usuario | P4 | 3 | 1 | 3.0 | 🟢 |
| A5 | Resolver D1 → ajustar `autorizar` en rrhh/facturas | P1, D1 | 4 | 1.5 | 2.7 | 🟢🧭 |
| A6 | **Adoptar `tiempoChile.ts`** en admin/cierrePrev/rrhh (mata bug DST) | R4 | 4 | 1.5 | 2.7 | 🟢 |
| A7 | Scope de PDV en `GET /pos/turnos/activo` | P6 | 2 | 1 | 2.0 | 🟢 |
| A8 | Máquina de estados de Depósito/Factura (`transicion()`) | H7, R6, D3 | 3 | 1.5 | 2.0 | 🟢🧭 |
| A9 | **Extraer `dominio/stock.servicio`** (unifica R3, base de H5/H8) | R3 | 5 | 3 | 1.7 | (tests antes) |
| A10 | Vincular `monto_retiro`→`RetiroTurno` en cierre preventivo | H11 | 2 | 1.5 | 1.3 | 🟢 |
| A11 | Adoptar `formatearCLP` (retirar 165 `toLocaleString`) + lint-ban | R8 | 2 | 2 | 1.0 | 🟢 |
| A12 | `lib/http.ts` (asyncHandler+validar) → mata boilerplate 50 handlers | R1 | 3 | 3 | 1.0 | |
| A13 | `middlewares/scope.ts` (esAutorizador/assertAccesoTurno) | R2, H12 | 2 | 2 | 1.0 | 🟢 |
| A14 | `roles.ts` fuente única + cablear/eliminar `permisos.ts` muerto | P2, P7, D1 | 3 | 3 | 1.0 | 🗄️(si enum en DB) |
| A15 | **Fusión Solicitud↔Despacho** (confirmar dispara despacho) | H4, H8, H10, D4 | 4 | 4 | 1.0 | 🗄️🧭 |
| A16 | Unique parcial `(pdv_id, estado=ABIERTO)` + guarda en tx | H2 | 4 | 2 | 2.0* | 🗄️ |
| A17 | Job de expiración de preparaciones PENDIENTE vencidas | H6 | 2 | 2.5 | 0.8 | |
| A18 | Estado CANCELADA/RECHAZADA en Solicitud | H9 | 2 | 2.5 | 0.8 | 🗄️ |
| A19 | Reconciliación de stock por delta al cierre (+ alerta) | H5 | 3 | 3.5 | 0.9 | (post-A9) |
| A20 | UI del rol BODEGUERO (o reasignar) | P5, D2 | 3 | 4 | 0.75 | 🧭 |
| A21 | Reversa/anulación de despacho | H10 | 2 | 3 | 0.7 | 🗄️(estado) |
| A22 | Idempotency-key en `registrarDespacho` | H8 | 2 | 2.5 | 0.8 | (post-A9) |
| A23 | Descomponer componentes front >1000 líneas | R7, R9, R10, R11 | 2 | 5 | 0.4 | |

\* A16 sube su ratio efectivo porque previene descuadres de caja, aunque exija migración.

### 1bis. Backlog de Fase 5 (conexiones de negocio) — detalle en `05-conexiones.md`

| # | Acción | Refs | I | E | I÷E | Flags |
|---|--------|------|:-:|:-:|:---:|-------|
| A24 | Usar `calcularADepositar` en `cerrarTurno` (deja de mezclar efectivo+tarjeta+transferencia) | C2 | 4 | 1 | 4.0 | 🟢 |
| A25 | Adoptar `tiempoChile.ts` en `resolverPDVHoy` (mata bug UTC en login/me) | C17 | 4 | 1 | 4.0 | 🟢 |
| A26 | Filtrar `publicado:true` en `resolverPDVHoy` | C18 | 3 | 1 | 3.0 | 🟢 |
| A27 | Guarda de "sin datos" en "Venta del mes por categoría" (`PanelAdmin.tsx`) | C14 | 3 | 1 | 3.0 | 🟢 |
| A28 | Registrar `HistorialInventario` al ajustar stock en bodega (`ajustarStock`) | C5 | 3 | 1 | 3.0 | 🟢 |
| A29 | Exigir monto real en "Marcar Depositado" (`DepositosFinanzas.tsx` + `actualizarDeposito`) | C9 | 4 | 1.5 | 2.7 | 🟢 |
| A30 | Registrar `HistorialInventario` al persistir `stockFinal` en `cerrarTurno` | C4 | 4 | 2 | 2.0 | 🟢 |
| A31 | Precargar saldo inicial desde el último cierre del PDV (tras decidir D5) | C1 | 4 | 2 | 2.0 | 🟢🧭 |
| A32 | Endpoint scoped VENDEDOR para leer `notasVendedor` de Cierre Preventivo | C11 | 3 | 1.5 | 2.0 | 🟢 |
| A33 | Incluir datos bancarios del proveedor en la respuesta de factura + modal de pago | C12 | 2 | 1 | 2.0 | 🟢 |
| A34 | Montar `PanelNotificaciones` en `LayoutAdmin.tsx` | C20 | 3 | 1.5 | 2.0 | 🟢 |
| A35 | Chequeo de turno `ABIERTO` antes de desactivar usuario (o pantalla de cierre administrativo) | C19 | 4 | 2.5 | 1.6 | |
| A36 | Endpoint `GET /pos/turnos/mios` (historial propio de diferencias de caja) | C15 | 3 | 2 | 1.5 | |
| A37 | Comparar fecha vs hoy en grilla de horarios (distinguir inasistencia de turno futuro) | C16 | 3 | 2 | 1.5 | |
| A38 | Acción "Marcar como Transferencia" en depósitos (o retirar el estado) | C10 | 2 | 1.5 | 1.3 | |
| A39 | Modelo `PagoPersonal`/`Liquidacion` + generación al confirmar recepción (tras decidir D6) | C3 | 4 | 4 | 1.0 | 🗄️🧭 |
| A40 | Flujo explícito de `MERMA` como tipo de movimiento | C6 | 2 | 2 | 1.0 | |
| A41 | `es_demo` visible en `formatearUsuario` + `GestorUsuarios.tsx` | C21 | 1 | 1 | 1.0 | 🟢 |
| A42 | Reporte de margen (`costo` vs `precio_venta`) — evaluar interés con el usuario antes | C7 | 2 | 2 | 1.0 | 🧭 |
| A43 | Consolidado neto de caja (depósitos + facturas) en el dashboard — opcional | C13 | 1 | 2 | 0.5 | |
| A44 | Eliminar o conectar `PATCH /inventario/:pdvId` sin UI | C8 | 1 | 1 | 1.0 | 🟢 |

**Quick wins de Fase 5 (E≤2, sin migración):** A24-A34 y A41/A44 — 13 ítems, varios de severidad Alto, sin tocar el esquema salvo A30 (nueva escritura a tabla ya existente `HistorialInventario`, no requiere migración).

---

## 2. Olas de despliegue (cada paso se despliega solo)

### 🌊 Ola 1 — Quick wins de seguridad y correctitud (días, sin migración)
**A1, A2, A3, A4, A6, A7** — más **A5** una vez resuelto D1.
- Todos son cambios acotados en 1 archivo, sin tocar el esquema.
- Cierran: gasto post-cierre (H3), pedido colgado (H1), fuga de reportes (P3), lockout de admin (P4), bug DST latente (R4), exposición de RRHH (P1), leak de turno (P6).
- **Entregable:** parche de seguridad + correctitud desplegable de inmediato.

### 🌊 Ola 2 — Adoptar lo que ya existe (semana 1)
**A11 (money), A6 completado (fechas), A8 (estados), A13 (scope)**.
- Adopción de helpers existentes + máquina de estados de finanzas. Bajo riesgo, alto orden.
- **Entregable:** consistencia de formato/fechas/estados; base para A9.

### 🌊 Ola 3 — Capas compartidas (semanas 2-3)
**A12 (http.ts), A14 (roles.ts + permisos), luego A9 (stock.servicio)**.
- ⚠️ **Prerrequisito de A9:** añadir tests de integración de stock (concurrencia, no-negativo, reserva/anula/confirma). A9 es el refactor de mayor impacto y el más riesgoso.
- **Entregable:** núcleo de stock único y probado; boilerplate y roles centralizados.

### 🌊 Ola 4 — Keystone de negocio + integridad de caja (semanas 3-4)
**A16 (unique turno) 🗄️, A15 (fusión Solicitud↔Despacho) 🗄️, A19 (reconciliación stock), A22 (idempotencia)**.
- Requieren A9 hecho y tests verdes. A15/A16 llevan migración → ventana controlada.
- **Entregable:** doble-conteo y races de stock/caja eliminados.

### 🌊 Ola 5 — Higiene de estados colgados (backlog)
**A10 (retiro), A17 (expiry prep), A18 (cancelar solicitud) 🗄️, A21 (reversa despacho) 🗄️, A20 (UI bodeguero) 🧭, A23 (descomposición front)**.
- No urgentes; mejoran operación y mantenibilidad.

---

## 3. Quick wins (hacer ya — E≤2, sin migración)

A1, A2, A3, A4, A6, A7, A10, A11, A13 (y A5 tras decidir D1). **9-10 ítems** que cierran la mayoría de los hallazgos Alto/Medio de seguridad y correctitud sin tocar la base de datos ni requerir refactors grandes.

## 4. Requieren migración de datos (🗄️ — planificar ventana)

| Ítem | Migración | Nota |
|------|-----------|------|
| A16 (H2) | Índice único parcial en `TurnoCaja` | MySQL: índice funcional o columna generada `turno_activo`; validar que no haya duplicados actuales antes |
| A15 (H4) | Columna `solicitud_id` en `Despacho` (o FK a `lote_id`) | Datos históricos sin vínculo → nullable; backfill opcional |
| A18 (H9) | Valor enum `CANCELADA` en `EstadoSolicitud` | Aditivo, seguro |
| A21 (H10) | Valor enum `ANULADO` en `EstadoDespacho` | Aditivo |
| A14 (P7) | Solo si se convierte `Rol.nombre`→enum tipado | Opcional; alternativa sin migración = enum en código |

> ⚠️ **Recordatorio de entorno** (memoria del proyecto): la BD local tiene *drift* y `migrate dev` pide reset. Usar `db push` para cambios aditivos en local, pero **generar la migración formal** para el deploy. Los enums aditivos (A18/A21) son de bajo riesgo; A16 exige verificar duplicados previos.

## 5. Requieren decisión de producto (🧭)

D1→A5 (permisos supervisor), D2→A20 (rol bodeguero), D3→A8 (transiciones finanzas), D4→A15 (semántica de la fusión).

---

## 6. Camino crítico recomendado

```
Ola 1 (parche seguridad)  ──►  Ola 2 (adopción helpers)  ──►  tests de stock  ──►
Ola 3 (stock.servicio)    ──►  Ola 4 (fusión + migración)  ──►  Ola 5 (higiene)
```

- **Empezar hoy** por la Ola 1: máximo valor, riesgo mínimo, cero migración.
- **No tocar A9/A15 sin tests de stock primero** — es donde vive el dinero y el inventario.
- **Resolver D1–D4 en paralelo** a la Ola 1 para no bloquear A5/A8/A15/A20.

---

## Cierre de la auditoría

**Estado general:** base sólida en lo transaccional y en revocación de sesión, pero con tres debilidades sistémicas:
1. **El front no aplica permisos** (solo el backend); y donde existen helpers correctos (`tiempoChile`, `money`, `permisos`) **el código los ignora y reimplementa**, a veces reintroduciendo bugs (DST).
2. **Los bordes de los flujos quedan colgados**: estados sin salida, aprobaciones post-cierre, reservas que no vuelven — todo por falta de guardas y de máquinas de estado explícitas.
3. **La lógica de stock está duplicada 4-5 veces**, concentrando el mayor riesgo de doble-conteo y races en el activo más sensible (inventario/caja).

El plan ataca (1) y (2) con quick wins de bajo riesgo (Olas 1-2) y (3) con un refactor keystone protegido por tests (Olas 3-4). La deuda de UI y descomposición (Ola 5) queda para el final por su bajo ratio impacto/esfuerzo.

---

## 7. Adenda — Fase 5 (conexiones de negocio)

Auditoría posterior (pedida por el usuario) que encontró una **cuarta debilidad sistémica**, distinta de las tres originales: **operaciones que cambian dinero o stock sin dejar rastro, o pantallas que muestran datos que el backend nunca calculó** (C1-C21, detalle en `05-conexiones.md`). A diferencia de H/P/R, no son bugs de máquina de estados ni de permisos — son conexiones puntuales que faltan entre una acción del backend y su consumidor en el frontend (o viceversa).

**13 de los 21 son quick wins** (A24-A34, A41, A44) desplegables de inmediato, sin migración, varios de severidad Alto (A24 "a depositar" mezclado, A25 bug de zona horaria en login, A29 depósitos sin verificar, A30 stock sin historial). Dos requieren decisión de producto antes de empezar (D5 saldo inicial, D6 unidad de pago) y una requiere un modelo Prisma nuevo (A39, aditivo, sin migración destructiva).

**Recomendación:** intercalar A24-A30 con la Ola 1 existente (mismo perfil de riesgo/esfuerzo); resolver D5/D6 en paralelo a las decisiones D1-D4 ya pendientes.

---

**FIN DE LA AUDITORÍA (Fases 0-4).** Entregables en `docs/auditoria/`: `00-mapa.md`, `01-flujos.md`, `02-permisos.md`, `03-redundancia.md`, `04-plan.md`, `05-conexiones.md`.
