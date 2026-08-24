import prisma from '../config/prisma'
import { conflicto, noEncontrado } from '../lib/errores'
import { rangoFechaChile, rangoMesChile, fechaHaceNDiasChile, fechaHoyChile, diaChileDe } from '../lib/tiempoChile'
import { getConfigSueldos, pagoDiarioDe } from './configNomina.servicio'

// ─── PDVs ─────────────────────────────────────────────────────────────────────

export async function getPDVs(todos = false) {
  return prisma.pDV.findMany({
    where:   todos ? undefined : { tipo: 'PUNTO_VENTA', activo: true },
    select:  { id: true, nombre: true, tipo: true, activo: true },
    orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
  })
}

export async function crearPDV(nombre: string, tipo: 'PUNTO_VENTA' | 'BODEGA') {
  const existe = await prisma.pDV.findFirst({ where: { nombre: { equals: nombre } } })
  if (existe) throw conflicto(`Ya existe un punto de venta con el nombre "${nombre}"`)
  return prisma.pDV.create({
    data:   { nombre, tipo, activo: true },
    select: { id: true, nombre: true, tipo: true, activo: true },
  })
}

export async function editarPDV(id: number, nombre: string) {
  const pdv = await prisma.pDV.findUnique({ where: { id } })
  if (!pdv) throw noEncontrado('Punto de venta')
  const duplicado = await prisma.pDV.findFirst({ where: { nombre: { equals: nombre }, id: { not: id } } })
  if (duplicado) throw conflicto(`Ya existe otro punto de venta con el nombre "${nombre}"`)
  return prisma.pDV.update({
    where:  { id },
    data:   { nombre },
    select: { id: true, nombre: true, tipo: true, activo: true },
  })
}

export async function toggleEstadoPDV(id: number, activo: boolean) {
  const pdv = await prisma.pDV.findUnique({ where: { id } })
  if (!pdv) throw noEncontrado('Punto de venta')
  if (!activo) {
    const turnoAbierto = await prisma.turnoCaja.findFirst({ where: { pdv_id: id, estado: 'ABIERTO' } })
    if (turnoAbierto) throw conflicto('No se puede desactivar: hay un turno abierto en esta sucursal')
  }
  return prisma.pDV.update({
    where:  { id },
    data:   { activo },
    select: { id: true, nombre: true, tipo: true, activo: true },
  })
}

export async function eliminarPDV(id: number) {
  const pdv = await prisma.pDV.findUnique({ where: { id } })
  if (!pdv) throw noEncontrado('Punto de venta')
  const tieneHistorial = await prisma.turnoCaja.count({ where: { pdv_id: id } })
  if (tieneHistorial > 0) {
    throw conflicto('No se puede eliminar: el punto de venta tiene historial de turnos. Usa "Desactivar" en su lugar.')
  }
  await prisma.pDV.delete({ where: { id } })
}

// ─── Helpers de fecha ─────────────────────────────────────────────────────────
// rangoFechaChile, rangoMesChile y fechaHaceNDiasChile viven en lib/tiempoChile
// (DST-aware). Aquí solo queda el helper de etiqueta de día de semana.

function diaSemana(fechaISO: string): string {
  const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const d = new Date(`${fechaISO}T12:00:00Z`)
  return dias[d.getUTCDay()]
}

// ─── Resumen diario (dashboard) ───────────────────────────────────────────────

export async function getResumenDiario(fecha: string) {
  const { inicio, fin } = rangoFechaChile(fecha)
  const mes = fecha.slice(0, 7)
  const { inicio: inicioMes, fin: finMes, diasMes, diasTranscurridos } = rangoMesChile(mes)

  // 1. Venta total del día (suma de total_calculado de turnos cerrados del día)
  const turnosDia = await prisma.turnoCaja.findMany({
    where:  { fecha_apertura: { gte: inicio, lte: fin }, estado: 'CERRADO' },
    select: { total_calculado: true },
  })
  const ventaTotalDia = turnosDia.reduce((s, t) => s + (t.total_calculado ?? 0), 0)

  // 2. Faltantes del mes (diferencias negativas en cierres)
  const turnosCerrados = await prisma.turnoCaja.findMany({
    where:  { fecha_apertura: { gte: inicioMes, lte: finMes }, estado: 'CERRADO', diferencia_caja: { lt: 0 } },
    select: { diferencia_caja: true },
  })
  const faltantesMes = turnosCerrados.reduce((s, t) => s + Math.abs(t.diferencia_caja ?? 0), 0)
  const turnosFaltante = turnosCerrados.length

  // 3. Ventas del mes por sucursal con proyección (usando total_calculado)
  const pdvsMes = await prisma.pDV.findMany({
    where:   { tipo: 'PUNTO_VENTA' },
    include: {
      turnos: {
        where:   { fecha_apertura: { gte: inicioMes, lte: finMes } },
        select:  { total_calculado: true },
      },
    },
    orderBy: { nombre: 'asc' },
  })

  const ventasMensualesPorSucursal = pdvsMes.map((p) => {
    let ventaTotal = 0
    let diasConVenta = 0

    for (const turno of p.turnos) {
      const ventaTurno = turno.total_calculado ?? 0
      if (ventaTurno > 0) diasConVenta++
      ventaTotal += ventaTurno
    }

    const promedioDiario = diasConVenta > 0 ? Math.round(ventaTotal / diasConVenta) : 0
    const proyeccionMes  = promedioDiario > 0 ? promedioDiario * diasMes : 0

    return {
      pdvId: p.id,
      sucursal: p.nombre,
      ventaTotal,
      ventaPorCategoria: {} as Record<string, number>,
      promedioDiario,
      proyeccionMes,
      diasConVenta,
    }
  })

  // 4. Ventas últimos 7 días — una sola query, agrupada en memoria por día chileno
  //    (antes: 7 queries en loop = patrón N+1).
  const fechasUltimos7 = Array.from({ length: 7 }, (_, k) => fechaHaceNDiasChile(6 - k))
  const { inicio: inicio7 } = rangoFechaChile(fechasUltimos7[0])
  const { fin: fin7 }       = rangoFechaChile(fechasUltimos7[6])

  const turnos7 = await prisma.turnoCaja.findMany({
    where:  { fecha_apertura: { gte: inicio7, lte: fin7 }, estado: 'CERRADO' },
    select: { fecha_apertura: true, total_calculado: true },
  })

  // Mapa fecha-chilena → monto acumulado. El día chileno se obtiene formateando en TZ.
  const fechaChilenaDe = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d)

  const montoPorDia = new Map<string, number>(fechasUltimos7.map((f) => [f, 0]))
  for (const t of turnos7) {
    const dia = fechaChilenaDe(t.fecha_apertura)
    if (montoPorDia.has(dia)) montoPorDia.set(dia, montoPorDia.get(dia)! + (t.total_calculado ?? 0))
  }

  const ultimos7 = fechasUltimos7.map((fechaDia) => ({
    dia:   diaSemana(fechaDia),
    fecha: fechaDia,
    monto: montoPorDia.get(fechaDia) ?? 0,
  }))

  // 5. Depósitos pendientes
  // Neto de los pagos hechos al vendedor con esa misma plata ("Pagar a vendedor"):
  // esa parte se quedó en el punto y nunca va a llegar al banco.
  const depositosPend = await prisma.deposito.aggregate({
    where: { estado: 'PENDIENTE' },
    _sum:  { monto_teorico: true, pago_vendedor: true },
  })
  const pendienteDeposito =
    (depositosPend._sum.monto_teorico ?? 0) - (depositosPend._sum.pago_vendedor ?? 0)

  // 6. Items sin stock en PUNTO_VENTA (deduplicamos por producto en código, no en query)
  const sinStockItems = await prisma.inventario.findMany({
    where:   { stock_actual: 0, pdv: { tipo: 'PUNTO_VENTA' } },
    include: { producto: { select: { nombre: true } } },
  })
  const nombresVistos = new Set<string>()
  const itemsSinStock = sinStockItems
    .map((i) => i.producto.nombre)
    .filter((n) => { if (nombresVistos.has(n)) return false; nombresVistos.add(n); return true })
    .sort()
    .slice(0, 10)

  // 7. Estado de sucursales hoy
  const pdvsHoy = await prisma.pDV.findMany({
    where:   { tipo: 'PUNTO_VENTA' },
    include: {
      turnos: {
        where:   { fecha_apertura: { gte: inicio, lte: fin } },
        include: {
          depositos: { select: { monto_teorico: true, pago_vendedor: true, estado: true } },
          usuario:   { select: { nombre: true } },
        },
      },
    },
    orderBy: { nombre: 'asc' },
  })
  const sucursalesHoy = pdvsHoy.map((p) => {
    const ventaHoy = p.turnos.reduce((s, t) => s + (t.total_calculado ?? 0), 0)
    const depositoPendiente = p.turnos.reduce(
      (s, t) => s + t.depositos.filter((d) => d.estado === 'PENDIENTE').reduce((s2, d) => s2 + d.monto_teorico - d.pago_vendedor, 0),
      0,
    )
    const vendedor = p.turnos[0]?.usuario?.nombre ?? null
    const estado   =
      ventaHoy === 0 && depositoPendiente === 0 ? ('Sin reporte' as const)
      : depositoPendiente > 0                   ? ('Pendiente' as const)
      :                                           ('Al día' as const)
    return { pdvId: p.id, nombre: p.nombre, ventaHoy, depositoPendiente, estado, vendedor }
  })

  // 8. Totales del mes
  const totalMes            = ventasMensualesPorSucursal.reduce((s, p) => s + p.ventaTotal, 0)
  const promedioDiarioTotal = totalMes > 0 && diasTranscurridos > 0 ? Math.round(totalMes / diasTranscurridos) : 0
  const proyeccionTotalMes  = promedioDiarioTotal * diasMes

  return {
    ventaTotalDia,
    pendienteDeposito,
    faltantesMes,
    turnosFaltante,
    alertasBodega: itemsSinStock.length,
    itemsSinStock,
    ventasMensualesPorSucursal,
    ventasUltimos7Dias: ultimos7,
    sucursalesHoy,
    mes,
    totalMes,
    promedioDiarioTotal,
    proyeccionTotalMes,
    diasMes,
    diasTranscurridos,
  }
}

// ─── Ventas por sucursal en una fecha ─────────────────────────────────────────

export async function getVentasSucursal(pdvId: number, fecha: string) {
  const { inicio, fin } = rangoFechaChile(fecha)
  const mes = fecha.slice(0, 7)
  const { inicio: inicioMes, fin: finMes, diasMes, diasTranscurridos } = rangoMesChile(mes)

  // Si hay más de un turno en el día (p. ej. uno abierto y otro cerrado), tomar
  // el más reciente por apertura — findFirst sin orderBy es no determinista.
  const turno = await prisma.turnoCaja.findFirst({
    where:   { pdv_id: pdvId, fecha_apertura: { gte: inicio, lte: fin } },
    orderBy: { fecha_apertura: 'desc' },
    include: { usuario: { select: { id: true, nombre: true, pago_diario: true } } },
  })
  if (!turno) return null

  // Ventas del turno — se usa total_calculado (stock-flow, sin detalle por categoría)
  const ventasPorCategoria: Record<string, number> = {}
  const totalVentas = turno.total_calculado ?? 0

  // Salidas de efectivo del turno: retiros (admin/supervisor) y gastos pagados de
  // la caja. Ambas se muestran en el cuadre para que la escalera cierre leyéndola.
  const [retirosAgg, gastosAgg, { pagoDiarioBase }] = await Promise.all([
    prisma.retiroTurno.aggregate({ where: { turno_id: turno.id }, _sum: { monto: true } }),
    prisma.gastoTurno.aggregate({ where: { turno_id: turno.id }, _sum: { monto: true } }),
    getConfigSueldos(),
  ])
  const totalRetiros = retirosAgg._sum.monto ?? 0
  const totalGastos  = gastosAgg._sum.monto ?? 0

  // ── Depósito del turno y pagos hechos al vendedor con esa caja ──────────────
  // El "a depositar" real vive en el Deposito (lo escribe el cierre); acá se lee
  // en vez de recalcularlo para que el panel muestre exactamente lo que Finanzas
  // va a pedir, ya neteado por los pagos al vendedor (planilla: celda F29).
  const [deposito, pagosVendedor] = await Promise.all([
    prisma.deposito.findFirst({ where: { turno_id: turno.id }, orderBy: { id: 'desc' } }),
    prisma.pagoPersonal.findMany({
      where:   { turno_pago_id: turno.id },
      orderBy: { creado_en: 'asc' },
    }),
  ])
  const pagoVendedorTotal = deposito?.pago_vendedor ?? 0
  const depositoBruto     = deposito?.monto_teorico ?? Math.max(0, turno.efectivo_declarado ?? 0) + totalRetiros
  const depositoBloqueado = deposito != null && (deposito.estado !== 'PENDIENTE' || deposito.monto_real > 0)

  // ── Saldos finales + detalle de ventas declarados al cierre (snapshots) ───────
  // Se resuelven nombres/categorías desde Producto para mostrarlos en el panel.
  const snapshot = (turno.stock_final as { productoId: number; cantidad: number }[] | null) ?? []
  const detalleSnap = (turno.venta_detalle as { productoId: number; cantidad: number; precioUnitario: number }[] | null) ?? []

  // Resolver nombres/categorías de todos los productos referidos (saldos + ventas)
  const idsReferidos = [...new Set([...snapshot.map((s) => s.productoId), ...detalleSnap.map((d) => d.productoId)])]
  const productosRef = idsReferidos.length > 0
    ? await prisma.producto.findMany({ where: { id: { in: idsReferidos } }, include: { categoria: { select: { nombre: true } } } })
    : []
  const porId = new Map(productosRef.map((p) => [p.id, p]))

  const saldosFinales = snapshot.map((s) => ({
    productoId: s.productoId,
    nombre:     porId.get(s.productoId)?.nombre ?? `Producto ${s.productoId}`,
    categoria:  porId.get(s.productoId)?.categoria.nombre ?? '—',
    cantidad:   s.cantidad,
  }))

  // Detalle de ventas por producto (solo los que se vendieron), con subtotal.
  // Sin ordenar acá a propósito: el orden canónico (el del Turno Activo) vive en
  // el frontend, en lib/categorias.compararProductos, y se aplica al renderizar.
  // Antes iba ordenado por subtotal y el admin leía los productos en un orden
  // distinto al que la vendedora los cuenta.
  const detalleVentas = detalleSnap
    .filter((d) => d.cantidad > 0 && d.precioUnitario > 0)
    .map((d) => ({
      productoId:     d.productoId,
      nombre:         porId.get(d.productoId)?.nombre ?? `Producto ${d.productoId}`,
      categoria:      porId.get(d.productoId)?.categoria.nombre ?? '—',
      cantidad:       d.cantidad,
      precioUnitario: d.precioUnitario,
      subtotal:       d.cantidad * d.precioUnitario,
    }))

  // ── Métricas del mes para este PDV ───────────────────────────────────────────

  const turnosMes = await prisma.turnoCaja.findMany({
    where:  { pdv_id: pdvId, fecha_apertura: { gte: inicioMes, lte: finMes } },
    select: { total_calculado: true },
  })

  const categoriasMes: Record<string, number> = {}
  let totalMes      = 0
  let diasConVenta  = 0

  for (const t of turnosMes) {
    const ventaTurno = t.total_calculado ?? 0
    if (ventaTurno > 0) diasConVenta++
    totalMes += ventaTurno
  }

  const promedioDiario = diasConVenta > 0 ? Math.round(totalMes / diasConVenta) : 0
  const proyeccionMes  = promedioDiario > 0 ? promedioDiario * diasMes : 0

  // Faltantes del mes en este PDV
  const faltantesAgg = await prisma.turnoCaja.findMany({
    where:  { pdv_id: pdvId, fecha_apertura: { gte: inicioMes, lte: finMes }, estado: 'CERRADO', diferencia_caja: { lt: 0 } },
    select: { diferencia_caja: true },
  })
  const faltantesMes = faltantesAgg.reduce((s, t) => s + Math.abs(t.diferencia_caja ?? 0), 0)

  return {
    turnoId:             turno.id,
    usuarioId:           turno.usuario?.id ?? null,
    estado:              turno.estado,
    vendedor:            turno.usuario?.nombre ?? 'Usuario eliminado',
    pagoDiario:          pagoDiarioDe(turno.usuario?.pago_diario, pagoDiarioBase),
    ventasPorCategoria,
    totalVentas,
    ventaEfectivo:       turno.venta_efectivo       ?? 0,
    ventaTarjeta:        turno.venta_tarjeta         ?? 0,
    ventaTransferencia:  turno.venta_transferencia   ?? 0,
    efectivoDeclarado:   turno.efectivo_declarado    ?? 0,
    // Efectivo de VENTAS a entregar = todo el efectivo declarado. La caja chica queda
    // FUERA del cuadre (decisión del negocio): el vendedor no la cuenta ni la
    // entrega, se mantiene en el punto. Antes se restaba aquí, lo que dejaba la
    // entrega corta por el monto del fondo cuando el vendedor solo contaba ventas.
    efectivoAEntregar:   Math.max(0, turno.efectivo_declarado ?? 0),
    diferenciaCaja:      turno.diferencia_caja       ?? 0,
    saldoInicial:        turno.saldo_inicial,
    totalRetiros,
    totalGastos,
    // Efectivo que debía quedar en la caja: venta en efectivo − gastos − retiros.
    // Es el término contra el que se compara lo contado (diferencia = contado −
    // esperado), así que la tarjeta del panel puede mostrar la escalera completa.
    esperadoCaja:        (turno.venta_efectivo ?? 0) - totalGastos - totalRetiros,
    // ── A depositar del turno (planilla: P22 = ... − F29 "Pagado a Vendedor") ──
    depositoBruto,
    pagoVendedorTotal,
    aDepositar:          depositoBruto - pagoVendedorTotal,
    // El depósito ya se registró en Finanzas: no admite más descuentos de pagos.
    depositoBloqueado,
    pagosVendedor: pagosVendedor.map((p) => ({
      id:             p.id,
      usuarioId:      p.usuario_id,
      vendedor:       p.usuario_nombre,
      turnosPagados:  p.dias_trabajados,
      montoTotal:     p.monto_total,
      creadoPor:      p.creado_por_nombre,
      creadoEn:       p.creado_en.toISOString(),
    })),
    // ── Recepción del dinero por admin/supervisor (2ª etapa del cierre) ──
    recepcionConfirmada: turno.recepcion_confirmada,
    dineroRecibido:      turno.dinero_recibido       ?? null,
    recibidoPor:         turno.recibido_por_nombre   ?? null,
    fechaRecepcion:      turno.fecha_recepcion?.toISOString() ?? null,
    // Diferencia de recepción vs lo que el vendedor debía entregar (el efectivo de
    // ventas que declaró; la caja chica no participa): recibido − declarado.
    diferenciaRecepcion: turno.dinero_recibido != null
      ? turno.dinero_recibido - Math.max(0, turno.efectivo_declarado ?? 0)
      : null,
    saldosFinales,
    detalleVentas,
    // Métricas del mes
    metricas: {
      totalMes,
      promedioDiario,
      proyeccionMes,
      diasConVenta,
      diasMes,
      diasTranscurridos,
      categoriasMes,
      faltantesMes,
    },
  }
}

// ─── Historial de faltantes por vendedor ─────────────────────────────────────

export async function getHistorialFaltantesVendedor(usuarioId: number) {
  const turnos = await prisma.turnoCaja.findMany({
    where:   { usuario_id: usuarioId, estado: 'CERRADO', diferencia_caja: { lt: 0 } },
    include: { pdv: { select: { nombre: true } } },
    orderBy: { fecha_apertura: 'desc' },
    take:    50,
  })

  return turnos.map(t => ({
    turnoId:     t.id,
    fecha:       t.fecha_apertura.toISOString(),
    pdvNombre:   t.pdv.nombre,
    faltante:    Math.abs(t.diferencia_caja ?? 0),
  }))
}

// ─── Historial de turnos por sucursal ────────────────────────────────────────

export async function getHistorialTurnosSucursal(
  pdvId: number,
  desde: string,
  hasta: string,
  usuarioId?: number,
) {
  const { inicio }  = rangoFechaChile(desde)
  const { fin }     = rangoFechaChile(hasta)

  const turnos = await prisma.turnoCaja.findMany({
    where: {
      pdv_id:          pdvId,
      estado:          'CERRADO',
      fecha_apertura:  { gte: inicio, lte: fin },
      ...(usuarioId ? { usuario_id: usuarioId } : {}),
    },
    include: { usuario: { select: { id: true, nombre: true } } },
    orderBy: { fecha_apertura: 'desc' },
  })

  const vendedoresMap = new Map<number, string>()
  const filas = turnos.map(t => {
    if (t.usuario) vendedoresMap.set(t.usuario.id, t.usuario.nombre)
    return {
      turnoId:           t.id,
      fecha:             t.fecha_apertura.toISOString(),
      vendedor:          t.usuario?.nombre ?? 'Usuario eliminado',
      vendedorId:        t.usuario?.id     ?? null,
      totalVentas:       t.total_calculado     ?? 0,
      ventaEfectivo:     t.venta_efectivo      ?? 0,
      ventaTarjeta:      t.venta_tarjeta       ?? 0,
      ventaTransferencia:t.venta_transferencia ?? 0,
      efectivoDeclarado: t.efectivo_declarado  ?? 0,
      diferenciaCaja:    t.diferencia_caja     ?? 0,
    }
  })

  const vendedores = [...vendedoresMap.entries()].map(([id, nombre]) => ({ id, nombre }))

  return { filas, vendedores }
}

// ─── Turnos abiertos ahora (panel de Sucursales) ─────────────────────────────

/** Días calendario chilenos entre dos fechas `YYYY-MM-DD` (hasta − desde). */
function diasEntre(desde: string, hasta: string) {
  return Math.round(
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000,
  )
}

/**
 * Foto de los turnos ABIERTOS en este momento, con el detalle que el admin
 * necesita para saber cómo va cada punto sin abrir el reporte de cada uno:
 * desde qué fecha/hora está abierto, cuánto lleva, quién lo abrió, con qué caja
 * chica partió y los retiros/gastos registrados durante el turno.
 *
 * `diasAbierto > 0` marca los turnos arrastrados de días anteriores (el vendedor
 * nunca cerró caja): el panel los destaca para cerrarlos administrativamente.
 * Devuelve también los PDV activos SIN turno abierto, con la fecha de su último
 * cierre, para ver de un vistazo qué puntos no están operando.
 */
export async function getTurnosActivosDetalle() {
  const ahora    = Date.now()
  const hoyChile = fechaHoyChile()

  const [turnos, pdvsActivos] = await Promise.all([
    prisma.turnoCaja.findMany({
      where:   { estado: 'ABIERTO', pdv: { tipo: 'PUNTO_VENTA' } },
      include: {
        pdv:     { select: { id: true, nombre: true } },
        usuario: { select: { id: true, nombre: true } },
      },
      orderBy: { fecha_apertura: 'asc' },
    }),
    prisma.pDV.findMany({
      where:   { tipo: 'PUNTO_VENTA', activo: true },
      select:  { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
  ])

  // Retiros y gastos de todos los turnos abiertos en dos consultas agrupadas
  // (no una por turno), porque el panel se refresca en intervalo.
  const retirosPorTurno = new Map<number, { total: number; cantidad: number }>()
  const gastosPorTurno  = new Map<number, { total: number; cantidad: number }>()

  const idsTurnos = turnos.map((t) => t.id)
  if (idsTurnos.length > 0) {
    const [retiros, gastos] = await Promise.all([
      prisma.retiroTurno.groupBy({
        by:     ['turno_id'],
        where:  { turno_id: { in: idsTurnos } },
        _sum:   { monto: true },
        _count: { _all: true },
      }),
      prisma.gastoTurno.groupBy({
        by:     ['turno_id'],
        where:  { turno_id: { in: idsTurnos } },
        _sum:   { monto: true },
        _count: { _all: true },
      }),
    ])
    for (const r of retiros) {
      retirosPorTurno.set(r.turno_id, { total: r._sum.monto ?? 0, cantidad: r._count._all })
    }
    for (const g of gastos) {
      gastosPorTurno.set(g.turno_id, { total: g._sum.monto ?? 0, cantidad: g._count._all })
    }
  }

  const activos = turnos.map((t) => {
    const retiro      = retirosPorTurno.get(t.id) ?? { total: 0, cantidad: 0 }
    const gasto       = gastosPorTurno.get(t.id)  ?? { total: 0, cantidad: 0 }
    const diaApertura = diaChileDe(t.fecha_apertura)

    return {
      turnoId:        t.id,
      pdvId:          t.pdv_id,
      pdvNombre:      t.pdv.nombre,
      vendedor:       t.usuario?.nombre ?? 'Usuario eliminado',
      vendedorId:     t.usuario?.id ?? null,
      // Instante exacto de apertura + día calendario chileno al que pertenece
      // (el segundo es el que sirve para consultar el reporte del turno).
      fechaApertura:  t.fecha_apertura.toISOString(),
      diaApertura,
      minutosAbierto: Math.max(0, Math.round((ahora - t.fecha_apertura.getTime()) / 60_000)),
      diasAbierto:    diasEntre(diaApertura, hoyChile),
      saldoInicial:   t.saldo_inicial,
      totalRetiros:   retiro.total,
      cantidadRetiros: retiro.cantidad,
      totalGastos:    gasto.total,
      cantidadGastos: gasto.cantidad,
    }
  })

  // ── PDV activos sin turno abierto + su último cierre ────────────────────────
  const pdvsConTurno = new Set(turnos.map((t) => t.pdv_id))
  const sinTurno     = pdvsActivos.filter((p) => !pdvsConTurno.has(p.id))

  const ultimosCierres = sinTurno.length > 0
    ? await prisma.turnoCaja.groupBy({
        by:    ['pdv_id'],
        where: { pdv_id: { in: sinTurno.map((p) => p.id) }, estado: 'CERRADO' },
        _max:  { fecha_cierre: true },
      })
    : []
  const cierrePorPdv = new Map(ultimosCierres.map((c) => [c.pdv_id, c._max.fecha_cierre]))

  return {
    turnos:    activos,
    totalPdvs: pdvsActivos.length,
    pdvsSinTurno: sinTurno.map((p) => ({
      pdvId:        p.id,
      pdvNombre:    p.nombre,
      ultimoCierre: cierrePorPdv.get(p.id)?.toISOString() ?? null,
    })),
  }
}

