/**
 * Test de adopción de tiempoChile en rrhh (R4/A6).
 *
 * Verifica que getTurnosRRHH consulta el rango del mes usando rangoMesChile
 * (DST-aware) en lugar del offset fijo -04:00 anterior. Captura el `where`
 * pasado a Prisma y lo compara con el rango del helper.
 * Ejecutar con: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { turnoCaja: { findMany: vi.fn() } },
}))
vi.mock('../../config/prisma', () => ({ default: prismaMock }))
// Aísla dependencias transitivas que hacen I/O (correo).
vi.mock('../correo.servicio', () => ({ enviarCorreoHorario: vi.fn() }))

import { getTurnosRRHH } from '../rrhh.servicio'
import { rangoMesChile } from '../../lib/tiempoChile'

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.turnoCaja.findMany.mockResolvedValue([])
})

describe('getTurnosRRHH — adopta rangoMesChile (R4/A6)', () => {
  it('consulta el rango DST-aware del mes (gte/lte del helper)', async () => {
    await getTurnosRRHH('2026-06')

    const { inicio, fin } = rangoMesChile('2026-06')
    expect(prismaMock.turnoCaja.findMany).toHaveBeenCalledOnce()
    const where = prismaMock.turnoCaja.findMany.mock.calls[0][0].where
    expect(where.fecha_apertura.gte.getTime()).toBe(inicio.getTime())
    expect(where.fecha_apertura.lte.getTime()).toBe(fin.getTime())
  })
})
