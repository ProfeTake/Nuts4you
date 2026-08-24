/**
 * Tests de resolverGasto — guarda de turno ABIERTO al aprobar (H3 / A1).
 *
 * Regresión del bug de auditoría: entre solicitar y aprobar un gasto el turno
 * puede cerrarse; aprobarlo igual crea un GastoTurno que ya no entra al cuadre
 * persistido (descuadre silencioso). Se exige turno ABIERTO al aprobar.
 * Ejecutar con: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock del cliente Prisma (default export de config/prisma). vi.mock se hoistea,
// así que los dobles se crean dentro de vi.hoisted para estar disponibles arriba.
const { prismaMock, tx } = vi.hoisted(() => {
  const tx = {
    turnoCaja:      { findUnique: vi.fn() },
    gastoTurno:     { create: vi.fn() },
    solicitudGasto: { update: vi.fn() },
    notificacion:   { create: vi.fn() },
  }
  const prismaMock = {
    solicitudGasto: { findUnique: vi.fn() },
    $transaction:   vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  }
  return { prismaMock, tx }
})
vi.mock('../../config/prisma', () => ({ default: prismaMock }))

import { resolverGasto, type UsuarioCtx } from '../gastoAutorizacion.servicio'

const admin: UsuarioCtx = { id: 1, nombre: 'Admin', rol: 'ADMIN', pdvId: null }
const solPendiente = {
  id: 5, turno_id: 10, estado: 'PENDIENTE', monto: 3000, motivo: 'Aseo', usuario_id: 2,
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
})

describe('resolverGasto — guarda de turno ABIERTO (H3/A1)', () => {
  it('aprobar con turno ABIERTO crea el GastoTurno y aprueba', async () => {
    prismaMock.solicitudGasto.findUnique.mockResolvedValue(solPendiente)
    tx.turnoCaja.findUnique.mockResolvedValue({ estado: 'ABIERTO' })
    tx.gastoTurno.create.mockResolvedValue({ id: 99 })

    const res = await resolverGasto(5, { aprobar: true }, admin)

    expect(tx.gastoTurno.create).toHaveBeenCalledOnce()
    expect(tx.solicitudGasto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: 'APROBADO', gasto_turno_id: 99 }),
      }),
    )
    expect(res).toEqual({ id: 5, estado: 'APROBADO' })
  })

  it('aprobar con turno CERRADO lanza 409 y NO crea GastoTurno ni resuelve', async () => {
    prismaMock.solicitudGasto.findUnique.mockResolvedValue(solPendiente)
    tx.turnoCaja.findUnique.mockResolvedValue({ estado: 'CERRADO' })

    await expect(resolverGasto(5, { aprobar: true }, admin)).rejects.toMatchObject({ estado: 409 })
    expect(tx.gastoTurno.create).not.toHaveBeenCalled()
    expect(tx.solicitudGasto.update).not.toHaveBeenCalled()
  })

  it('rechazar con turno CERRADO se permite (no tiene efecto de caja)', async () => {
    prismaMock.solicitudGasto.findUnique.mockResolvedValue(solPendiente)

    const res = await resolverGasto(5, { aprobar: false }, admin)

    expect(tx.turnoCaja.findUnique).not.toHaveBeenCalled()
    expect(tx.gastoTurno.create).not.toHaveBeenCalled()
    expect(tx.solicitudGasto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: 'RECHAZADO', gasto_turno_id: null }),
      }),
    )
    expect(res).toEqual({ id: 5, estado: 'RECHAZADO' })
  })

  it('resolver una solicitud ya resuelta lanza 409', async () => {
    prismaMock.solicitudGasto.findUnique.mockResolvedValue({ ...solPendiente, estado: 'APROBADO' })

    await expect(resolverGasto(5, { aprobar: true }, admin)).rejects.toMatchObject({ estado: 409 })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})
