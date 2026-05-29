import prisma from '../config/prisma'
import type { ActualizarDepositoInput } from '../validaciones/finanzas.schema'

// Mapa estado DB → label frontend
const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE:    'No depositado',
  CONFIRMADO:   'Depositado',
  TRANSFERENCIA: 'Transferencia',
}

// Mapa sucursal nombre → clave corta para el frontend
const PDV_A_SUCURSAL: Record<string, string> = {
  'Mall Patio':          'Mall',
  'Paseo Independencia': 'Paseo',
  'Open Plaza':          'Open Plaza',
  'Cugat Rengo':         'Rengo',
  'Cugat Baquedano':     'Baquedano',
}

export async function getDepositos() {
  const depositos = await prisma.deposito.findMany({
    include: {
      turno: {
        include: {
          pdv:     { select: { id: true, nombre: true } },
          usuario: { select: { nombre: true } },
        },
      },
    },
    orderBy: { fecha: 'desc' },
  })

  return depositos.map((d) => {
    const falta = Math.max(0, d.monto_teorico - d.monto_real)
    return {
      id:             d.id,
      turnoId:        d.turno_id,
      fechaVenta:     d.turno.fecha_apertura.toISOString().split('T')[0],
      fechaDeposito:  d.fecha.toISOString().split('T')[0],
      pdvId:          d.turno.pdv.id,
      sucursal:       PDV_A_SUCURSAL[d.turno.pdv.nombre] ?? d.turno.pdv.nombre,
      sucursalNombre: d.turno.pdv.nombre,
      vendedor:       d.turno.usuario?.nombre ?? 'Usuario eliminado',
      montoADepositar: d.monto_teorico,
      montoDepositado: d.monto_real,
      faltaDepositar:  falta,
      estado:          ESTADO_LABEL[d.estado] ?? d.estado,
    }
  })
}

export async function actualizarDeposito(id: number, data: ActualizarDepositoInput) {
  const deposito = await prisma.deposito.findUniqueOrThrow({ where: { id } })

  const montoReal = data.montoReal ?? deposito.monto_teorico

  await prisma.deposito.update({
    where: { id },
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estado:     data.estado as any,
      monto_real: montoReal,
      fecha:      new Date(),
    },
  })

  return { mensaje: 'Depósito actualizado', id }
}
