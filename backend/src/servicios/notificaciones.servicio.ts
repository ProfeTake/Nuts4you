import prisma from '../config/prisma'
import type { Prisma } from '@prisma/client'

/**
 * Filtro de contexto: un avisos con `pdv_id` solo se ve en la sesión de ese PDV;
 * los globales (`pdv_id` null, ej. avisos de admin) se ven en cualquier contexto.
 * Sin `pdvId` (contexto admin) no se filtra por PDV: se ven todos los del usuario.
 */
function scopePdv(usuarioId: number, pdvId?: number): Prisma.NotificacionWhereInput {
  const base: Prisma.NotificacionWhereInput = { usuario_id: usuarioId }
  if (pdvId === undefined) return base
  return { ...base, OR: [{ pdv_id: pdvId }, { pdv_id: null }] }
}

export async function getNotificaciones(usuarioId: number, pdvId?: number) {
  return prisma.notificacion.findMany({
    where:   scopePdv(usuarioId, pdvId),
    orderBy: { fecha: 'desc' },
    take:    20,
  })
}

export async function marcarLeida(id: number, usuarioId: number) {
  return prisma.notificacion.update({
    where: { id, usuario_id: usuarioId },
    data:  { leida: true },
  })
}

export async function marcarTodasLeidas(usuarioId: number, pdvId?: number) {
  return prisma.notificacion.updateMany({
    where: { ...scopePdv(usuarioId, pdvId), leida: false },
    data:  { leida: true },
  })
}

export async function contarNoLeidas(usuarioId: number, pdvId?: number) {
  return prisma.notificacion.count({ where: { ...scopePdv(usuarioId, pdvId), leida: false } })
}
