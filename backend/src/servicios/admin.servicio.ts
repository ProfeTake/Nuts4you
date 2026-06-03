import prisma from '../config/prisma'

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

function rangoFechaChile(fecha: string): { inicio: Date; fin: Date } {
  const inicio = new Date(`${fecha}T00:00:00-04:00`)
  const fin    = new Date(`${fecha}T23:59:59.999-04:00`)
  return { inicio, fin }
}

function rangoMesChile(mes: string): { inicio: Date; fin: Date; diasMes: number; diasTranscurridos: number } {
  const [anio, mesNum] = mes.split('-').map(Number)
  const diasMes = new Date(anio, mesNum, 0).getDate()
  const inicio  = new Date(`${mes}-01T00:00:00-04:00`)
  const fin     = new Date(`${mes}-${String(diasMes).padStart(2, '0')}T23:59:59.999-04:00`)

  const ahora       = new Date()
  const ahoraMes    = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
  const diasTrab    = ahoraMes === mes ? ahora.getDate() : diasMes

  return { inicio, fin, diasMes, diasTranscurridos: diasTrab }
}

function fechaHaceNDias(n: number, desde: Date): string {
  const chileMs = desde.getTime() - n * 86_400_000 - 4 * 3_600_000
  return new Date(chileMs).toISOString().split('T')[0]
}

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

  // 4. Ventas últimos 7 días (suma de total_calculado de turnos cerrados por día)
  const hoyDate = new Date()
  const ultimos7: { dia: string; fecha: string; monto: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const fechaDia = fechaHaceNDias(i, hoyDate)
    const { inicio: inicioD, fin: finD } = rangoFechaChile(fechaDia)
    const turnosDiaI = await prisma.turnoCaja.findMany({
      where:  { fecha_apertura: { gte: inicioD, lte: finD }, estado: 'CERRADO' },
      select: { total_calculado: true },
    })
    const monto = turnosDiaI.reduce((s, t) => s + (t.total_calculado ?? 0), 0)
    ultimos7.push({ dia: diaSemana(fechaDia), fecha: fechaDia, monto })
  }

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
    include: { usuario: { select: { nombre: true } } },
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
    turnoId:           turno.id,
    estado:            turno.estado,
    vendedor:          turno.usuario?.nombre ?? 'Usuario eliminado',
    ventasPorCategoria,
    totalVentas,
    ventaEfectivo:     turno.venta_efectivo     ?? 0,
    efectivoDeclarado: turno.efectivo_declarado  ?? 0,
    diferenciaCaja:    turno.diferencia_caja     ?? 0,
    saldoInicial:      turno.saldo_inicial,
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

// ─── Registro diario ──────────────────────────────────────────────────────────

export async function guardarRegistroDiario(pdvId: number, fecha: string, datos: unknown) {
  const fechaDate = new Date(`${fecha}T12:00:00Z`)
  return prisma.registroDiario.upsert({
    where:  { pdv_id_fecha: { pdv_id: pdvId, fecha: fechaDate } },
    update: { datos: datos as never },
    create: { pdv_id: pdvId, fecha: fechaDate, datos: datos as never },
  })
}

export async function getRegistroDiario(pdvId: number, fecha: string) {
  const fechaDate = new Date(`${fecha}T12:00:00Z`)
  return prisma.registroDiario.findUnique({
    where: { pdv_id_fecha: { pdv_id: pdvId, fecha: fechaDate } },
  })
}
