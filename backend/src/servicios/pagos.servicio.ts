import prisma from '../config/prisma'
import { ErrorApp, conflicto, noEncontrado } from '../lib/errores'
import { diaChileDe, rangoFechaChile } from '../lib/tiempoChile'
import { calcularBono } from './calculos.servicio'
import { getTramosBonoActivosPorPdv, tramosParaPdv } from './configBono.servicio'
import {
  calcularDescuentoCaja, calcularMontoExtra, calcularTotalPago, getConfigSueldos,
  pagoDiarioDe, type ConfigSueldos,
} from './configNomina.servicio'

/**
 * Pagos de personal por rango flexible (C3/A39, decisión D6).
 *
 * El admin elige el rango (un día, una semana, un mes — sin config fija) y
 * genera un PagoPersonal por vendedor con sus turnos de ese rango. Reglas:
 * - Solo turnos CERRADOS **con recepción confirmada** (el dinero ya fue contado
 *   en mano por el admin — antes la Nómina pagaba sin este check, C3).
 * - Solo turnos sin pago previo (`pago_id` null): guarda anti doble-pago.
 * - El cálculo replica la planilla del cliente celda por celda (ver
 *   configNomina.servicio): Σ (pago diario + bono + extra) − descuento de caja
 *   + adicional − cotizaciones. El descuento aplica la tolerancia del Excel:
 *   se suman TODAS las diferencias del período con signo y solo se descuenta si el
 *   neto queda peor que la tolerancia. Antes se descontaba cada faltante completo,
 *   turno por turno, lo que cobraba de más frente a la planilla del cliente.
 */

/** Ajuste manual del período por vendedor (planilla, celdas H163 y H164). */
export interface AjustePago {
  adicional:    number
  cotizaciones: number
}

const AJUSTE_VACIO: AjustePago = { adicional: 0, cotizaciones: 0 }

interface TurnoElegible {
  id: number
  fecha_apertura: Date
  total_calculado: number | null
  diferencia_caja: number | null
  extra_decimas: number
  usuario: { id: number; nombre: string; pago_diario: number | null } | null
  pdv:     { id: number; nombre: string }
}

/** Query compartida entre el resumen (preview) y la generación. */
async function getTurnosElegibles(desde: string, hasta: string): Promise<TurnoElegible[]> {
  const inicio = rangoFechaChile(desde).inicio
  const fin    = rangoFechaChile(hasta).fin
  if (inicio > fin) throw new ErrorApp('El rango de fechas es inválido (desde > hasta)')

  return prisma.turnoCaja.findMany({
    where: {
      estado:               'CERRADO',
      recepcion_confirmada: true,
      pago_id:              null,
      fecha_apertura:       { gte: inicio, lte: fin },
      usuario:              { rol: { nombre: 'VENDEDOR' } },
    },
    orderBy: { fecha_apertura: 'asc' },
    select: {
      id: true, fecha_apertura: true, total_calculado: true, diferencia_caja: true,
      extra_decimas: true,
      usuario: { select: { id: true, nombre: true, pago_diario: true } },
      pdv:     { select: { id: true, nombre: true } },
    },
  })
}

/**
 * Agrupa turnos elegibles por vendedor con el cálculo completo de la planilla.
 *
 * Devuelve además el DETALLE de turnos de cada vendedor: la UI de liquidación
 * necesita listarlos para poder cargarles el "Adicional"/Extra fila por fila,
 * igual que la columna E del Excel.
 */
function agruparPorVendedor(
  turnos: TurnoElegible[],
  tramosPorPdv: Awaited<ReturnType<typeof getTramosBonoActivosPorPdv>>,
  config: ConfigSueldos,
  ajustes?: Map<number, AjustePago>,
) {
  const porUsuario = new Map<number, {
    nombre: string; pagoDiario: number; turnoIds: number[]
    ventaTotal: number; bonos: number; extras: number; diferencias: number[]
    turnos: TurnoPendiente[]
  }>()

  for (const t of turnos) {
    if (!t.usuario) continue // huérfano: sin destinatario del pago, se omite
    const detalle = valorizarTurno(t, tramosPorPdv, config)

    const e = porUsuario.get(t.usuario.id) ?? {
      nombre: t.usuario.nombre, pagoDiario: pagoDiarioDe(t.usuario.pago_diario, config.pagoDiarioBase),
      turnoIds: [], ventaTotal: 0, bonos: 0, extras: 0, diferencias: [] as number[],
      turnos: [] as TurnoPendiente[],
    }
    e.turnoIds.push(t.id)
    e.ventaTotal += detalle.venta
    e.bonos      += detalle.bono
    e.extras     += detalle.montoExtra
    // Se guarda CON SIGNO: el descuento se resuelve sobre el neto del período,
    // no turno a turno, para que un sobrante compense un faltante (regla del Excel).
    e.diferencias.push(detalle.diferenciaCaja)
    e.turnos.push(detalle)
    porUsuario.set(t.usuario.id, e)
  }

  return [...porUsuario.entries()]
    .sort(([, a], [, b]) => a.nombre.localeCompare(b.nombre, 'es'))
    .map(([usuarioId, e]) => {
      const montoBase  = e.turnoIds.length * e.pagoDiario
      const descuentos = calcularDescuentoCaja(e.diferencias, config.toleranciaFaltante)
      const ajuste     = ajustes?.get(usuarioId) ?? AJUSTE_VACIO
      return {
        usuarioId,
        nombre:            e.nombre,
        diasTrabajados:    e.turnoIds.length,
        turnoIds:          e.turnoIds,
        pagoDiario:        e.pagoDiario,
        montoBase,
        montoBonos:        e.bonos,
        montoExtras:       e.extras,
        montoDescuentos:   descuentos,
        montoAdicional:    ajuste.adicional,
        montoCotizaciones: ajuste.cotizaciones,
        // Neto de caja del período (informativo): permite mostrar en la UI que
        // hubo descuadres aunque no alcanzaran a generar descuento.
        netoCaja:          e.diferencias.reduce((s, d) => s + d, 0),
        montoTotal:        calcularTotalPago({
          montoBase,
          montoBonos:        e.bonos,
          montoExtras:       e.extras,
          montoDescuentos:   descuentos,
          montoAdicional:    ajuste.adicional,
          montoCotizaciones: ajuste.cotizaciones,
        }),
        turnos:            e.turnos,
      }
    })
}

/**
 * Preview del pago de un rango: qué se pagaría a cada vendedor, más el conteo
 * de turnos cerrados SIN recepción confirmada (aviso: no entran al pago hasta
 * que el admin confirme la recepción del dinero).
 */
export async function getResumenPago(desde: string, hasta: string) {
  const [turnos, tramosPorPdv, config, sinRecepcion] = await Promise.all([
    getTurnosElegibles(desde, hasta),
    getTramosBonoActivosPorPdv(),
    getConfigSueldos(),
    prisma.turnoCaja.count({
      where: {
        estado:               'CERRADO',
        recepcion_confirmada: false,
        pago_id:              null,
        fecha_apertura:       { gte: rangoFechaChile(desde).inicio, lte: rangoFechaChile(hasta).fin },
        usuario:              { rol: { nombre: 'VENDEDOR' } },
      },
    }),
  ])

  return {
    desde,
    hasta,
    vendedores:          agruparPorVendedor(turnos, tramosPorPdv, config),
    turnosSinRecepcion:  sinRecepcion,
    // La UI necesita los parámetros para prellenar el formulario de liquidación
    // (cotizaciones sugeridas) y para explicar de dónde salen los montos.
    ...config,
  }
}

/**
 * Genera los pagos del rango en una transacción: un PagoPersonal por vendedor
 * + marca sus turnos con pago_id. Si dos admins generan a la vez, el updateMany
 * con guardia `pago_id: null` hace que solo uno marque cada turno; si el conteo
 * no coincide, la transacción completa se revierte (sin pagos a medias).
 */
export async function generarPagos(
  desde: string,
  hasta: string,
  creadoPor: { id: number; nombre: string },
  ajustes?: Map<number, AjustePago>,
  usuarioIds?: number[],
) {
  const [turnos, tramosPorPdv, config] = await Promise.all([
    getTurnosElegibles(desde, hasta),
    getTramosBonoActivosPorPdv(),
    getConfigSueldos(),
  ])
  const todos = agruparPorVendedor(turnos, tramosPorPdv, config, ajustes)
  // La UI liquida de a una vendedora (una "hoja" de la planilla por persona),
  // así que puede acotar a quién se le genera el pago. Sin filtro, todos.
  const vendedores = usuarioIds
    ? todos.filter((v) => usuarioIds.includes(v.usuarioId))
    : todos

  if (vendedores.length === 0) {
    throw conflicto('No hay turnos con recepción confirmada pendientes de pago en ese rango')
  }

  // Un ajuste puede dejar el pago en cero o negativo (cotizaciones mayores al
  // sueldo). Se corta antes de la transacción: registrar una deuda como si fuera
  // un pago descuadraría el historial.
  const enCero = vendedores.filter((v) => v.montoTotal <= 0)
  if (enCero.length > 0) {
    throw conflicto(
      `El pago calculado no es positivo para: ${enCero.map((v) => v.nombre).join(', ')}. ` +
      'Revisa las cotizaciones y los faltantes de caja antes de generar.',
    )
  }

  const creados = await prisma.$transaction(async (tx) => {
    const pagos = []
    for (const v of vendedores) {
      const pago = await tx.pagoPersonal.create({
        data: {
          usuario_id:         v.usuarioId,
          usuario_nombre:     v.nombre,
          fecha_desde:        new Date(`${desde}T00:00:00Z`),
          fecha_hasta:        new Date(`${hasta}T00:00:00Z`),
          dias_trabajados:    v.diasTrabajados,
          monto_base:         v.montoBase,
          monto_bonos:        v.montoBonos,
          monto_extras:       v.montoExtras,
          monto_descuentos:   v.montoDescuentos,
          monto_adicional:    v.montoAdicional,
          monto_cotizaciones: v.montoCotizaciones,
          monto_total:        v.montoTotal,
          creado_por_nombre:  creadoPor.nombre,
        },
      })
      const marcados = await tx.turnoCaja.updateMany({
        where: { id: { in: v.turnoIds }, pago_id: null },
        data:  { pago_id: pago.id },
      })
      // Race con otra generación simultánea: algún turno ya fue pagado → abortar todo.
      if (marcados.count !== v.turnoIds.length) {
        throw conflicto('Otro pago acaba de tomar parte de estos turnos; recarga y reintenta')
      }
      pagos.push(pago)
    }
    return pagos
  })

  return {
    mensaje:    `${creados.length} pago(s) generado(s)`,
    pagos:      creados.map(mapearPago),
  }
}

/** Historial de pagos generados (más recientes primero). */
export async function getPagos(limite = 100) {
  const pagos = await prisma.pagoPersonal.findMany({
    orderBy: { creado_en: 'desc' },
    take:    Math.min(Math.max(limite, 1), 500),
  })
  return pagos.map(mapearPago)
}

/**
 * Anula un pago generado por error: borra el registro y libera sus turnos
 * (pago_id → null) para que un pago futuro los vuelva a tomar.
 *
 * Si el pago se hizo con el efectivo de un punto ("Pagar a vendedor"), también
 * devuelve el monto al "a depositar" de ese turno: la plata nunca salió de la
 * caja, así que tiene que volver a esperarse en el banco.
 */
export async function anularPago(id: number) {
  const pago = await prisma.pagoPersonal.findUnique({ where: { id } })
  if (!pago) throw noEncontrado('Pago')

  // Depósito del que se descontó (si lo hubo) y que todavía no llegó al banco.
  const deposito = pago.turno_pago_id
    ? await prisma.deposito.findFirst({
        where: { turno_id: pago.turno_pago_id, estado: 'PENDIENTE', monto_real: 0 },
      })
    : null
  if (pago.turno_pago_id && !deposito) {
    throw conflicto(
      'El depósito del que salió este pago ya fue registrado en Finanzas: revierte el depósito antes de anular el pago',
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.turnoCaja.updateMany({ where: { pago_id: id }, data: { pago_id: null } })
    if (deposito) {
      await tx.deposito.update({
        where: { id: deposito.id },
        // No baja de 0: si el registro quedó inconsistente, mejor un teórico
        // completo que un descuento negativo inventando plata.
        data:  { pago_vendedor: Math.max(0, deposito.pago_vendedor - pago.monto_total) },
      })
    }
    await tx.pagoPersonal.delete({ where: { id } })
  })

  return {
    mensaje: deposito
      ? 'Pago anulado; sus turnos vuelven a estar pendientes y el monto se devolvió al a depositar del punto'
      : 'Pago anulado; sus turnos vuelven a estar pendientes de pago',
    id,
  }
}

function mapearPago(p: {
  id: number
  usuario_id: number | null
  usuario_nombre: string
  fecha_desde: Date
  fecha_hasta: Date
  dias_trabajados: number
  monto_base: number
  monto_bonos: number
  monto_extras: number
  monto_descuentos: number
  monto_adicional: number
  monto_cotizaciones: number
  monto_total: number
  creado_por_nombre: string | null
  creado_en: Date
  pdv_id?: number | null
  pdv_nombre?: string | null
  turno_pago_id?: number | null
}) {
  return {
    id:                p.id,
    usuarioId:         p.usuario_id,
    nombre:            p.usuario_nombre,
    desde:             p.fecha_desde.toISOString().slice(0, 10),
    hasta:             p.fecha_hasta.toISOString().slice(0, 10),
    diasTrabajados:    p.dias_trabajados,
    montoBase:         p.monto_base,
    montoBonos:        p.monto_bonos,
    montoExtras:       p.monto_extras,
    montoDescuentos:   p.monto_descuentos,
    montoAdicional:    p.monto_adicional,
    montoCotizaciones: p.monto_cotizaciones,
    montoTotal:        p.monto_total,
    creadoPor:         p.creado_por_nombre,
    creadoEn:          p.creado_en.toISOString(),
    // Pago hecho con el efectivo de un punto (null = pago por período).
    pdvId:           p.pdv_id ?? null,
    pdvNombre:       p.pdv_nombre ?? null,
    turnoPagoId:     p.turno_pago_id ?? null,
  }
}

// ─── Pago directo desde la caja de una sucursal ("Pagar a Vendedor") ──────────
//
// Réplica del flujo de la planilla del cliente: en la hoja del día de cada punto,
// la celda F29 ("Pagado a Vendedor (DC)") descuenta del "A DEPOSITAR":
//
//   P22 (A DEPOSITAR) = P15 (venta) + P26 (diferencia) − P21 (gastos) − F29 (pagado)
//
// Es decir: el admin le paga al vendedor con el efectivo que acaba de recibir en
// el punto, así que esa plata no llega al banco. Acá se persiste igual: el pago
// se acumula en `Deposito.pago_vendedor` del turno cargado, y "a depositar" pasa
// a ser `monto_teorico − pago_vendedor` en Finanzas y en el dashboard.
//
// A diferencia de `generarPagos` (por rango de fechas), acá el admin elige el
// VENDEDOR y CUÁNTOS de sus turnos impagos liquida (1..N, los más antiguos
// primero). El cálculo del monto es el mismo de la Nómina.

/** Un turno impago de un vendedor, ya valorizado (bono del PDV + extra). */
interface TurnoPendiente {
  turnoId:        number
  fecha:          string
  pdvId:          number
  pdvNombre:      string
  venta:          number
  bono:           number
  /** "Adicional" del turno en décimas (planilla, col. E): 5 = 0,5 · 10 = 1. */
  extraDecimas:   number
  /** El mismo extra ya convertido a CLP con ConfigSueldos.valorExtra. */
  montoExtra:     number
  diferenciaCaja: number
}

/** Turnos elegibles de UN vendedor, del más antiguo al más nuevo (FIFO). */
async function getTurnosPendientesDe(usuarioId: number) {
  return prisma.turnoCaja.findMany({
    where: {
      estado:               'CERRADO',
      recepcion_confirmada: true,
      pago_id:              null,
      usuario_id:           usuarioId,
    },
    orderBy: { fecha_apertura: 'asc' },
    select: {
      id: true, fecha_apertura: true, total_calculado: true, diferencia_caja: true,
      extra_decimas: true,
      pdv: { select: { id: true, nombre: true } },
    },
  })
}

/**
 * Valoriza un turno impago = una fila de la planilla: bono según los tramos del
 * PDV donde se trabajó (columna J) y el "Adicional" en CLP (columna E × 3.000).
 * El pago diario NO va acá: es por vendedor, no por turno.
 */
function valorizarTurno(
  t: {
    id: number; fecha_apertura: Date; total_calculado: number | null
    diferencia_caja: number | null; extra_decimas: number
    pdv: { id: number; nombre: string }
  },
  tramosPorPdv: Awaited<ReturnType<typeof getTramosBonoActivosPorPdv>>,
  config: ConfigSueldos,
): TurnoPendiente {
  const venta = t.total_calculado ?? 0
  return {
    turnoId:        t.id,
    fecha:          diaChileDe(t.fecha_apertura),
    pdvId:          t.pdv.id,
    pdvNombre:      t.pdv.nombre,
    venta,
    bono:           calcularBono(tramosParaPdv(tramosPorPdv, t.pdv.id, t.pdv.nombre), venta),
    extraDecimas:   t.extra_decimas,
    montoExtra:     calcularMontoExtra(t.extra_decimas, config.valorExtra),
    diferenciaCaja: t.diferencia_caja ?? 0,
  }
}

/**
 * Totales acumulados de pagar los primeros k turnos (k = 1..N).
 *
 * Se devuelven precalculados para que el selector de la UI ("¿cuántos turnos le
 * pago?") solo tenga que indexar el arreglo: el descuento de caja NO es lineal
 * (se aplica sobre el neto del conjunto y solo si supera la tolerancia), así que
 * no se puede obtener sumando fila por fila en el frontend.
 */
function acumuladosPorCantidad(
  turnos: TurnoPendiente[],
  pagoDiario: number,
  tolerancia: number,
  ajuste: AjustePago = AJUSTE_VACIO,
) {
  const acumulados = []
  let bonos  = 0
  let extras = 0
  const diferencias: number[] = []

  for (let k = 1; k <= turnos.length; k++) {
    bonos  += turnos[k - 1]!.bono
    extras += turnos[k - 1]!.montoExtra
    diferencias.push(turnos[k - 1]!.diferenciaCaja)
    const montoBase       = k * pagoDiario
    const montoDescuentos = calcularDescuentoCaja(diferencias, tolerancia)
    acumulados.push({
      cantidad:          k,
      montoBase,
      montoBonos:        bonos,
      montoExtras:       extras,
      montoDescuentos,
      montoAdicional:    ajuste.adicional,
      montoCotizaciones: ajuste.cotizaciones,
      netoCaja:          diferencias.reduce((s, d) => s + d, 0),
      montoTotal:        calcularTotalPago({
        montoBase,
        montoBonos:        bonos,
        montoExtras:       extras,
        montoDescuentos,
        montoAdicional:    ajuste.adicional,
        montoCotizaciones: ajuste.cotizaciones,
      }),
    })
  }
  return acumulados
}

/**
 * Vendedores disponibles para el pago directo, cada uno con sus turnos impagos
 * (CERRADOS + recepción confirmada + `pago_id` null) y los totales acumulados.
 *
 * Se listan TODOS los vendedores activos, incluso los que no tienen turnos por
 * pagar: el admin necesita ver en el mismo combo a quién ya le pagó.
 */
export async function getVendedoresPendientesDePago() {
  const [vendedores, tramosPorPdv, config] = await Promise.all([
    prisma.usuario.findMany({
      where:   { activo: true, rol: { nombre: 'VENDEDOR' } },
      select:  { id: true, nombre: true, pago_diario: true },
      orderBy: { nombre: 'asc' },
    }),
    getTramosBonoActivosPorPdv(),
    getConfigSueldos(),
  ])

  const filas = await Promise.all(
    vendedores.map(async (v) => {
      const turnos     = (await getTurnosPendientesDe(v.id)).map((t) => valorizarTurno(t, tramosPorPdv, config))
      const pagoDiario = pagoDiarioDe(v.pago_diario, config.pagoDiarioBase)
      return {
        usuarioId:        v.id,
        nombre:           v.nombre,
        pagoDiario,
        turnosPendientes: turnos.length,
        turnos,
        acumulados:       acumuladosPorCantidad(turnos, pagoDiario, config.toleranciaFaltante),
      }
    }),
  )

  return { vendedores: filas, ...config }
}

/**
 * Paga N turnos de un vendedor con el efectivo del punto: crea el PagoPersonal,
 * marca esos turnos como pagados y descuenta el monto del "a depositar" del
 * turno indicado (`turnoId`), que es la caja de donde sale la plata.
 *
 * El depósito puede quedar negativo y eso NO se bloquea: pasa en la planilla del
 * cliente (el 15 de Mall Patio quedó en −$72.400 tras pagar $176.000) cuando se
 * paga más de lo que ese día recaudó. La deuda se arrastra al banco.
 */
export async function pagarTurnosDesdeCaja(
  input: {
    usuarioId: number; cantidadTurnos: number; turnoId: number
    adicional?: number; cotizaciones?: number
  },
  creadoPor: { id: number; nombre: string },
) {
  const { usuarioId, cantidadTurnos, turnoId } = input
  const ajuste: AjustePago = {
    adicional:    input.adicional ?? 0,
    cotizaciones: input.cotizaciones ?? 0,
  }

  const turnoCaja = await prisma.turnoCaja.findUnique({
    where:   { id: turnoId },
    include: { pdv: { select: { id: true, nombre: true } }, depositos: true },
  })
  if (!turnoCaja) throw noEncontrado('Turno')
  if (turnoCaja.estado !== 'CERRADO') {
    throw conflicto('El turno del punto debe estar cerrado para pagar con su efectivo')
  }

  // Solo se puede descontar de un depósito que todavía no llegó al banco: si ya
  // se registró en Finanzas, cambiarle el monto reescribiría un hecho pasado.
  const deposito = turnoCaja.depositos.find((d) => d.estado === 'PENDIENTE' && d.monto_real === 0)
  if (!deposito) {
    throw conflicto(
      'El depósito de este turno ya fue registrado en Finanzas: no se puede descontar un pago de plata que ya llegó al banco',
    )
  }

  const vendedor = await prisma.usuario.findUnique({
    where:  { id: usuarioId },
    select: { id: true, nombre: true, pago_diario: true },
  })
  if (!vendedor) throw noEncontrado('Vendedor')

  const [crudos, tramosPorPdv, config] = await Promise.all([
    getTurnosPendientesDe(usuarioId),
    getTramosBonoActivosPorPdv(),
    getConfigSueldos(),
  ])
  if (crudos.length === 0) {
    throw conflicto(vendedor.nombre + ' no tiene turnos pendientes de pago')
  }
  if (cantidadTurnos > crudos.length) {
    throw conflicto(
      `${vendedor.nombre} tiene ${crudos.length} turno(s) pendiente(s) de pago; pediste pagar ${cantidadTurnos}`,
    )
  }

  // Los más antiguos primero: la deuda se salda en orden, igual que la planilla.
  const seleccionados = crudos.slice(0, cantidadTurnos).map((t) => valorizarTurno(t, tramosPorPdv, config))

  const pagoDiario = pagoDiarioDe(vendedor.pago_diario, config.pagoDiarioBase)
  const escalera   = acumuladosPorCantidad(seleccionados, pagoDiario, config.toleranciaFaltante, ajuste)
  const total      = escalera[escalera.length - 1]!
  if (total.montoTotal <= 0) {
    throw conflicto(
      'El pago calculado no es positivo: los faltantes de caja de esos turnos se comen el sueldo. Revisa el cuadre antes de pagar.',
    )
  }

  const turnoIds = seleccionados.map((t) => t.turnoId)
  const fechas   = [...seleccionados.map((t) => t.fecha)].sort()

  const pago = await prisma.$transaction(async (tx) => {
    const creado = await tx.pagoPersonal.create({
      data: {
        usuario_id:         vendedor.id,
        usuario_nombre:     vendedor.nombre,
        fecha_desde:        new Date(`${fechas[0]}T00:00:00Z`),
        fecha_hasta:        new Date(`${fechas[fechas.length - 1]}T00:00:00Z`),
        dias_trabajados:    seleccionados.length,
        monto_base:         total.montoBase,
        monto_bonos:        total.montoBonos,
        monto_extras:       total.montoExtras,
        monto_descuentos:   total.montoDescuentos,
        monto_adicional:    total.montoAdicional,
        monto_cotizaciones: total.montoCotizaciones,
        monto_total:        total.montoTotal,
        creado_por_nombre:  creadoPor.nombre,
        pdv_id:             turnoCaja.pdv.id,
        pdv_nombre:         turnoCaja.pdv.nombre,
        turno_pago_id:      turnoCaja.id,
      },
    })

    // Misma guarda anti doble-pago que `generarPagos`: si otro admin tomó alguno
    // de estos turnos entremedio, el conteo no cuadra y se revierte todo.
    const marcados = await tx.turnoCaja.updateMany({
      where: { id: { in: turnoIds }, pago_id: null },
      data:  { pago_id: creado.id },
    })
    if (marcados.count !== turnoIds.length) {
      throw conflicto('Otro pago acaba de tomar parte de estos turnos; recarga y reintenta')
    }

    // El descuento del "a depositar": esta plata se quedó en el punto.
    await tx.deposito.update({
      where: { id: deposito.id },
      data:  { pago_vendedor: { increment: total.montoTotal } },
    })

    return creado
  })

  const pagadoAcumulado = deposito.pago_vendedor + total.montoTotal

  return {
    mensaje:       `Pago de ${seleccionados.length} turno(s) a ${vendedor.nombre} registrado`,
    pago:          mapearPago(pago),
    turnosPagados: seleccionados.map((t) => ({ turnoId: t.turnoId, fecha: t.fecha, pdvNombre: t.pdvNombre })),
    // Cómo queda la caja del punto tras el pago (lo que debe llegar al banco).
    deposito: {
      montoBruto:   deposito.monto_teorico,
      pagoVendedor: pagadoAcumulado,
      aDepositar:   deposito.monto_teorico - pagadoAcumulado,
    },
  }
}
