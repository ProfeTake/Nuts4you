/**
 * Tests de permiso de confirmarSolicitud — bypass ADMIN/SUP (H1 / A2).
 *
 * Bug de auditoría: una solicitud DESPACHADA solo la puede confirmar el vendedor
 * original; si ese vendedor queda inactivo, el pedido queda colgado sin salida.
 * Se permite override a ADMIN/SUPERVISOR (no a BODEGUERO: conflicto de deberes).
 * Ejecutar con: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock del cliente Prisma (default export de config/prisma). vi.mock se hoistea,
// así que los dobles se crean dentro de vi.hoisted para estar disponibles arriba.
const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    solicitud:     { findUnique: vi.fn(), update: vi.fn() },
    // A15: confirmar la solicitud también confirma el/los despacho(s) enlazado(s)
    // y luego se releen para devolverlos en la respuesta.
    despacho:      { updateMany: vi.fn(), findMany: vi.fn() },
    movimientoInv: { findMany: vi.fn() },
    // Acreditación diferida: al confirmar se suma el stock al inventario del PDV.
    inventario:    { upsert: vi.fn() },
    // La confirmación es transaccional: el doble ejecuta el callback pasándole
    // el mismo mock como cliente de transacción.
    $transaction: vi.fn(),
  }
  return { prismaMock }
})
vi.mock('../../config/prisma', () => ({ default: prismaMock }))

import { confirmarSolicitud } from '../solicitudes.servicio'

const VENDEDOR_ID = 7
const VENDEDORA   = { id: VENDEDOR_ID, nombre: 'Vale', rol: 'VENDEDOR' }
const OTRA        = { id: 99, nombre: 'Otra', rol: 'VENDEDOR' }
const ADMIN       = { id: 99, nombre: 'Jefa', rol: 'ADMIN' }
const SUPERVISOR  = { id: 99, nombre: 'Supe', rol: 'SUPERVISOR' }
const BODEGUERO   = { id: 99, nombre: 'Bode', rol: 'BODEGUERO' }

// Fila cruda que ve la guarda (findUnique sin include).
const solDespachada = { id: 3, estado: 'DESPACHADA', usuario_id: VENDEDOR_ID, pdv_id: 1 }

// Fila con relaciones que devuelve update() → alimenta formatearSolicitud.
const filaConfirmada = {
  id: 3, estado: 'CONFIRMADA', usuario_id: VENDEDOR_ID, pdv_id: 1, notas: null,
  fecha: new Date('2026-07-22T12:00:00Z'), fecha_cierre: new Date('2026-07-22T13:00:00Z'),
  pdv: { nombre: 'Mall Patio' }, usuario: { nombre: 'Vale' }, items: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.solicitud.findUnique.mockResolvedValue(solDespachada)
  prismaMock.solicitud.update.mockResolvedValue(filaConfirmada)
  prismaMock.despacho.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.despacho.findMany.mockResolvedValue([])
  prismaMock.movimientoInv.findMany.mockResolvedValue([])
  prismaMock.inventario.upsert.mockResolvedValue({})
  prismaMock.$transaction.mockImplementation((cb: (tx: typeof prismaMock) => unknown) => cb(prismaMock))
})

describe('confirmarSolicitud — permisos (H1/A2)', () => {
  it('el vendedor original confirma su solicitud DESPACHADA', async () => {
    const res = await confirmarSolicitud(3, VENDEDORA)
    expect(prismaMock.solicitud.update).toHaveBeenCalledOnce()
    expect(res.estado).toBe('CONFIRMADA')
  })

  it('otro VENDEDOR distinto es rechazado con 403', async () => {
    await expect(confirmarSolicitud(3, OTRA)).rejects.toMatchObject({ estado: 403 })
    expect(prismaMock.solicitud.update).not.toHaveBeenCalled()
  })

  it('ADMIN que no es el solicitante puede confirmar (bypass)', async () => {
    const res = await confirmarSolicitud(3, ADMIN)
    expect(prismaMock.solicitud.update).toHaveBeenCalledOnce()
    expect(res.estado).toBe('CONFIRMADA')
  })

  it('SUPERVISOR que no es el solicitante puede confirmar (bypass)', async () => {
    const res = await confirmarSolicitud(3, SUPERVISOR)
    expect(prismaMock.solicitud.update).toHaveBeenCalledOnce()
    expect(res.estado).toBe('CONFIRMADA')
  })

  it('BODEGUERO NO obtiene bypass (conflicto de deberes) → 403', async () => {
    await expect(confirmarSolicitud(3, BODEGUERO)).rejects.toMatchObject({ estado: 403 })
    expect(prismaMock.solicitud.update).not.toHaveBeenCalled()
  })

  it('estado distinto de DESPACHADA lanza 409 (sin importar el rol)', async () => {
    prismaMock.solicitud.findUnique.mockResolvedValue({ ...solDespachada, estado: 'PENDIENTE' })
    await expect(confirmarSolicitud(3, ADMIN)).rejects.toMatchObject({ estado: 409 })
    expect(prismaMock.solicitud.update).not.toHaveBeenCalled()
  })
})

// ─── A15: la confirmación cierra el despacho enlazado ────────────────────────
// El vendedor confirma la solicitud, no el despacho: el acuse debe propagarse al
// Despacho con solicitud_id (si no, quedaría ENVIADO para siempre).

describe('confirmarSolicitud — cierra el despacho enlazado (A15)', () => {
  it('marca CONFIRMADO el despacho de la solicitud con el nombre de quien confirma', async () => {
    await confirmarSolicitud(3, VENDEDORA)
    expect(prismaMock.despacho.updateMany).toHaveBeenCalledWith({
      where: { solicitud_id: 3, estado: 'ENVIADO' },
      data: expect.objectContaining({
        estado:                'CONFIRMADO',
        confirmado_por_id:     VENDEDOR_ID,
        confirmado_por_nombre: 'Vale',
      }),
    })
  })

  it('con bypass administrativo el snapshot guarda al admin, no al solicitante', async () => {
    await confirmarSolicitud(3, ADMIN)
    expect(prismaMock.despacho.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ confirmado_por_id: 99, confirmado_por_nombre: 'Jefa' }),
      }),
    )
  })

  it('devuelve los despachos enlazados con el detalle de lo que salió de bodega', async () => {
    prismaMock.despacho.findMany.mockResolvedValue([{
      lote_id: 'lote-1', solicitud_id: 3, estado: 'CONFIRMADO', usuario_envia_nombre: 'Bode',
      pdv_destino_id: 1, observacion: null,
      cantidad_items: 1, total_unidades: 5, creado_en: new Date('2026-07-22T12:30:00Z'),
    }])
    prismaMock.movimientoInv.findMany.mockResolvedValue([
      { lote_id: 'lote-1', producto_id: 10, cantidad: 5, producto: { nombre: 'Cono simple' } },
    ])

    const res = await confirmarSolicitud(3, VENDEDORA)
    expect(res.despachos).toHaveLength(1)
    expect(res.despachos[0]).toMatchObject({ loteId: 'lote-1', totalUnidades: 5, enviadoPor: 'Bode' })
    expect(res.despachos[0].items).toEqual([{ productoId: 10, producto: 'Cono simple', cantidad: 5 }])
  })
})
