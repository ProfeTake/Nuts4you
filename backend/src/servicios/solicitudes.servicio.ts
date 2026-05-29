import prisma from '../config/prisma'
import type { CrearSolicitudInput } from '../validaciones/solicitudes.schema'

// ─── Crear solicitud (vendedor) ───────────────────────────────────────────────

export async function crearSolicitud(data: CrearSolicitudInput, usuarioId: number) {
  const solicitud = await prisma.solicitud.create({
    data: {
      pdv_id:     data.pdvId,
      usuario_id: usuarioId,
      notas:      data.notas ?? null,
      items: {
        create: data.items.map(it => ({
          producto_id: it.productoId,
          cantidad:    it.cantidad,
        })),
      },
    },
    include: {
      items:   { include: { producto: { select: { nombre: true, categoria: { select: { nombre: true } } } } } },
      pdv:     { select: { nombre: true } },
      usuario: { select: { nombre: true } },
    },
  })
  return formatearSolicitud(solicitud)
}

// ─── Listar solicitudes ───────────────────────────────────────────────────────
// - VENDEDOR: solo las de su PDV
// - BODEGUERO / ADMIN / SUPERVISOR: todas (o filtradas por pdvId)

export async function getSolicitudes(rol: string, usuarioId: number, filtroPdvId?: number) {
  const where: Record<string, unknown> = {}

  if (rol === 'VENDEDOR') {
    // Vendedores ven sus propias solicitudes (independiente del PDV donde roten)
    where.usuario_id = usuarioId
  } else if (filtroPdvId) {
    where.pdv_id = filtroPdvId
  }

  const solicitudes = await prisma.solicitud.findMany({
    where,
    include: {
      items: { include: { producto: { select: { nombre: true, categoria: { select: { nombre: true } } } } } },
      pdv:     { select: { nombre: true } },
      usuario: { select: { nombre: true } },
    },
    orderBy: { fecha: 'desc' },
  })

  return solicitudes.map(formatearSolicitud)
}

// ─── Despachar solicitud (bodeguero/admin/supervisor) ─────────────────────────

export async function despacharSolicitud(solicitudId: number) {
  const sol = await prisma.solicitud.findUniqueOrThrow({ where: { id: solicitudId } })
  if (sol.estado !== 'PENDIENTE') throw new Error('Solo se pueden despachar solicitudes pendientes')

  const actualizada = await prisma.solicitud.update({
    where: { id: solicitudId },
    data:  { estado: 'DESPACHADA' },
    include: {
      items: { include: { producto: { select: { nombre: true, categoria: { select: { nombre: true } } } } } },
      pdv:     { select: { nombre: true } },
      usuario: { select: { nombre: true } },
    },
  })
  return formatearSolicitud(actualizada)
}

// ─── Confirmar recepción (vendedor) ──────────────────────────────────────────

export async function confirmarSolicitud(solicitudId: number, usuarioId: number) {
  const sol = await prisma.solicitud.findUniqueOrThrow({ where: { id: solicitudId } })
  if (sol.estado !== 'DESPACHADA') throw new Error('Solo se pueden confirmar solicitudes ya despachadas')
  if (sol.usuario_id !== null && sol.usuario_id !== usuarioId) throw new Error('Solo el vendedor que solicitó puede confirmar la recepción')

  const actualizada = await prisma.solicitud.update({
    where: { id: solicitudId },
    data:  { estado: 'CONFIRMADA', fecha_cierre: new Date() },
    include: {
      items: { include: { producto: { select: { nombre: true, categoria: { select: { nombre: true } } } } } },
      pdv:     { select: { nombre: true } },
      usuario: { select: { nombre: true } },
    },
  })
  return formatearSolicitud(actualizada)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type SolicitudConRelaciones = Awaited<ReturnType<typeof prisma.solicitud.findUniqueOrThrow>> & {
  items:   Array<{ id: number; cantidad: number; producto: { nombre: string; categoria: { nombre: string } } }>
  pdv:     { nombre: string }
  usuario: { nombre: string } | null
}

function formatearSolicitud(s: SolicitudConRelaciones) {
  return {
    id:          s.id,
    pdvNombre:   s.pdv.nombre,
    pdvId:       s.pdv_id,
    solicitante: s.usuario?.nombre ?? 'Usuario eliminado',
    estado:      s.estado as string,
    notas:       s.notas ?? null,
    fecha:       s.fecha.toISOString(),
    fechaCierre: s.fecha_cierre?.toISOString() ?? null,
    items: s.items.map(it => ({
      id:        it.id,
      producto:  it.producto.nombre,
      categoria: it.producto.categoria.nombre,
      cantidad:  it.cantidad,
    })),
  }
}
