/**
 * Tests de acceso a turno — dueño exacto (H12/A13, decisión DP-H12).
 *
 * Antes el OR era laxo: un vendedor accedía al turno de OTRO vendedor del mismo
 * PDV (fuga de gastos/lecturas entre pares). Ahora un no-admin solo accede a SU
 * propio turno; ADMIN/SUPERVISOR a cualquiera. Se prueba vía getGastosTurno,
 * que pasa por getTurnoConAcceso.
 * Ejecutar con: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    turnoCaja:  { findUnique: vi.fn() },
    gastoTurno: { findMany: vi.fn() },
  },
}))
vi.mock('../../config/prisma', () => ({ default: prismaMock }))
vi.mock('../preparacion.servicio', () => ({ confirmarPreparacionEnApertura: vi.fn() }))

import { getGastosTurno, type UsuarioTurno } from '../pos.servicio'

// Turno del PDV 5 abierto por el vendedor #10.
const turno = { id: 42, usuario_id: 10, pdv_id: 5, estado: 'ABIERTO' }

const dueno       : UsuarioTurno = { id: 10, rol: 'VENDEDOR', pdvId: 5 }
const parMismoPdv : UsuarioTurno = { id: 99, rol: 'VENDEDOR', pdvId: 5 }
const ajeno       : UsuarioTurno = { id: 99, rol: 'VENDEDOR', pdvId: 7 }
const admin       : UsuarioTurno = { id: 1,  rol: 'ADMIN',    pdvId: null }

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.turnoCaja.findUnique.mockResolvedValue(turno)
  prismaMock.gastoTurno.findMany.mockResolvedValue([])
})

describe('getTurnoConAcceso vía getGastosTurno — dueño exacto (H12/A13)', () => {
  it('el vendedor dueño del turno accede', async () => {
    await expect(getGastosTurno(42, dueno)).resolves.toEqual([])
  })

  it('un vendedor del MISMO PDV (no dueño) ahora es rechazado con 403', async () => {
    await expect(getGastosTurno(42, parMismoPdv)).rejects.toMatchObject({ estado: 403 })
    expect(prismaMock.gastoTurno.findMany).not.toHaveBeenCalled()
  })

  it('un vendedor de otro PDV es rechazado con 403', async () => {
    await expect(getGastosTurno(42, ajeno)).rejects.toMatchObject({ estado: 403 })
  })

  it('ADMIN accede a cualquier turno', async () => {
    await expect(getGastosTurno(42, admin)).resolves.toEqual([])
  })

  it('turno inexistente lanza 404', async () => {
    prismaMock.turnoCaja.findUnique.mockResolvedValue(null)
    await expect(getGastosTurno(42, admin)).rejects.toMatchObject({ estado: 404 })
  })
})
