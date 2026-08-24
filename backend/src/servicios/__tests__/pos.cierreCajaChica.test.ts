/**
 * Tests del cuadre de cierre con caja chica FUERA del cuadre.
 *
 * Decisión del negocio: el saldo de apertura (caja chica) no participa del cuadre.
 * El vendedor cuenta y entrega solo el efectivo de VENTAS; ese fondo se queda en el
 * punto para el turno siguiente y nadie lo cuenta. Por lo tanto:
 *   · ventaEfectivo  = totalCalculado − tarjeta − transferencia
 *   · esperadoCaja   = ventaEfectivo − gastos − retiros   (sin saldo_inicial)
 *   · diferenciaCaja = efectivoContado − esperadoCaja
 *   · depósito teórico = efectivoContado + retiros        (no se resta el fondo)
 * Antes se restaba/sumaba el saldo de apertura en ambas fórmulas, lo que dejaba el
 * depósito corto por el monto del fondo y marcaba sobrantes/faltantes falsos.
 * Cubre además que el CUADRE lo calcula el servidor con los gastos/retiros de BD,
 * no el POS: los retiros del admin no siempre llegan al store del vendedor.
 * Ejecutar con: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    turnoCaja:           { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    gastoTurno:          { aggregate: vi.fn() },
    retiroTurno:         { aggregate: vi.fn() },
    inventario:          { findMany: vi.fn(), upsert: vi.fn() },
    producto:            { findMany: vi.fn() },
    // Detalle de ventas normalizado que el cierre escribe junto al snapshot JSON.
    ventaTurnoItem:      { deleteMany: vi.fn(), createMany: vi.fn() },
    usuario:             { findUnique: vi.fn() },
    deposito:            { create: vi.fn() },
    historialInventario: { create: vi.fn() },
    notificacion:        { createMany: vi.fn() },
    $transaction:        vi.fn(),
  }
  return { prismaMock }
})
vi.mock('../../config/prisma', () => ({ default: prismaMock }))
vi.mock('../preparacion.servicio', () => ({ confirmarPreparacionEnApertura: vi.fn() }))

import { cerrarTurno } from '../pos.servicio'

const CAJA_CHICA = 20000
const VENDEDOR   = 10

const turnoAbierto = {
  id: 42, pdv_id: 5, usuario_id: VENDEDOR, estado: 'ABIERTO',
  fecha_apertura: new Date('2026-07-29T12:00:00Z'), saldo_inicial: CAJA_CHICA,
}

// Cierre coherente: vendió 43.000 (2.000 tarjeta + 2.000 transferencia + 39.000
// efectivo) y contó exactamente los 39.000 de ventas, sin tocar la caja chica.
const cierreOk = {
  efectivoContado:    39000,
  ventaEfectivo:      39000,
  ventaTarjeta:       2000,
  ventaTransferencia: 2000,
  totalCalculado:     43000,
  diferenciaCaja:     0,
  stockFinal:         [] as { productoId: number; cantidad: number }[],
  ventaDetalle:       [] as { productoId: number; cantidad: number; precioUnitario: number }[],
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.turnoCaja.findUnique.mockResolvedValue(turnoAbierto)
  prismaMock.turnoCaja.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.gastoTurno.aggregate.mockResolvedValue({ _sum: { monto: 0 } })
  prismaMock.retiroTurno.aggregate.mockResolvedValue({ _sum: { monto: 0 } })
  prismaMock.inventario.findMany.mockResolvedValue([])
  prismaMock.producto.findMany.mockResolvedValue([])
  prismaMock.usuario.findUnique.mockResolvedValue({ nombre: 'Anaís' })
  prismaMock.deposito.create.mockResolvedValue({})
  prismaMock.ventaTurnoItem.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.ventaTurnoItem.createMany.mockResolvedValue({ count: 0 })
  prismaMock.notificacion.createMany.mockResolvedValue({ count: 0 })
  prismaMock.$transaction.mockImplementation((cb: (tx: typeof prismaMock) => unknown) => cb(prismaMock))
})

describe('cerrarTurno — la caja chica queda fuera del cuadre', () => {
  it('el depósito teórico es el efectivo contado, sin restar la caja chica', async () => {
    await cerrarTurno(42, cierreOk, VENDEDOR, 'VENDEDOR')
    expect(prismaMock.deposito.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ turno_id: 42, monto_teorico: 39000, monto_real: 0, estado: 'PENDIENTE' }),
    })
  })

  it('los retiros se suman al depósito (esa plata salió de la caja antes)', async () => {
    prismaMock.retiroTurno.aggregate.mockResolvedValue({ _sum: { monto: 5000 } })
    await cerrarTurno(42, cierreOk, VENDEDOR, 'VENDEDOR')
    expect(prismaMock.deposito.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ monto_teorico: 44000 }),
    })
  })

  it('no avisa incoherencia cuando el cuadre del POS coincide con el del servidor', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await cerrarTurno(42, cierreOk, VENDEDOR, 'VENDEDOR')
    const avisosDeCuadre = warn.mock.calls.filter((c) => String(c[0]).includes('cuadre declarado por el POS'))
    expect(avisosDeCuadre).toHaveLength(0)
    warn.mockRestore()
  })

  it('avisa incoherencia si el vendedor contó también la caja chica (sobrante falso)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Contó 59.000 (ventas + fondo) pero declaró diferencia 0: ya no cuadra.
    await cerrarTurno(42, { ...cierreOk, efectivoContado: 59000 }, VENDEDOR, 'VENDEDOR')
    const avisosDeCuadre = warn.mock.calls.filter((c) => String(c[0]).includes('cuadre declarado por el POS'))
    expect(avisosDeCuadre).toHaveLength(1)
    warn.mockRestore()
  })

  it('escribe el detalle de ventas normalizado con la fecha del turno en Chile', async () => {
    // El turno abre 29-07 a las 12:00Z = 08:00 en Chile → pertenece al 29-07.
    await cerrarTurno(42, {
      ...cierreOk,
      ventaDetalle: [{ productoId: 6, cantidad: 10, precioUnitario: 800 }],
    }, VENDEDOR, 'VENDEDOR')

    expect(prismaMock.ventaTurnoItem.deleteMany).toHaveBeenCalledWith({ where: { turno_id: 42 } })
    expect(prismaMock.ventaTurnoItem.createMany).toHaveBeenCalledWith({
      data: [{
        turno_id: 42, producto_id: 6, cantidad: 10, precio_unitario: 800,
        fecha: new Date('2026-07-29T00:00:00.000Z'),
      }],
    })
  })

  it('un turno abierto de noche queda en su día chileno, no en el día UTC siguiente', async () => {
    // 29-07 23:30 en Chile (UTC-4) = 30-07 03:30Z. La venta es del 29, no del 30.
    prismaMock.turnoCaja.findUnique.mockResolvedValue({
      ...turnoAbierto, fecha_apertura: new Date('2026-07-30T03:30:00Z'),
    })
    await cerrarTurno(42, {
      ...cierreOk,
      ventaDetalle: [{ productoId: 6, cantidad: 1, precioUnitario: 800 }],
    }, VENDEDOR, 'VENDEDOR')

    expect(prismaMock.ventaTurnoItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ fecha: new Date('2026-07-29T00:00:00.000Z') })],
    })
  })

  it('sin ventas declaradas no inserta líneas (pero limpia las previas)', async () => {
    await cerrarTurno(42, cierreOk, VENDEDOR, 'VENDEDOR')
    expect(prismaMock.ventaTurnoItem.deleteMany).toHaveBeenCalledOnce()
    expect(prismaMock.ventaTurnoItem.createMany).not.toHaveBeenCalled()
  })

  it('un faltante real se registra tal cual (sin distorsión del fondo)', async () => {
    await cerrarTurno(42, { ...cierreOk, efectivoContado: 34000, diferenciaCaja: -5000 }, VENDEDOR, 'VENDEDOR')
    expect(prismaMock.turnoCaja.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ diferencia_caja: -5000, efectivo_declarado: 34000, estado: 'CERRADO' }),
    }))
    // El depósito refleja lo que realmente había, no lo que debía haber.
    expect(prismaMock.deposito.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ monto_teorico: 34000 }),
    })
  })
})

describe('cerrarTurno — el cuadre lo calcula el servidor, no el POS', () => {
  // Caso real que motivó el arreglo, con los montos de la planilla del cliente:
  // el admin retiró 183.500 del punto durante el turno. El POS del vendedor nunca
  // se enteró, así que declaró venta en efectivo 235.300 y un faltante de 182.300.
  // El servidor, que sí ve el RetiroTurno, tiene que llegar a +1.200.
  const cierreDesincronizado = {
    ...cierreOk,
    efectivoContado:    53000,
    ventaTarjeta:       12000,
    ventaTransferencia: 1500,
    totalCalculado:     248800,
    ventaEfectivo:      235300, // declarado por el POS (sin descontar el retiro)
    diferenciaCaja:     -182300,
  }

  beforeEach(() => {
    prismaMock.retiroTurno.aggregate.mockResolvedValue({ _sum: { monto: 183500 } })
  })

  it('descuenta el retiro del admin que el POS no conocía: +1.200, no −182.300', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await cerrarTurno(42, cierreDesincronizado, VENDEDOR, 'VENDEDOR')
    expect(prismaMock.turnoCaja.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ diferencia_caja: 1200 }),
    }))
  })

  it('venta_efectivo guarda la venta en efectivo real (total − tarjeta − transferencia)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await cerrarTurno(42, cierreDesincronizado, VENDEDOR, 'VENDEDOR')
    expect(prismaMock.turnoCaja.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ venta_efectivo: 235300 }),
    }))
  })

  it('deja rastro en el log de que el POS venía desincronizado', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await cerrarTurno(42, cierreDesincronizado, VENDEDOR, 'VENDEDOR')
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('cuadre declarado por el POS'))).toHaveLength(1)
    warn.mockRestore()
  })

  it('los gastos pagados de la caja también bajan el efectivo esperado', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Mismo turno pero el aseo (3.500) se registró como gasto y el retiro fue de
    // 180.000: la diferencia no cambia, la plata salió igual de la caja.
    prismaMock.retiroTurno.aggregate.mockResolvedValue({ _sum: { monto: 180000 } })
    prismaMock.gastoTurno.aggregate.mockResolvedValue({ _sum: { monto: 3500 } })
    await cerrarTurno(42, cierreDesincronizado, VENDEDOR, 'VENDEDOR')
    expect(prismaMock.turnoCaja.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ diferencia_caja: 1200 }),
    }))
  })

  it('el depósito teórico suma el retiro (esa plata también va al banco)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await cerrarTurno(42, cierreDesincronizado, VENDEDOR, 'VENDEDOR')
    expect(prismaMock.deposito.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ monto_teorico: 236500 }),
    })
  })
})
