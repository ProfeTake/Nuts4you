/**
 * Tests de la alerta de retiro en cierre preventivo (H11/A10, decisión DP-A10).
 *
 * monto_retiro es informativo (no se auto-genera RetiroTurno para no doble-contar).
 * Si el cierre declara más retiro del que hay registrado como RetiroTurno en el
 * turno abierto del PDV, se devuelve `alertaRetiro` para avisar el posible descuadre.
 * Ejecutar con: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    pDV:              { findUniqueOrThrow: vi.fn() },
    cierrePreventivo: { create: vi.fn() },
    turnoCaja:        { findFirst: vi.fn() },
    retiroTurno:      { aggregate: vi.fn() },
  },
}))
vi.mock('../../config/prisma', () => ({ default: prismaMock }))

import { registrarCierrePreventivo } from '../cierrePreventivo.servicio'

const filaCierre = {
  id: 1, pdv_id: 2, usuario_id: 9, fecha: new Date('2026-07-22T12:00:00Z'),
  monto_retiro: 0, checklist: [], notas_vendedor: null, observaciones: null,
  pdv: { nombre: 'Mall Patio' }, usuario: { nombre: 'Admin' },
}
const baseInput = { pdvId: 2, checklist: [] as unknown[] } as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  prismaMock.pDV.findUniqueOrThrow.mockResolvedValue({ id: 2 })
  prismaMock.cierrePreventivo.create.mockResolvedValue(filaCierre)
})

describe('registrarCierrePreventivo — alerta de retiro (H11/A10)', () => {
  it('sin retiro declarado no consulta turno ni alerta', async () => {
    const res = await registrarCierrePreventivo(9, { ...(baseInput as object), montoRetiro: 0 } as never)
    expect(prismaMock.turnoCaja.findFirst).not.toHaveBeenCalled()
    expect(res.alertaRetiro).toBeNull()
  })

  it('retiro declarado cubierto por RetiroTurno → sin alerta', async () => {
    prismaMock.turnoCaja.findFirst.mockResolvedValue({ id: 50 })
    prismaMock.retiroTurno.aggregate.mockResolvedValue({ _sum: { monto: 50000 } })
    const res = await registrarCierrePreventivo(9, { ...(baseInput as object), montoRetiro: 50000 } as never)
    expect(res.alertaRetiro).toBeNull()
  })

  it('retiro declarado mayor al registrado → alerta con montos', async () => {
    prismaMock.turnoCaja.findFirst.mockResolvedValue({ id: 50 })
    prismaMock.retiroTurno.aggregate.mockResolvedValue({ _sum: { monto: 20000 } })
    const res = await registrarCierrePreventivo(9, { ...(baseInput as object), montoRetiro: 50000 } as never)
    expect(res.alertaRetiro).toEqual({ montoDeclarado: 50000, retiroRegistrado: 20000 })
  })

  it('sin turno abierto en el PDV → alerta (nada registrado)', async () => {
    prismaMock.turnoCaja.findFirst.mockResolvedValue(null)
    const res = await registrarCierrePreventivo(9, { ...(baseInput as object), montoRetiro: 30000 } as never)
    expect(prismaMock.retiroTurno.aggregate).not.toHaveBeenCalled()
    expect(res.alertaRetiro).toEqual({ montoDeclarado: 30000, retiroRegistrado: 0 })
  })
})
