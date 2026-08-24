
# Fase 5 — Desconexiones frontend↔backend y lógica muerta

> Auditoría dirigida (pedida por el usuario tras notar que "muchos módulos no se están completando o no se están comunicando de una buena manera"). Foco distinto de las Fases 1-3: no máquinas de estado (H1-H12), no permisos (P1-P8), no duplicación de código (R1-R11) — sino casos donde **el frontend muestra/promete algo que el backend no entrega correctamente**, **una función correcta existe pero nadie la usa**, o **un dato se captura y se pierde en el camino**.
> Convención de severidad: 🔴 Alto · 🟡 Medio · 🟢 Bajo. 🧭 = requiere decisión de producto antes de arreglar (ver `04-plan.md`).
> Método: lectura directa de ambos lados (archivo:línea backend + archivo:línea frontend) para cada hallazgo, más verificación cruzada de los más severos. Todos los hallazgos de esta fase están confirmados leyendo código real, no inferidos.

---

## 1. Turno de caja / Depósito (dominio "cierre de caja")

El ciclo completo que describió el usuario — saldo inicial heredado, "a depositar" solo en efectivo, y el pago del turno gatillado por la confirmación del admin — tiene los tres eslabones rotos.

- **C1** 🔴🧭 — `AperturaTurno.tsx` (paso "Apertura de Caja", [líneas 78-172](frontend/src/paginas/AperturaTurno.tsx#L78)) no hereda nada del cierre anterior del mismo PDV: arranca en $0 y el vendedor tipea el monto a mano (o usa botones de montos fijos). Contraste revelador: el **inventario de productos sí se hereda correctamente** vía `GET /inventario/:pdvId` (líneas 91-106) en el mismo componente. En el backend, `abrirTurno` ([pos.servicio.ts:33-68](backend/src/servicios/pos.servicio.ts#L33)) tampoco valida ni sugiere nada — usa `data.saldoInicial` tal cual llega del cliente.
  **Impacto:** cero relación entre lo que quedó físicamente en caja y el saldo declarado del día siguiente; abre la puerta a descuadres sistemáticos que el sistema no puede detectar porque no tiene con qué comparar.
  **Fix propuesto:** exponer el último cierre relevante del PDV y precargarlo en el paso "saldo", igual que ya se hace con inventario. Requiere antes decidir la fórmula exacta (ver D5 en `04-plan.md`): ¿el saldo inicial hereda `efectivo_declarado` completo, o el remanente tras el retiro del admin (`efectivo_declarado − dinero_recibido`)?

- **C2** 🔴 — `calcularADepositar(efectivo, gastos, retiros)` existe y es correcto ([calculos.servicio.ts:74-80](backend/src/servicios/calculos.servicio.ts#L74)) pero **nunca se usa en producción** (grep: solo aparece en su propio test). `cerrarTurno` crea el `Deposito` con `monto_real: totalDeclarado` donde `totalDeclarado = ventaEfectivo + ventaTarjeta + ventaTransferencia` ([pos.servicio.ts:139-146](backend/src/servicios/pos.servicio.ts#L139)). `finanzas.servicio.ts` expone ese mismo monto mezclado como `montoADepositar`/`montoDepositado`.
  **Impacto:** el módulo de Finanzas pide "depositar" plata que en parte nunca fue efectivo físico — tarjeta y transferencia ya están en la cuenta bancaria. Infla el monto pendiente de depósito de cada sucursal.
  **Fix propuesto:** usar `calcularADepositar` al crear el `Deposito` en `cerrarTurno`; `monto_teorico`/`monto_real` deben representar solo el componente efectivo.

- **C3** 🔴🧭 — `confirmarRecepcionTurno` (admin cuenta y confirma recepción, [pos.servicio.ts:174-216](backend/src/servicios/pos.servicio.ts#L174)) solo actualiza `TurnoCaja` — no genera ningún registro de pago. `getNomina` ([rrhh.servicio.ts:430-501](backend/src/servicios/rrhh.servicio.ts#L430)) calcula sueldos filtrando por `estado:'CERRADO'`, **ignorando por completo `recepcion_confirmada`**. No existe ningún modelo Prisma de pago/liquidación (confirmado por grep sobre `schema.prisma`).
  **Impacto:** un turno puede pagarse en la nómina mensual sin que el admin haya confirmado siquiera que recibió el dinero. No hay forma de marcar un turno o período como "ya pagado", ni de agrupar turnos en una liquidación semanal/mensual.
  **Fix propuesto:** requiere decisión de producto (ver D6 en `04-plan.md`) sobre la unidad de pago (por turno vs por período configurable). Luego: nuevo modelo `PagoPersonal`/`Liquidacion` + servicio que lo genere a partir de turnos con `recepcion_confirmada: true`.

---

## 2. Bodega / Stock / Inventario

- **C4** 🔴 — El cierre de turno sobrescribe `Inventario.stock_actual` con el conteo declarado ([pos.servicio.ts:148-162](backend/src/servicios/pos.servicio.ts#L148)) sin crear ninguna fila en `HistorialInventario` ni `MovimientoInv`.
  **Impacto:** es la operación de stock más frecuente del sistema (cada cierre, 5 sucursales/día) y es invisible en la pestaña "Historial" que usa el admin para auditar — no queda ni un antes/después reconstruible.
  **Fix propuesto:** dentro de la misma transacción, registrar en `HistorialInventario` el delta por producto (snapshot + usuario + motivo "cierre de turno"), igual que ya hace `guardarLoteInventario`.

- **C5** 🔴 — `ajustarStock` ([bodega.servicio.ts:53-97](backend/src/servicios/bodega.servicio.ts#L53)) — edición rápida de stock en bodega — tampoco genera historial.
  **Impacto:** mismo problema que C4: un cambio manual de stock (corrección de tipeo o merma real) no deja rastro de quién, cuándo ni por qué.
  **Fix propuesto:** mismo patrón que C4; buen candidato para extraer el helper común de stock ya sugerido en `03-redundancia.md` (R3, `dominio/stock.servicio.ts`) y que ambos casos lo consuman.

- **C6** 🟡 — `MERMA` es un valor de `TipoMovimiento` declarado en el schema y **nunca usado** por ningún servicio (grep sin resultados fuera de schema/migración).
  **Impacto:** no existe forma de categorizar una merma como evento distinto de un ajuste; las mermas reales quedan escondidas dentro de C4/C5, sin trazabilidad propia.
  **Fix propuesto:** una vez resueltos C4/C5, dar la opción explícita de marcar un movimiento como `MERMA` (con motivo) en vez de un "ajuste" genérico.

- **C7** 🟡 — `costo` de `Producto` es un campo de solo escritura: se captura al crear el producto ([bodega.servicio.ts:324](backend/src/servicios/bodega.servicio.ts#L324), formulario en `GestorInventario.tsx`) pero ningún servicio lo cruza con `precio_venta` para margen o rentabilidad.
  **Impacto:** el negocio puede asumir que tiene visibilidad de margen por producto (existen ambos campos en el mismo modelo) pero no hay ningún reporte que los combine.
  **Fix propuesto:** si hay interés real en reportes de margen, agregar el cálculo en algún reporte de bodega/admin; si no, no es un bug sino una función no construida — confirmar con el usuario si vale la pena.

- **C8** 🟢 — `PATCH /inventario/:pdvId` (`actualizarInventario`, [inventario.servicio.ts:29-47](backend/src/servicios/inventario.servicio.ts#L29)) es un endpoint vivo, alcanzable por ADMIN/SUPERVISOR/BODEGUERO, sin ningún llamador en el frontend (grep de `apiPatch` no lo referencia).
  **Fix propuesto:** confirmar si sigue siendo necesario; si no, eliminarlo, si sí, conectar la UI que falta.

---

## 3. Finanzas / Proveedores / Cierre Preventivo

- **C9** 🔴 — "Marcar Depositado" ([DepositosFinanzas.tsx:116-117](frontend/src/componentes/admin/DepositosFinanzas.tsx#L116)) manda `{ estado: "CONFIRMADO" }` sin monto. `actualizarDeposito` ([finanzas.servicio.ts:52-68](backend/src/servicios/finanzas.servicio.ts#L52)) hace `montoReal ?? monto_teorico` — sin dato del frontend, copia el teórico como si fuera el real.
  **Impacto:** el control de depósitos nunca verifica cuánto llegó realmente al banco; `faltaDepositar` cae a 0 automáticamente al confirmar, sin importar la realidad. Agrava C2: ni siquiera hay oportunidad de corregir la mezcla efectivo/tarjeta en esta instancia.
  **Fix propuesto:** agregar un campo de monto real al modal de "Marcar Depositado" y enviarlo obligatoriamente.

- **C10** 🟡 — El estado `TRANSFERENCIA` de `Deposito` es inalcanzable desde la UI: tiene badge y filtro en `DepositosFinanzas.tsx`, pero ninguna acción lo dispara (la única mutación posible es `estado: "CONFIRMADO"`).
  **Fix propuesto:** agregar la acción correspondiente, o remover el estado si ya no aplica al modelo de negocio vigente (evaluar junto con C2).

- **C11** 🔴 — Las "Tareas para el vendedor" del Cierre Preventivo ([GestorCierrePreventivo.tsx:346-359](frontend/src/componentes/admin/GestorCierrePreventivo.tsx#L346), campo `notasVendedor`) nunca llegan al vendedor: las rutas GET de `cierrePreventivo` están cerradas a ADMIN/SUPERVISOR ([cierrePreventivo.rutas.ts:18-42](backend/src/rutas/cierrePreventivo.rutas.ts#L18)); el rol VENDEDOR no tiene ninguna vía de API para leerlas.
  **Impacto:** instrucciones operativas explícitas del admin se guardan correctamente pero solo las ve otro admin navegando el historial — nunca el destinatario real. (El checklist y las observaciones internas sí se consumen correctamente; el problema es específico de este campo.)
  **Fix propuesto:** endpoint de solo-lectura scoped a VENDEDOR (su propio PDV) que devuelva la nota vigente, mostrada en `AperturaTurno` o el dashboard POS al reabrir.

- **C12** 🟢 — Datos bancarios del proveedor (banco/tipo_cuenta/numero_cuenta) no viajan junto con la factura: `mapearFactura` ([proveedores.servicio.ts:67-98](backend/src/servicios/proveedores.servicio.ts#L67)) no los incluye, así que el botón "Marcar pagada" ([GestorFacturas.tsx:180-190](frontend/src/componentes/admin/GestorFacturas.tsx#L180)) no puede mostrarlos — el admin debe ir a la pestaña Proveedores a copiarlos.
  **Fix propuesto:** incluir esos campos en la respuesta de la factura y mostrarlos en el modal de pago.

- **C13** 🟢 — El dashboard no consolida "por depositar" ([admin.servicio.ts](backend/src/servicios/admin.servicio.ts)) con "por pagar a proveedores" (`getResumenFacturasMes`, [proveedores.servicio.ts:176-197](backend/src/servicios/proveedores.servicio.ts#L176)) en un neto de caja — son tarjetas separadas, cada una correcta por sí sola.
  **Fix propuesto:** opcional, evaluar con el usuario si vale la pena una tarjeta de posición neta.

---

## 4. RRHH / Dashboard admin

- **C14** 🟡 — "Venta del mes por categoría" en el Dashboard principal sale **siempre vacío**: `admin.servicio.ts` hardcodea `ventaPorCategoria: {}` en `getResumenDiario` ([línea 121](backend/src/servicios/admin.servicio.ts#L121)) y en `getVentasSucursal` (líneas 245, 262) — el modelo stock-flow no guarda venta por categoría, solo `total_calculado`. `PanelAdmin.tsx:496-512` renderiza el bloque (título + contenedor) **sin comprobar si hay datos**, a diferencia de `ControlVentasSucursal.tsx` que sí se protege con `Object.keys(...).length > 0` en varios puntos.
  **Impacto:** cualquier admin que expanda una sucursal ve una tarjeta con encabezado y nada debajo, siempre — parece una función rota, no una ausencia de dato.
  **Fix propuesto (mínimo):** aplicar la misma guarda que ya existe en `ControlVentasSucursal.tsx`. Construir venta-por-categoría real es un proyecto aparte (requeriría persistir detalle por categoría en el cierre).

- **C15** 🟡 — El vendedor no tiene ninguna pantalla propia con su historial de diferencias de caja. `getHistorialFaltantesVendedor` ([admin.servicio.ts:321](backend/src/servicios/admin.servicio.ts#L321)) y `getSeguimientoVendedores` ([rrhh.servicio.ts:358](backend/src/servicios/rrhh.servicio.ts#L358)) son ADMIN/SUPERVISOR-only; no existe un endpoint equivalente scoped al propio vendedor.
  **Impacto:** asimetría de información — el admin ve el acumulado de faltantes/sobrantes que afecta la Nómina de cada vendedora, pero ella no puede auditarlo ni disputarlo con datos propios.
  **Fix propuesto:** endpoint tipo `GET /pos/turnos/mios` con el historial de turnos cerrados propios y su `diferencia_caja`, más una pantalla simple en el layout POS.

- **C16** 🟡 — La grilla de horarios no distingue "turno futuro" de "inasistencia real". `getHorarios` ([rrhh.servicio.ts:160-222](backend/src/servicios/rrhh.servicio.ts#L160)) ya arma `vendedorPlaneado` vs `vendedorReal` por fecha, pero el render de celda en `HorariosVendedoras.tsx:1833-1864` pinta el mismo badge sin comparar contra la fecha de hoy.
  **Impacto:** un no-show de la semana pasada se ve visualmente idéntico a un turno programado para la próxima semana; no hay alerta agregada de inasistencias pese a que el backend ya tiene el dato necesario.
  **Fix propuesto:** comparar la fecha de la celda contra "hoy" (vía `tiempoChile.ts`) y agregar un tercer estado visual ("no llegó") cuando la fecha ya pasó y `vendedorReal` es `null`.

---

## 5. Auth / Usuarios / Notificaciones

- **C17** 🔴 — `resolverPDVHoy` ([auth.servicio.ts:39-48](backend/src/servicios/auth.servicio.ts#L39)) calcula "hoy" con `new Date(); setUTCHours(0,0,0,0)` — UTC puro, no hora de Chile. No importa ningún helper de `tiempoChile.ts`. Corre en **cada login y cada `/auth/me`**.
  **Impacto:** durante la ventana de ~20:00 a 23:59 hora Chile (Chile va 3-4h detrás de UTC), el día calendario en UTC ya avanzó al día siguiente — un login o refresco de sesión en esa ventana puede resolver el PDV planeado para **mañana** en vez de hoy. Bug de zona horaria nuevo, no catalogado en R4 (que lista otros 12 sitios), y más sensible que esos porque determina en qué sucursal opera el POS.
  **Fix propuesto:** reemplazar el cálculo manual por los helpers de `tiempoChile.ts` (`rangoFechaChile(fechaHoyChile())`), igual que se adoptó en A6 para otros servicios.

- **C18** 🔴 — El mismo `resolverPDVHoy` no filtra `publicado: true` en la consulta de `TurnoPlaneado` ([líneas 45-48](backend/src/servicios/auth.servicio.ts#L45)).
  **Impacto:** un vendedor puede quedar resuelto a una sucursal que el admin todavía no confirmó (reasignación en la grilla sin apretar "Publicar"). Se agrava porque `actualizarTurnoPlaneado` (drag-and-drop, [rrhh.servicio.ts:224-231](backend/src/servicios/rrhh.servicio.ts#L224)) no revierte `publicado` a `false` ni reenvía aviso al reasignar un día ya publicado.
  **Fix propuesto:** agregar `publicado: true` al `where`; decidir el fallback si el turno planeado de hoy existe pero no está publicado (¿usar el `pdv_id` fijo del perfil?).

- **C19** 🔴 — Desactivar un VENDEDOR con turno `ABIERTO` lo deja huérfano: `cambiarEstadoUsuario` no revisa turnos abiertos antes de `activo=false`; `autenticar.ts:52-60` revoca la sesión de inmediato (401 en todo endpoint); `abrirTurno` bloquea un turno nuevo en ese PDV mientras el huérfano siga `ABIERTO`. No existe pantalla admin para cerrar el turno de otra persona con datos reales (el único caller de `cerrarTurno` en el frontend lee del `useCajaStore` local del navegador del vendedor ya bloqueado).
  **Impacto:** el PDV completo queda inoperable hasta corregir a mano en la base de datos.
  **Fix propuesto:** verificar turno abierto antes de desactivar (advertir/bloquear), o construir una pantalla de "cierre administrativo" que permita declarar los datos del cierre en nombre del vendedor desactivado.

- **C20** 🟡 — Notificaciones para ADMIN/SUPERVISOR se crean y nunca se muestran: `gastoAutorizacion.servicio.ts:24-31` y `bodega.servicio.ts:601-617` crean `Notificacion` dirigidas a esos roles, pero `PanelNotificaciones.tsx` solo está montado en `BarraLateral.tsx` (layout POS de VENDEDOR/BODEGUERO) — `LayoutAdmin.tsx` no tiene campana ni panel equivalente.
  **Fix propuesto:** montar `PanelNotificaciones` (o una versión adaptada) también en `LayoutAdmin.tsx`.

- **C21** 🟢 — `es_demo` es invisible en el CRUD de usuarios: `formatearUsuario` ([usuarios.servicio.ts](backend/src/servicios/usuarios.servicio.ts)) no lo devuelve; `GestorUsuarios.tsx` no lo modela ni lo muestra.
  **Fix propuesto:** agregar `esDemo` a `formatearUsuario` y una columna/badge en `GestorUsuarios.tsx`.

---

## Descartado explícitamente (verificado, no es un bug)

- Los IDs de PDV hardcodeados en `frontend/src/datos/mock.admin.datos.ts` (señalados como riesgo teórico en R10) **no se usan en ningún flujo real** — código huérfano sin consumidores; el cálculo de bonos usa el `pdv_id` real de la API en todo momento.
- `pago_diario` sí está expuesto y es editable en el formulario de RRHH (`ModuloRRHH.tsx`).
- No hay fuga de datos mock/demo en pantallas de producción (Dashboard, RRHH) — el modo demo está correctamente aislado detrás de `localStorage.esDemo`.
- No existe flujo de "olvidé mi contraseña" ni se insinúa en el login — es una limitación de producto aceptada (cambio de clave es admin-driven), no una promesa rota.
- `permisos.ts` del frontend no es consumido por ninguno de los módulos de esta fase (RRHH, dashboard) — consistente con P2, ya documentado, sin divergencia nueva.

---

## Tabla consolidada

| # | Sev. | Dominio | Descripción | Fix |
|---|:---:|---------|-------------|-----|
| C1  | 🔴🧭 | Turno/Caja | Saldo inicial no hereda el cierre anterior del mismo PDV | Precargar desde último cierre; definir fórmula (D5) |
| C2  | 🔴 | Turno/Caja | "A depositar" mezcla efectivo+tarjeta+transferencia; `calcularADepositar` sin usar | Usarla en `cerrarTurno` |
| C3  | 🔴🧭 | Turno/RRHH | Recepción del admin no genera pago; Nómina ignora `recepcion_confirmada` | Modelo de pago + decisión de unidad de pago (D6) |
| C4  | 🔴 | Bodega | Cierre de turno sobrescribe stock sin historial | Registrar en `HistorialInventario` |
| C5  | 🔴 | Bodega | Ajuste manual de stock sin historial | Mismo patrón que C4 |
| C6  | 🟡 | Bodega | `MERMA` enum muerto | Flujo explícito de merma |
| C7  | 🟡 | Bodega | `costo` de solo escritura, sin reporte de margen | Reporte margen o descartar |
| C8  | 🟢 | Bodega | `PATCH /inventario/:pdvId` sin UI | Conectar o eliminar |
| C9  | 🔴 | Finanzas | "Marcar Depositado" no captura monto real | Campo de monto real obligatorio |
| C10 | 🟡 | Finanzas | Estado `TRANSFERENCIA` inalcanzable | Agregar acción o quitar estado |
| C11 | 🔴 | Cierre Prev. | Notas al vendedor nunca llegan al vendedor | Endpoint de lectura scoped a VENDEDOR |
| C12 | 🟢 | Proveedores | Datos bancarios ausentes al pagar factura | Incluir en respuesta + modal |
| C13 | 🟢 | Dashboard | Sin neto consolidado depósitos/facturas | Opcional, evaluar interés |
| C14 | 🟡 | Dashboard | "Venta por categoría" siempre vacío, sin guarda | Guarda de "sin datos" |
| C15 | 🟡 | RRHH | Vendedor sin historial propio de diferencias | Endpoint scoped `/pos/turnos/mios` |
| C16 | 🟡 | RRHH | Grilla no distingue turno futuro de inasistencia | Comparar contra fecha de hoy |
| C17 | 🔴 | Auth | `resolverPDVHoy` usa UTC en vez de hora Chile | Adoptar `tiempoChile.ts` |
| C18 | 🔴 | Auth | `resolverPDVHoy` no filtra `publicado` | Agregar filtro |
| C19 | 🔴 | Usuarios | Desactivar vendedor con turno abierto lo deja huérfano | Chequeo previo o cierre administrativo |
| C20 | 🟡 | Notif. | Notificaciones admin/supervisor nunca se muestran | Montar panel en `LayoutAdmin` |
| C21 | 🟢 | Usuarios | `es_demo` invisible en CRUD | Exponer en backend + frontend |

**10 Alto · 7 Medio · 4 Bajo.** Se integran al backlog priorizado en `04-plan.md`.

## No determinable sin ejecutar

- El impacto real de C17/C18 (ventana horaria UTC, turnos no publicados) depende de cuántos vendedores rotan de sucursal en la práctica — si la mayoría tiene `pdv_id` fijo y rara vez hay `TurnoPlaneado` para "hoy", el radio de explosión es menor.
- No se verificó en runtime si existen hoy turnos huérfanos (C19) o vendedores con `TurnoPlaneado` sin publicar activos en producción.

---

**FASE 5 COMPLETA.** Con esto quedan revisados con esta lupa todos los dominios de negocio del sistema (turno/caja, bodega/stock, finanzas/proveedores/cierre preventivo, RRHH/dashboard, auth/usuarios/notificaciones). Entregable: este archivo + actualización de `04-plan.md` y `ESTADO.md`.
