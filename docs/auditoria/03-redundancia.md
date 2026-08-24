# Fase 3 — Redundancia y arquitectura

> Duplicación **por concepto** (lógica equivalente, no líneas idénticas), esquema objetivo antes→después, y análisis de fusión de módulos con coste/beneficio. Muestreo: se analizaron 2-3 archivos representativos por patrón y se extrapoló.

---

## 1. Inventario de duplicación real

| # | Concepto duplicado | Dónde (muestra) | Qué se repite | Sev. |
|---|--------------------|-----------------|---------------|------|
| **R1** | **Boilerplate de rutas** | 34× `safeParse` en 14 archivos `*.rutas.ts` | `safeParse→400 {detalle: flatten}` + `try/catch→next(error)` idéntico en ~50 handlers | Alto |
| **R2** | **Scoping de rol** `esAutorizador` | [pos.servicio.ts:23](backend/src/servicios/pos.servicio.ts#L23), [gastoAutorizacion.servicio.ts:72,124](backend/src/servicios/gastoAutorizacion.servicio.ts#L72), [bodega.servicio.ts:577](backend/src/servicios/bodega.servicio.ts#L577) | `rol==='ADMIN'\|\|rol==='SUPERVISOR'` + chequeo `usuario_id/pdv_id` (mismo OR laxo de H12) | Alto |
| **R3** | **Movimiento de stock** (upsert increment/decrement + MovimientoInv) | [bodega.servicio.ts:125-168](backend/src/servicios/bodega.servicio.ts#L125-L168), [preparacion.servicio.ts:138-163,256-275](backend/src/servicios/preparacion.servicio.ts#L138-L163), [pos.servicio.ts:147-161](backend/src/servicios/pos.servicio.ts#L147-L161) | Descuento condicional `updateMany gte`, upsert de destino, creación de `MovimientoInv TRASPASO` — reescrito 4-5 veces | **Alto** |
| **R4** | **Lógica de fecha Chile** | `tiempoChile.ts` (correcto, DST-aware) **NO usado** por: [admin.rutas.ts:120](backend/src/rutas/admin.rutas.ts#L120) (`-4*3_600_000`), [cierrePreventivo.servicio.ts:81,97](backend/src/servicios/cierrePreventivo.servicio.ts#L81), [rrhh.servicio.ts:117,360,434](backend/src/servicios/rrhh.servicio.ts#L117) (`-04:00` fijo) | Rango de día/mes reimplementado con offset fijo → **reintroduce el bug DST** que `tiempoChile` corrige; + `toISOString().slice(0,10)` ad-hoc en ~12 sitios | **Alto** |
| **R5** | **Notificar a autorizadores** | [gastoAutorizacion.servicio.ts:20-32](backend/src/servicios/gastoAutorizacion.servicio.ts#L20-L32) vs [bodega.servicio.ts:598-614](backend/src/servicios/bodega.servicio.ts#L598-L614) | `findMany({rol in [ADMIN,SUPERVISOR], activo, es_demo:false})` + `notificacion.createMany` reescrito; `notificaciones.servicio` solo tiene lectura | Medio |
| **R6** | **Actualizar estado sin máquina** | [finanzas.servicio.ts:61](backend/src/servicios/finanzas.servicio.ts#L61), [proveedores.servicio.ts:164](backend/src/servicios/proveedores.servicio.ts#L164) | `estado: data.estado as any` + `findUniqueOrThrow` previo — mismo patrón inseguro (H7) | Medio |
| **R7** | **Serializadores `mapear*/formatear*`** | cada servicio (pos, solicitudes, gasto, prep, factura, deposito, cierre, usuario) | Estructura `map(row → DTO camelCase)` + `toISOString` repetida; no comparten util | Bajo |
| **R8** | **Formateo CLP inline** (front) | **165 ocurrencias** de `toLocaleString('es-CL')` en 18 archivos; `lib/money.ts` casi no se usa (CierreCaja 20×, ControlVentas 37×, ModuloRRHH 21×, PanelAdmin 22×) | `$${n.toLocaleString('es-CL')}` en vez de `formatearCLP()` | Medio |
| **R9** | **Dos paradigmas de fetching** (front) | react-query en 19 archivos **+** patrón manual `useState([cargando])/useEffect/apiGet().catch` en varios de los MISMOS archivos (GestorInventario, ControlVentas, HorariosVendedoras…) | Migración a react-query a medias; conviven dos capas de datos | Medio |
| **R10** | **Constantes de dominio duplicadas** (front↔back) | [mock.admin.datos.ts](frontend/src/datos/mock.admin.datos.ts): `PDV_IDS`, `FACTORES_CONVERSION`, `MEZCLAS_LABELS` hardcodeados vs categorías/productos/PDVs del backend | IDs de PDV y factores de conversión fijados en el front, acoplados al seed | Medio |
| **R11** | **`demoFixtures.ts` (919 líneas)** = copia sombra del backend | [demoFixtures.ts](frontend/src/lib/demoFixtures.ts) | Reimplementa la forma de ~decenas de endpoints; cada cambio de API debe espejarse a mano | Medio (diseño) |

**Los tres con más ROI:** R1 (boilerplate, mecánico), R3 (stock, es también donde viven H5/H8) y R4 (fechas, reintroduce bug real).

---

## 2. Esquema objetivo (antes → después)

### Backend

```
ANTES                                  DESPUÉS
backend/src/                           backend/src/
  lib/                                   lib/
    errores.ts                             errores.ts
    tiempoChile.ts  (infrautilizado)       tiempoChile.ts   ← ÚNICA fuente de fechas
                                           http.ts          ← NUEVO: asyncHandler(fn) +
                                                              validar(schema) → mata R1
  middlewares/                           middlewares/
    autenticar.ts                          autenticar.ts
    autorizar.ts                           autorizar.ts
    manejarErrores.ts                      manejarErrores.ts
                                           scope.ts         ← NUEVO: esAutorizador(),
                                                              assertAccesoTurno(), assertPdvVendedor() (R2)
  servicios/                             dominio/           ← NUEVO (núcleo compartido)
    bodega.servicio.ts (618, hace todo)    stock.servicio.ts     ← R3: moverStock/reservar/
    preparacion.servicio.ts                                        devolver/confirmar (Inventario+Movimiento)
    pos.servicio.ts                        notificaciones.servicio.ts ← R5: notificar(Autorizadores|Pdv|Usuario)
    inventario.servicio.ts                 roles.ts              ← enum Rol + matriz permisos (fuente única)
    finanzas / proveedores (estado as any) estado.ts            ← R6: transicion(actual, nuevo, permitidas)
    ...                                   servicios/  (negocio, adelgazado; consumen dominio/)
    shared/usuario.query.ts                  bodega, preparacion, pos, inventario, finanzas...
```

### Frontend

```
ANTES                                  DESPUÉS
frontend/src/                          frontend/src/
  lib/                                   lib/
    money.ts (casi no se usa)              money.ts         ← usar SIEMPRE; lint-ban toLocaleString (R8)
    permisos.ts (CÓDIGO MUERTO)            permisos.ts      ← cablear como fuente real del menú, o eliminar
    api.ts                                 api.ts
                                           hooks/datos/     ← NUEVO: useXxxQuery/Mutation (react-query)
  componentes/admin/ (7 files >1000 ln)                       unificar; retirar useState/useEffect/.catch (R9)
    HorariosVendedoras 2004                componentes/admin/  (descompuestos por sub-vista)
    GestorInventario 1565                    horarios/{Grilla,Importar,Publicar}.tsx
    ControlVentasSucursal 1382               inventario/{Tabla,Despacho,Historial}.tsx
  datos/mock*.ts + lib/demoFixtures      datos/dominio.ts  ← R10: constantes de dominio (una fuente)
                                         lib/demoFixtures.ts ← R11: generar desde tipos, no copiar a mano
```

**Capas compartidas nuevas (5):** `lib/http.ts`, `middlewares/scope.ts`, `dominio/stock.servicio.ts`, `dominio/notificaciones.servicio.ts`, `dominio/roles.ts` (+ `estado.ts`). Estas absorben R1–R6.

---

## 3. Análisis de fusión de módulos

| Par candidato | Acoplamiento actual | Solapamiento de flujos | Recomendación | Por qué |
|---------------|--------------------|-----------------------|---------------|---------|
| **Solicitudes ↔ Despachos (bodega)** | Nulo en código, pero son 2 pasos del MISMO proceso (pedir→entregar). Sin FK entre `Solicitud` y `Despacho`/`lote_id` | Total conceptual (H4) | **FUSIONAR el flujo** (no los archivos): confirmar/despachar solicitud dispara `registrarDespacho`; vincular `solicitud_id↔lote_id`. Eliminar el paso manual doble | Hoy el estado del pedido puede mentir respecto al stock; doble conteo posible. Beneficio alto, coste medio (migración de datos histórica opcional) |
| **inventario.servicio ↔ bodega.servicio** | Ambos operan sobre `Inventario`, separados solo por `tipo` de PDV | Alto: mismo modelo, misma semántica de stock | **EXTRAER capa `stock.servicio`** (no fusionar módulos) | R3 vive aquí; unificar el núcleo transaccional y dejar bodega/inventario como fachadas delgadas. Beneficio alto (una sola implementación correcta del descuento condicional), coste medio |
| **preparacion ↔ bodega** | Ya acoplado: `preparacion` importa `resolverBodegaId` y mueve stock de bodega | Alto pero **intencional** (reserva anti-doble-conteo) | **DEJAR SEPARADO**, sobre la capa `stock.servicio` compartida | El acople es correcto por diseño; solo falta que ambos usen el mismo helper de stock en vez de reescribirlo |
| **cierrePreventivo ↔ pos(cierre) ↔ finanzas(depósito)** | Débil; `monto_retiro` desacoplado de `RetiroTurno` (H11) | Medio: los tres son el dominio "cierre de turno / caja" | **FUSIONAR parcialmente**: vincular `monto_retiro`→`RetiroTurno`, y evaluar mover cierrePreventivo bajo el dominio de turno | Evita descuadres (H11). Coste: bajo si solo se vincula; alto si se remodela. Recomendado: vincular ahora, remodelar después |
| **gastoAutorizacion ↔ pos(GastoTurno)** | Fuerte: aprobar crea `GastoTurno` (`gasto_turno_id`) | Parcial: "solicitud de gasto" vs "gasto registrado" son conceptos distintos | **DEJAR SEPARADO**; formalizar el vínculo y el guard de turno abierto (H3) | Separación correcta (request vs record). Solo cerrar el hueco temporal |
| **admin.servicio ↔ reporte.servicio ↔ rrhh(seguimiento)** | Bajo; los tres agregan sobre `TurnoCaja` | Medio: agregación/reportes de turnos repetida | **EXTRAER capa de agregación** de turnos (o dejar igual si el coste supera el beneficio) | Muchas queries `groupBy` sobre turnos se repiten; candidato de segundo orden, no urgente |

**Ninguna fusión "por estética".** Las dos con beneficio claro: **Solicitudes↔Despacho** (corrige H4) y **inventario↔bodega vía stock.servicio** (corrige R3/H5/H8 de una vez).

---

## 4. Riesgos de cada refactor y qué testear ANTES

| Refactor | Riesgo principal | Qué testear antes de tocar |
|----------|------------------|----------------------------|
| **R1 `http.ts`** (asyncHandler+validar) | Cambiar el shape de errores 400/500 que el front ya parsea | Snapshot de respuestas de error actuales por endpoint; que `error`/`detalle` no cambien |
| **R3 `stock.servicio`** | Romper la garantía transaccional (descuento condicional `gte`, no-negativo) | Despachos concurrentes del mismo producto → stock nunca negativo; preparación reservar/anular/confirmar sin doble conteo; cierre persiste stock final; **cubrir con tests de integración antes de extraer** |
| **R4 fechas** | Correr los bordes de reportes ±1h en invierno chileno (DST) | Reportes mensuales/diarios en abril–septiembre: turnos en 23:00–01:00 caen en el día correcto; comparar salida antes/después |
| **Fusión Solicitud↔Despacho** | Doble movimiento de stock durante la transición | Confirmar solicitud mueve stock **exactamente una vez**; que no queden despachos manuales que dupliquen; datos históricos sin `lote_id` no rompen |
| **R2 `scope.ts`** | Cambiar sutilmente el OR laxo (H12) y alterar accesos | Matriz de acceso a turnos por rol (dueño/mismo-PDV/admin) antes y después idéntica salvo el fix intencional |
| **R8 money / R9 react-query** | Regresiones visuales / staleness de caché | Revisión visual por pantalla; comportamiento de refetch tras mutación |
| **R10/R11 constantes y demo** | Desincronizar demo del backend | Recorrido completo del modo demo tras regenerar fixtures |

**Prerrequisito transversal:** hoy solo `calculos.servicio` tiene tests. **Antes de R3 y de la fusión Solicitud↔Despacho hay que añadir tests de integración de stock** (son los refactors de mayor riesgo y tocan dinero/inventario).

---

## Resumen ejecutivo Fase 3
- La base tiene **buenos cimientos aislados que no se reutilizan**: `tiempoChile.ts`, `money.ts` y `permisos.ts` existen y son correctos, pero el código los ignora y reimplementa (R4, R8, P2). El primer trabajo es *adoptar lo que ya existe*, no crear nuevo.
- La duplicación cara y peligrosa es **R3 (stock)**: la misma lógica transaccional escrita 4-5 veces es donde se concentran H5/H8. Extraer `stock.servicio` es el refactor de mayor impacto.
- La única fusión de módulos con beneficio real de negocio es **Solicitudes↔Despacho** (corrige H4). El resto: extraer capas compartidas, no fusionar.

---

**FASE 3 COMPLETA.** Esperando **"continúa"** para la Fase 4 (plan de acción: backlog priorizado por impacto÷esfuerzo, pasos desplegables por separado, quick wins vs. los que requieren migración de datos).
