/**
 * Tests de despacharSolicitudConStock (A15 — fusión Solicitud ↔ Despacho).
 *
 * Bug de auditoría: "despachar" una solicitud solo cambiaba el estado y NO movía
 * inventario, así que la bodega nunca se descontaba y el PDV nunca recibía el
 * stock. Ahora el despacho de una solicitud es el movimiento real, con las
 * cantidades que el bodeguero declara enviar.
 * Ejecutar con: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    pDV:           { findFirstOrThrow: vi.fn(), findUnique: vi.fn() },
    solicitud:     { findUnique: vi.fn(), update: vi.fn() },
    producto:      { findMany: vi.fn() },
    inventario:    { updateMany: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() },
    movimientoInv: { create: vi.fn() },
    despacho:      { create: vi.fn() },
    turnoCaja:     { findFirst: vi.fn() },
    usuario:       { findMany: vi.fn() },
    notificacion:  { createMany: vi.fn() },
    $transaction:  vi.fn(),
  }
  return { prismaMock }
})
vi.mock('../../config/prisma', () => ({ default: prismaMock }))

import { despacharSolicitudConStock } from '../bodega.servicio'

const BODEGA_ID = 6
const PDV_ID    = 2
const BODEGUERO = { id: 4, nombre: 'Bode' }

// Solicitud PENDIENTE de 10 conos (#10) y 4 líquidos (#11).
const solPendiente = {
  id: 3, estado: 'PENDIENTE', pdv_id: PDV_ID,
  pdv:   { id: PDV_ID, nombre: 'Mall Patio', tipo: 'PUNTO_VENTA' },
  items: [{ producto_id: 10, cantidad: 10 }, { producto_id: 11, cantidad: 4 }],
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.pDV.findFirstOrThrow.mockResolvedValue({ id: BODEGA_ID, tipo: 'BODEGA' })
  prismaMock.solicitud.findUnique.mockResolvedValue(solPendiente)
  prismaMock.producto.findMany.mockResolvedValue([
    { id: 10, nombre: 'Cono simple' },
    { id: 11, nombre: 'Bebida 500' },
  ])
  // Descuento condicional exitoso (hay stock suficiente).
  prismaMock.inventario.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.inventario.upsert.mockResolvedValue({})
  prismaMock.movimientoInv.create.mockResolvedValue({})
  prismaMock.despacho.create.mockResolvedValue({})
  prismaMock.solicitud.update.mockResolvedValue({ id: 3, estado: 'DESPACHADA' })
  prismaMock.turnoCaja.findFirst.mockResolvedValue(null)
  prismaMock.usuario.findMany.mockResolvedValue([])
  prismaMock.$transaction.mockImplementation((cb: (tx: typeof prismaMock) => unknown) => cb(prismaMock))
})

describe('despacharSolicitudConStock — mueve stock real (A15)', () => {
  it('descuenta bodega, NO acredita el PDV todavía (diferido) y marca DESPACHADA', async () => {
    const res = await despacharSolicitudConStock(
      3, { items: [{ productoId: 10, cantidad: 10 }, { productoId: 11, cantidad: 4 }] }, BODEGUERO,
    )

    // Descuento en bodega, condicionado a stock suficiente (guarda anti-negativo).
    expect(prismaMock.inventario.updateMany).toHaveBeenCalledWith({
      where: { pdv_id: BODEGA_ID, producto_id: 10, stock_actual: { gte: 10 } },
      data:  { stock_actual: { decrement: 10 } },
    })
    // El stock NO entra al PDV en el despacho: queda "en camino" hasta que el
    // vendedor confirme la recepción (ahí se acredita). Sin upsert al PDV ahora.
    expect(prismaMock.inventario.upsert).not.toHaveBeenCalled()
    // El movimiento sí se registra (documenta el envío; se acredita al confirmar).
    expect(prismaMock.movimientoInv.create).toHaveBeenCalledTimes(2)
    expect(prismaMock.solicitud.update).toHaveBeenCalledWith({
      where: { id: 3 }, data: { estado: 'DESPACHADA' },
    })
    expect(res.destino).toBe('Mall Patio')
    expect(res.items).toBe(2)
  })

  it('el despacho queda enlazado a la solicitud (solicitud_id) para que se confirme desde ella', async () => {
    await despacharSolicitudConStock(3, { items: [{ productoId: 10, cantidad: 2 }] }, BODEGUERO)
    expect(prismaMock.despacho.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        solicitud_id:     3,
        pdv_destino_id:   PDV_ID,
        estado:           'ENVIADO',
        usuario_envia_id: BODEGUERO.id,
        total_unidades:   2,
      }),
    })
  })

  it('despacho parcial: solo envía los ítems con cantidad > 0', async () => {
    // El bodeguero no tiene líquidos: pone 0 y despacha solo los conos.
    const res = await despacharSolicitudConStock(
      3, { items: [{ productoId: 10, cantidad: 6 }, { productoId: 11, cantidad: 0 }] }, BODEGUERO,
    )
    expect(res.items).toBe(1)
    expect(prismaMock.movimientoInv.create).toHaveBeenCalledOnce()
    // La solicitud igual queda DESPACHADA (el pedido original conserva lo pedido).
    expect(prismaMock.solicitud.update).toHaveBeenCalledOnce()
  })

  it('rechaza productos que no estaban en el pedido (para eso está el despacho ad-hoc)', async () => {
    await expect(
      despacharSolicitudConStock(3, { items: [{ productoId: 99, cantidad: 1 }] }, BODEGUERO),
    ).rejects.toMatchObject({ estado: 400 })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rechaza el despacho si todas las cantidades son 0', async () => {
    await expect(
      despacharSolicitudConStock(3, { items: [{ productoId: 10, cantidad: 0 }] }, BODEGUERO),
    ).rejects.toMatchObject({ estado: 400 })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('solo despacha solicitudes PENDIENTE (no re-despacha una ya despachada) → 409', async () => {
    prismaMock.solicitud.findUnique.mockResolvedValue({ ...solPendiente, estado: 'DESPACHADA' })
    await expect(
      despacharSolicitudConStock(3, { items: [{ productoId: 10, cantidad: 1 }] }, BODEGUERO),
    ).rejects.toMatchObject({ estado: 409 })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('stock insuficiente en bodega aborta con 409 y no deja el stock negativo', async () => {
    // count 0 = ninguna fila cumplió `stock_actual >= cantidad`.
    prismaMock.inventario.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.inventario.findUnique.mockResolvedValue({ stock_actual: 3 })

    await expect(
      despacharSolicitudConStock(3, { items: [{ productoId: 10, cantidad: 10 }] }, BODEGUERO),
    ).rejects.toMatchObject({ estado: 409 })
    expect(prismaMock.inventario.upsert).not.toHaveBeenCalled()
    expect(prismaMock.solicitud.update).not.toHaveBeenCalled()
  })
})
