import prisma from '../config/prisma'
import { ErrorApp } from '../lib/errores'
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
    // Lo que realmente debe llegar al banco: el efectivo del cierre MENOS lo que
    // se le pagó al vendedor con esa misma plata (planilla: "A DEPOSITAR" ya
    // viene neteado por la celda F29 "Pagado a Vendedor"). Puede quedar negativo
    // si se pagó más de lo que recaudó el turno; se muestra tal cual.
    const aDepositar = d.monto_teorico - d.pago_vendedor
    const falta = Math.max(0, aDepositar - d.monto_real)
    return {
      id:             d.id,
      turnoId:        d.turno_id,
      fechaVenta:     d.turno.fecha_apertura.toISOString().split('T')[0],
      fechaDeposito:  d.fecha.toISOString().split('T')[0],
      pdvId:          d.turno.pdv.id,
      sucursal:       PDV_A_SUCURSAL[d.turno.pdv.nombre] ?? d.turno.pdv.nombre,
      sucursalNombre: d.turno.pdv.nombre,
      vendedor:       d.turno.usuario?.nombre ?? 'Usuario eliminado',
      montoADepositar: aDepositar,
      montoDepositado: d.monto_real,
      faltaDepositar:  falta,
      // Bruto y descuento por separado para poder explicar por qué bajó el neto.
      montoBruto:      d.monto_teorico,
      pagoVendedor:    d.pago_vendedor,
      estado:          ESTADO_LABEL[d.estado] ?? d.estado,
    }
  })
}

export async function actualizarDeposito(id: number, data: ActualizarDepositoInput) {
  await prisma.deposito.findUniqueOrThrow({ where: { id } })

  // El monto realmente depositado debe declararse siempre: antes, si el frontend
  // no lo enviaba, se copiaba el monto teórico como si fuera el real y
  // `faltaDepositar` caía a 0 sin verificar cuánto llegó al banco (C9).
  if (data.montoReal === undefined) {
    throw new ErrorApp('Debe indicar el monto realmente depositado', 400)
  }

  await prisma.deposito.update({
    where: { id },
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estado:     data.estado as any,
      monto_real: data.montoReal,
      fecha:      new Date(),
    },
  })

  return { mensaje: 'Depósito actualizado', id }
}
