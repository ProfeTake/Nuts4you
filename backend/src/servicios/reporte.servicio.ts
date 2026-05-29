import prisma from '../config/prisma'

export async function guardarRegistroDiario(pdvId: number, fecha: string, datos: unknown) {
  const fechaDate = new Date(`${fecha}T12:00:00.000Z`)
  return prisma.registroDiario.upsert({
    where: { pdv_id_fecha: { pdv_id: pdvId, fecha: fechaDate } },
    update: { datos: datos as never },
    create: { pdv_id: pdvId, fecha: fechaDate, datos: datos as never },
  })
}

export async function getRegistroDiario(pdvId: number, fecha: string) {
  const fechaDate = new Date(`${fecha}T12:00:00.000Z`)
  return prisma.registroDiario.findUnique({
    where: { pdv_id_fecha: { pdv_id: pdvId, fecha: fechaDate } },
    select: { id: true, datos: true, creado_en: true },
  })
}
