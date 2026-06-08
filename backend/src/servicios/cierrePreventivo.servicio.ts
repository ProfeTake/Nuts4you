import prisma from '../config/prisma'
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

  return mapearCierre(cierre)
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
    if (filtros.desde) fecha.gte = new Date(`${filtros.desde}T00:00:00-04:00`)
    if (filtros.hasta) fecha.lte = new Date(`${filtros.hasta}T23:59:59.999-04:00`)
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
  const ahora  = new Date()
  const inicio = new Date(`${ahora.toISOString().split('T')[0]}T00:00:00-04:00`)
  const fin    = new Date(`${ahora.toISOString().split('T')[0]}T23:59:59.999-04:00`)

  const cierres = await prisma.cierrePreventivo.findMany({
    where:  { fecha: { gte: inicio, lte: fin } },
    select: { pdv_id: true },
  })

  return [...new Set(cierres.map((c) => c.pdv_id))]
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
