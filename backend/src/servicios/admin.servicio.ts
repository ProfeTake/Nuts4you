import prisma from '../config/prisma'
import { rangoFechaChile, rangoMesChile, fechaHaceNDiasChile } from '../lib/tiempoChile'

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
  if (existe) throw new Error(`Ya existe un punto de venta con el nombre "${nombre}"`)
  return prisma.pDV.create({
    data:   { nombre, tipo, activo: true },
    select: { id: true, nombre: true, tipo: true, activo: true },
  })
}

export async function editarPDV(id: number, nombre: string) {
  const pdv = await prisma.pDV.findUnique({ where: { id } })
  if (!pdv) throw new Error('Punto de venta no encontrado')
  const duplicado = await prisma.pDV.findFirst({ where: { nombre: { equals: nombre }, id: { not: id } } })
  if (duplicado) throw new Error(`Ya existe otro punto de venta con el nombre "${nombre}"`)
  return prisma.pDV.update({
    where:  { id },
    data:   { nombre },
    select: { id: true, nombre: true, tipo: true, activo: true },
  })
}

export async function toggleEstadoPDV(id: number, activo: boolean) {
  const pdv = await prisma.pDV.findUnique({ where: { id } })
  if (!pdv) throw new Error('Punto de venta no encontrado')
  if (!activo) {
    const turnoAbierto = await prisma.turnoCaja.findFirst({ where: { pdv_id: id, estado: 'ABIERTO' } })
    if (turnoAbierto) throw new Error('No se puede desactivar: hay un turno abierto en esta sucursal')
  }
  return prisma.pDV.update({
    where:  { id },
    data:   { activo },
    select: { id: true, nombre: true, tipo: true, activo: true },
  })
}

export async function eliminarPDV(id: number) {
  const pdv = await prisma.pDV.findUnique({ where: { id } })
  if (!pdv) throw new Error('Punto de venta no encontrado')
  const tieneHistorial = await prisma.turnoCaja.count({ where: { pdv_id: id } })
  if (tieneHistorial > 0) {
    throw new Error('No se puede eliminar: el punto de venta tiene historial de turnos. Usa "Desactivar" en su lugar.')
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
  const depositosPend = await prisma.deposito.aggregate({
    where: { estado: 'PENDIENTE' },
    _sum:  { monto_teorico: true },
  })
  const pendienteDeposito = depositosPend._sum.monto_teorico ?? 0

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
          depositos: { select: { monto_teorico: true, estado: true } },
          usuario:   { select: { nombre: true } },
        },
      },
    },
    orderBy: { nombre: 'asc' },
  })
  const sucursalesHoy = pdvsHoy.map((p) => {
    const ventaHoy = p.turnos.reduce((s, t) => s + (t.total_calculado ?? 0), 0)
    const depositoPendiente = p.turnos.reduce(
      (s, t) => s + t.depositos.filter((d) => d.estado === 'PENDIENTE').reduce((s2, d) => s2 + d.monto_teorico, 0),
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

  const turno = await prisma.turnoCaja.findFirst({
    where:   { pdv_id: pdvId, fecha_apertura: { gte: inicio, lte: fin } },
    include: { usuario: { select: { id: true, nombre: true, pago_diario: true } } },
  })
  if (!turno) return null

  // Ventas del turno — se usa total_calculado (stock-flow, sin detalle por categoría)
  const ventasPorCategoria: Record<string, number> = {}
  const totalVentas = turno.total_calculado ?? 0

  // Retiros del turno
  const retirosAgg = await prisma.retiroTurno.aggregate({
    where: { turno_id: turno.id },
    _sum:  { monto: true },
  })
  const totalRetiros = retirosAgg._sum.monto ?? 0

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
    pagoDiario:          turno.usuario?.pago_diario ?? 28000,
    ventasPorCategoria,
    totalVentas,
    ventaEfectivo:       turno.venta_efectivo       ?? 0,
    ventaTarjeta:        turno.venta_tarjeta         ?? 0,
    ventaTransferencia:  turno.venta_transferencia   ?? 0,
    efectivoDeclarado:   turno.efectivo_declarado    ?? 0,
    diferenciaCaja:      turno.diferencia_caja       ?? 0,
    saldoInicial:        turno.saldo_inicial,
    totalRetiros,
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

// ─── Registro diario ──────────────────────────────────────────────────────────
// Las funciones guardarRegistroDiario/getRegistroDiario viven en reporte.servicio.ts
// (las rutas las importan de ahí). Aquí estaban duplicadas y se eliminaron.
