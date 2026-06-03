import prisma from '../config/prisma'

export async function getNotificaciones(usuarioId: number) {
  return prisma.notificacion.findMany({
    where:   { usuario_id: usuarioId },
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

export async function marcarTodasLeidas(usuarioId: number) {
  return prisma.notificacion.updateMany({
    where: { usuario_id: usuarioId, leida: false },
    data:  { leida: true },
  })
}

export async function contarNoLeidas(usuarioId: number) {
  return prisma.notificacion.count({ where: { usuario_id: usuarioId, leida: false } })
}
