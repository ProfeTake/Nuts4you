import prisma from '../config/prisma'
import { rangoFechaChile, fechaHoyChile } from '../lib/tiempoChile'
import type { RegistrarCierreInput } from '../validaciones/cierrePreventivo.schema'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapearCierre(c: {
  id:             number
  pdv_id:         number
  usuario_id:     number
  fecha:          Date
  monto_retiro:   number
  checklist:      unknown
  notas_vendedor: string | null
  observaciones:  string | null
  pdv:            { nombre: string }
  usuario:        { nombre: string }
}) {
  return {
    id:            c.id,
    pdvId:         c.pdv_id,
    pdvNombre:     c.pdv.nombre,
    usuarioNombre: c.usuario.nombre,
    fecha:         c.fecha.toISOString(),
    montoRetiro:   c.monto_retiro,
    checklist:     c.checklist as { label: string; marcado: boolean }[],
    notasVendedor: c.notas_vendedor,
    observaciones: c.observaciones,
  }
}

const INCLUDE_FULL = {
  pdv:     { select: { nombre: true } },
  usuario: { select: { nombre: true } },
} as const

// ─── Operaciones ──────────────────────────────────────────────────────────────

/**
 * Registra un cierre preventivo (cierre temporal del PDV por admin/supervisor).
 *
 * ⚠️ `monto_retiro` es SOLO informativo (auditoría H14): se muestra en el panel
 * de cierres preventivos pero no participa en la conciliación de caja ni en
 * finanzas/nómina, por lo que no hay doble conteo. El retiro real de dinero
 * debe registrarse además vía POST /pos/turnos/:id/retiros (RetiroTurno) para
 * que el cuadre del turno lo descuente; ambos registros no están vinculados.
 */
export async function registrarCierrePreventivo(
  usuarioId: number,
  data: RegistrarCierreInput,
) {
  await prisma.pDV.findUniqueOrThrow({
    where: { id: data.pdvId, tipo: 'PUNTO_VENTA' },
  })

  const cierre = await prisma.cierrePreventivo.create({
    data: {
      pdv_id:         data.pdvId,
      usuario_id:     usuarioId,
      monto_retiro:   data.montoRetiro ?? 0,
      checklist:      data.checklist as object,
      notas_vendedor: data.notasVendedor?.trim() || null,
      observaciones:  data.observaciones?.trim()  || null,
    },
    include: INCLUDE_FULL,
  })

  // Alerta H11: monto_retiro es informativo y NO se descuenta del cuadre; el retiro
  // real debe registrarse como RetiroTurno en el turno abierto del PDV (para evitar
  // doble conteo, NO se auto-genera). Si se declaró más retiro del que hay registrado,
  // se avisa para que se registre el retiro real y no quede un descuadre.
  let alertaRetiro: { montoDeclarado: number; retiroRegistrado: number } | null = null
  const montoRetiro = data.montoRetiro ?? 0
  if (montoRetiro > 0) {
    const turnoActivo = await prisma.turnoCaja.findFirst({
      where:  { pdv_id: data.pdvId, estado: 'ABIERTO' },
      select: { id: true },
    })
    const retiroRegistrado = turnoActivo
      ? (await prisma.retiroTurno.aggregate({ where: { turno_id: turnoActivo.id }, _sum: { monto: true } }))._sum.monto ?? 0
      : 0
    if (retiroRegistrado < montoRetiro) {
      alertaRetiro = { montoDeclarado: montoRetiro, retiroRegistrado }
      console.warn(
        `[cierre-preventivo] PDV ${data.pdvId}: retiro declarado ${montoRetiro} > RetiroTurno registrado ${retiroRegistrado}. ` +
        `Registrar el retiro real en el turno para no descuadrar.`,
      )
    }
  }

  return { ...mapearCierre(cierre), alertaRetiro }
}

export async function getCierresPreventivos(filtros: {
  pdvId?: number
  desde?: string
  hasta?: string
}) {
  const where: Record<string, unknown> = {}

  if (filtros.pdvId) where.pdv_id = filtros.pdvId

  if (filtros.desde || filtros.hasta) {
    const fecha: Record<string, Date> = {}
    if (filtros.desde) fecha.gte = rangoFechaChile(filtros.desde).inicio
    if (filtros.hasta) fecha.lte = rangoFechaChile(filtros.hasta).fin
    where.fecha = fecha
  }

  const cierres = await prisma.cierrePreventivo.findMany({
    where,
    include:  INCLUDE_FULL,
    orderBy:  { fecha: 'desc' },
  })

  return cierres.map(mapearCierre)
}

export async function getCierresHoy() {
  const { inicio, fin } = rangoFechaChile(fechaHoyChile())

  const cierres = await prisma.cierrePreventivo.findMany({
    where:  { fecha: { gte: inicio, lte: fin } },
    select: { pdv_id: true },
  })

  return [...new Set(cierres.map((c) => c.pdv_id))]
}

/**
 * Turnos abiertos ahora mismo en los puntos de venta, para elegir con facilidad
 * a cuál hacerle el cierre preventivo (C: visibilidad de turnos activos). Incluye
 * quién trabaja, hora de apertura y saldo inicial, y marca los PDV que ya
 * tuvieron un cierre preventivo hoy para no duplicarlo.
 */
export async function getTurnosActivos() {
  const { inicio, fin } = rangoFechaChile(fechaHoyChile())

  const turnos = await prisma.turnoCaja.findMany({
    where:   { estado: 'ABIERTO', pdv: { tipo: 'PUNTO_VENTA' } },
    include: {
      pdv:     { select: { nombre: true } },
      usuario: { select: { nombre: true } },
    },
    orderBy: { fecha_apertura: 'asc' },
  })

  const pdvsConCierreHoy = new Set(
    (await prisma.cierrePreventivo.findMany({
      where:  { fecha: { gte: inicio, lte: fin } },
      select: { pdv_id: true },
    })).map((c) => c.pdv_id),
  )

  return turnos.map((t) => ({
    turnoId:          t.id,
    pdvId:            t.pdv_id,
    pdvNombre:        t.pdv.nombre,
    vendedor:         t.usuario?.nombre ?? null,
    horaApertura:     t.fecha_apertura.toISOString(),
    saldoInicial:     t.saldo_inicial,
    yaTieneCierreHoy: pdvsConCierreHoy.has(t.pdv_id),
  }))
}

// Ventana (en días) hacia atrás para considerar "vigente" un aviso de cierre
// preventivo al vendedor. Cubre el caso de reabrir el punto tras la visita del
// admin sin arrastrar avisos antiguos indefinidamente.
const DIAS_AVISO_CIERRE = 3

/**
 * Aviso vigente para el vendedor de un PDV: el cierre preventivo más reciente
 * (dentro de DIAS_AVISO_CIERRE) que tenga algo que comunicarle — tareas
 * (`notas_vendedor`) o un retiro de efectivo. Devuelve también el monto retirado
 * y el checklist para que el vendedor sepa QUÉ se hizo en su punto y por qué su
 * caja podría venir "corta" (C11). Solo lectura, scoped al PDV desde la ruta.
 *
 * ⚠️ NO expone `observaciones` (son notas internas del equipo admin).
 */
export async function getNotaVendedorVigente(pdvId: number) {
  const desde = new Date(Date.now() - DIAS_AVISO_CIERRE * 24 * 60 * 60 * 1000)
  const cierre = await prisma.cierrePreventivo.findFirst({
    where: {
      pdv_id: pdvId,
      fecha:  { gte: desde },
      OR: [
        { notas_vendedor: { not: null } },
        { monto_retiro:   { gt: 0 } },
      ],
    },
    orderBy: { fecha: 'desc' },
    include: INCLUDE_FULL,
  })
  if (!cierre) return null
  return {
    id:            cierre.id,
    pdvId:         cierre.pdv_id,
    pdvNombre:     cierre.pdv.nombre,
    fecha:         cierre.fecha.toISOString(),
    autor:         cierre.usuario.nombre,
    notasVendedor: cierre.notas_vendedor,
    montoRetiro:   cierre.monto_retiro,
    checklist:     cierre.checklist as { label: string; marcado: boolean }[],
  }
}

/**
 * Cierres preventivos ocurridos durante los turnos de un vendedor (mismo PDV y
 * dentro de la ventana apertura→cierre de alguno de sus turnos). Alimenta su
 * historial en "Mis Cierres" para que le quede registro de las visitas con
 * retiro/tareas. No hay FK cierre→turno: se asocia por PDV + ventana temporal.
 *
 * ⚠️ NO expone `observaciones` (internas del admin).
 */
export async function getMisCierresPreventivos(usuarioId: number) {
  const turnos = await prisma.turnoCaja.findMany({
    where:  { usuario_id: usuarioId },
    select: { pdv_id: true, fecha_apertura: true, fecha_cierre: true },
  })
  if (turnos.length === 0) return []

  const ahora = new Date()
  const cierres = await prisma.cierrePreventivo.findMany({
    where: {
      OR: turnos.map((t) => ({
        pdv_id: t.pdv_id,
        fecha:  { gte: t.fecha_apertura, lte: t.fecha_cierre ?? ahora },
      })),
    },
    include: INCLUDE_FULL,
    orderBy: { fecha: 'desc' },
  })

  return cierres.map((c) => ({
    id:            c.id,
    pdvId:         c.pdv_id,
    pdvNombre:     c.pdv.nombre,
    autor:         c.usuario.nombre,
    fecha:         c.fecha.toISOString(),
    montoRetiro:   c.monto_retiro,
    notasVendedor: c.notas_vendedor,
    checklist:     c.checklist as { label: string; marcado: boolean }[],
  }))
}

export async function eliminarCierrePreventivo(id: number) {
  await prisma.cierrePreventivo.findUniqueOrThrow({ where: { id } })
  await prisma.cierrePreventivo.delete({ where: { id } })
  return { mensaje: 'Cierre preventivo eliminado', id }
}

// ─── Plantilla de tareas ──────────────────────────────────────────────────────

export async function getTareasChecklist() {
  return prisma.tareaChecklist.findMany({ orderBy: { orden: 'asc' } })
}

export async function crearTareaChecklist(label: string) {
  const ultima = await prisma.tareaChecklist.findFirst({ orderBy: { orden: 'desc' } })
  return prisma.tareaChecklist.create({
    data: { label: label.trim(), orden: (ultima?.orden ?? -1) + 1 },
  })
}

export async function eliminarTareaChecklist(id: number) {
  await prisma.tareaChecklist.findUniqueOrThrow({ where: { id } })
  await prisma.tareaChecklist.delete({ where: { id } })
  return { id }
}
