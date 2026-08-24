/**
 * Tests de reabrirTurno: deshacer un cierre mal declarado.
 *
 * El cierre escribe cinco cosas (turno, depósito, VentaTurnoItem, Inventario y
 * HistorialInventario). Reabrir tiene que deshacerlas todas o el turno queda en
 * un estado a medias: stock del cierre pero caja abierta, o depósito duplicado
 * al volver a cerrar. Ejecutar con: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    turnoCaja:           { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    historialInventario: { findMany: vi.fn(), deleteMany: vi.fn() },
    inventario:          { updateMany: vi.fn() },
    deposito:            { deleteMany: vi.fn() },
    ventaTurnoItem:      { deleteMany: vi.fn() },
    $transaction:        vi.fn(),
  }
  return { prismaMock }
})
vi.mock('../../config/prisma', () => ({ default: prismaMock }))

import { reabrirTurno } from '../pos.servicio'

const ADMIN = { id: 1, nombre: 'Rodrigo' }
const LOTE  = 'lote-del-cierre'

const turnoCerrado = {
  id: 18, pdv_id: 4, estado: 'CERRADO', pago_id: null, cierre_lote_id: LOTE,
  efectivo_declarado: 53000, diferencia_caja: 142000, total_calculado: 108000,
  depositos: [{ id: 7, estado: 'PENDIENTE', monto_real: 0 }],
  pdv: { nombre: 'Open Plaza' },
}

// Filas que dejó el cierre: guardan el stock que había ANTES de cuadrar.
const filasCierre = [
  { producto_id: 6, saldo_anterior: 40, saldo_nuevo: 19 },
  { producto_id: 7, saldo_anterior: 25, saldo_nuevo: 12 },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  prismaMock.turnoCaja.findUnique.mockResolvedValue(turnoCerrado)
  prismaMock.turnoCaja.findFirst.mockResolvedValue(null)   // sin otro turno abierto
  prismaMock.turnoCaja.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.historialInventario.findMany.mockResolvedValue(filasCierre)
  prismaMock.$transaction.mockImplementation((cb: (tx: typeof prismaMock) => unknown) => cb(prismaMock))
})

describe('reabrirTurno', () => {
  it('devuelve el turno a ABIERTO y borra el cuadre declarado', async () => {
    await reabrirTurno(18, ADMIN)
    expect(prismaMock.turnoCaja.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 18, estado: 'CERRADO' },
      data: expect.objectContaining({
        estado: 'ABIERTO', fecha_cierre: null,
        efectivo_declarado: null, diferencia_caja: null, total_calculado: null,
        cierre_lote_id: null,
      }),
    }))
  })

  it('restaura el stock al saldo anterior de cada producto', async () => {
    await reabrirTurno(18, ADMIN)
    expect(prismaMock.inventario.updateMany).toHaveBeenCalledWith({
      where: { pdv_id: 4, producto_id: 6 }, data: { stock_actual: 40 },
    })
    expect(prismaMock.inventario.updateMany).toHaveBeenCalledWith({
      where: { pdv_id: 4, producto_id: 7 }, data: { stock_actual: 25 },
    })
  })

  it('borra depósito, líneas de venta y las filas del historial del cierre', async () => {
    const r = await reabrirTurno(18, ADMIN)
    expect(prismaMock.deposito.deleteMany).toHaveBeenCalledWith({ where: { turno_id: 18 } })
    expect(prismaMock.ventaTurnoItem.deleteMany).toHaveBeenCalledWith({ where: { turno_id: 18 } })
    expect(prismaMock.historialInventario.deleteMany).toHaveBeenCalledWith({ where: { lote_id: LOTE } })
    expect(r.productosRestaurados).toBe(2)
  })

  it('deshace también la recepción del dinero (se confirmó contra un cuadre que ya no existe)', async () => {
    await reabrirTurno(18, ADMIN)
    expect(prismaMock.turnoCaja.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        recepcion_confirmada: false, dinero_recibido: null, fecha_recepcion: null,
      }),
    }))
  })

  it('NO toca los gastos ni los retiros: son movimientos reales del punto', async () => {
    await reabrirTurno(18, ADMIN)
    expect(prismaMock).not.toHaveProperty('gastoTurno')
    expect(prismaMock).not.toHaveProperty('retiroTurno')
  })
})

describe('reabrirTurno — candados', () => {
  it('rechaza un turno ya pagado en una nómina', async () => {
    prismaMock.turnoCaja.findUnique.mockResolvedValue({ ...turnoCerrado, pago_id: 3 })
    await expect(reabrirTurno(18, ADMIN)).rejects.toThrow(/pagado en una nómina/i)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rechaza si el depósito ya fue registrado en Finanzas', async () => {
    prismaMock.turnoCaja.findUnique.mockResolvedValue({
      ...turnoCerrado, depositos: [{ id: 7, estado: 'DEPOSITADO', monto_real: 236500 }],
    })
    await expect(reabrirTurno(18, ADMIN)).rejects.toThrow(/depósito/i)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rechaza si el PDV ya tiene otro turno abierto (dos ABIERTO rompen el POS)', async () => {
    prismaMock.turnoCaja.findFirst.mockResolvedValue({ id: 25 })
    await expect(reabrirTurno(18, ADMIN)).rejects.toThrow(/#25/)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rechaza un turno que no está cerrado', async () => {
    prismaMock.turnoCaja.findUnique.mockResolvedValue({ ...turnoCerrado, estado: 'ABIERTO' })
    await expect(reabrirTurno(18, ADMIN)).rejects.toThrow(/no está cerrado/i)
  })

  it('turno viejo sin lote de cierre: reabre igual pero avisa que el stock no se revirtió', async () => {
    prismaMock.turnoCaja.findUnique.mockResolvedValue({ ...turnoCerrado, cierre_lote_id: null })
    const r = await reabrirTurno(18, ADMIN)
    expect(r.stockRestaurable).toBe(false)
    expect(prismaMock.inventario.updateMany).not.toHaveBeenCalled()
  })
})
