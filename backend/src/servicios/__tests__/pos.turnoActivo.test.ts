/**
 * Tests de scope de getTurnoActivo (P6/A7).
 *
 * Bug de auditoría: GET /pos/turnos/activo no aplicaba scope → cualquier usuario
 * podía leer id/usuario/saldo inicial del turno activo de CUALQUIER PDV. Ahora
 * ADMIN/SUPERVISOR ven cualquiera; el resto solo su turno propio o el de su PDV.
 * Ejecutar con: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { turnoCaja: { findFirst: vi.fn() } },
}))
vi.mock('../../config/prisma', () => ({ default: prismaMock }))
// preparacion.servicio se importa transitivamente; se aísla para el test.
vi.mock('../preparacion.servicio', () => ({ confirmarPreparacionEnApertura: vi.fn() }))

import { getTurnoActivo, type UsuarioTurno } from '../pos.servicio'

// Turno activo del PDV 5, abierto por el vendedor #10.
const turnoPdv5 = {
  id: 42, pdv_id: 5, usuario_id: 10, estado: 'ABIERTO',
  fecha_apertura: new Date('2026-07-22T12:00:00Z'), saldo_inicial: 20000,
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.turnoCaja.findFirst.mockResolvedValue(turnoPdv5)
})

const admin: UsuarioTurno       = { id: 1, rol: 'ADMIN', pdvId: null }
const vendedorDueno: UsuarioTurno = { id: 10, rol: 'VENDEDOR', pdvId: null }
const vendedorMismoPdv: UsuarioTurno = { id: 99, rol: 'VENDEDOR', pdvId: 5 }
const vendedorAjeno: UsuarioTurno = { id: 99, rol: 'VENDEDOR', pdvId: 7 }

describe('getTurnoActivo — scope (P6/A7)', () => {
  it('ADMIN puede ver el turno activo de cualquier PDV', async () => {
    const res = await getTurnoActivo(5, admin)
    expect(res?.id).toBe(42)
  })

  it('el vendedor dueño del turno lo ve (usuario_id coincide)', async () => {
    const res = await getTurnoActivo(5, vendedorDueno)
    expect(res?.id).toBe(42)
  })

  it('un vendedor de ese mismo PDV lo ve (pdv_id coincide)', async () => {
    const res = await getTurnoActivo(5, vendedorMismoPdv)
    expect(res?.id).toBe(42)
  })

  it('un vendedor ajeno (otro PDV, otro usuario) es rechazado con 403', async () => {
    await expect(getTurnoActivo(5, vendedorAjeno)).rejects.toMatchObject({ estado: 403 })
  })

  it('sin turno activo devuelve null sin filtrar nada (aunque sea ajeno)', async () => {
    prismaMock.turnoCaja.findFirst.mockResolvedValue(null)
    const res = await getTurnoActivo(5, vendedorAjeno)
    expect(res).toBeNull()
  })
})
