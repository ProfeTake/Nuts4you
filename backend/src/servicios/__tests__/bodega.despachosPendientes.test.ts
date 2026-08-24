/**
 * Tests de la bandeja "despachos por confirmar" del vendedor.
 *
 * Bug: los despachos originados por una solicitud se EXCLUÍAN de esta lista para
 * no mostrar el mismo envío dos veces. El efecto real era peor: el único acceso a
 * la confirmación quedaba escondido dentro de la tarjeta colapsada de Solicitudes,
 * y como el stock de un despacho ligado se acredita RECIÉN al confirmar (despacho
 * diferido), la vendedora se quedaba con el inventario en 0 sin saber por qué.
 * Ejecutar con: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    despacho:      { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    movimientoInv: { findMany: vi.fn() },
    pDV:           { findUnique: vi.fn() },
    usuario:       { findMany: vi.fn() },
    notificacion:  { createMany: vi.fn() },
    $transaction:  vi.fn(),
  }
  return { prismaMock }
})
vi.mock('../../config/prisma', () => ({ default: prismaMock }))

import { getDespachosPendientes, confirmarDespacho } from '../bodega.servicio'

const PDV_ID = 4
const VENDEDORA = { id: 8, nombre: 'María Elena', rol: 'VENDEDOR', pdvId: PDV_ID }

const despachoDeSolicitud = {
  lote_id: 'lote-solicitud', solicitud_id: 9, pdv_destino_id: PDV_ID, estado: 'ENVIADO',
  creado_en: new Date('2026-08-20T21:44:00Z'), usuario_envia_nombre: 'Bode',
  observacion: null, cantidad_items: 4, total_unidades: 14,
}
const despachoAdHoc = {
  lote_id: 'lote-adhoc', solicitud_id: null, pdv_destino_id: PDV_ID, estado: 'ENVIADO',
  creado_en: new Date('2026-08-20T18:00:00Z'), usuario_envia_nombre: 'Bode',
  observacion: 'sin pedido', cantidad_items: 1, total_unidades: 3,
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.movimientoInv.findMany.mockResolvedValue([])
})

describe('getDespachosPendientes', () => {
  it('incluye los despachos que vienen de una solicitud', async () => {
    prismaMock.despacho.findMany.mockResolvedValue([despachoDeSolicitud, despachoAdHoc])
    const r = await getDespachosPendientes(PDV_ID)
    expect(r.map((d) => d.loteId)).toEqual(['lote-solicitud', 'lote-adhoc'])
  })

  it('no filtra por solicitud_id: la consulta pide todos los ENVIADO del PDV', async () => {
    prismaMock.despacho.findMany.mockResolvedValue([])
    await getDespachosPendientes(PDV_ID)
    expect(prismaMock.despacho.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pdv_destino_id: PDV_ID, estado: 'ENVIADO' } }),
    )
  })

  it('expone solicitudId para que el POS sepa por dónde confirmar', async () => {
    prismaMock.despacho.findMany.mockResolvedValue([despachoDeSolicitud, despachoAdHoc])
    const r = await getDespachosPendientes(PDV_ID)
    expect(r[0].solicitudId).toBe(9)   // → PATCH /solicitudes/9/confirmar (acredita stock)
    expect(r[1].solicitudId).toBeNull() // → PATCH /bodega/despachos/:lote/confirmar
  })
})

describe('confirmarDespacho — no acepta despachos ligados a una solicitud', () => {
  it('rechaza el despacho de una solicitud (confirmarlo dejaría el stock sin acreditar)', async () => {
    prismaMock.despacho.findUnique.mockResolvedValue(despachoDeSolicitud)
    await expect(confirmarDespacho('lote-solicitud', VENDEDORA)).rejects.toThrow(/solicitud #9/i)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('el despacho ad-hoc sí se confirma por esta vía', async () => {
    prismaMock.despacho.findUnique.mockResolvedValue(despachoAdHoc)
    prismaMock.pDV.findUnique.mockResolvedValue({ nombre: 'Open Plaza' })
    prismaMock.usuario.findMany.mockResolvedValue([])
    prismaMock.$transaction.mockImplementation((cb: (tx: typeof prismaMock) => unknown) => cb(prismaMock))
    const r = await confirmarDespacho('lote-adhoc', VENDEDORA)
    expect(r.estado).toBe('CONFIRMADO')
  })
})
