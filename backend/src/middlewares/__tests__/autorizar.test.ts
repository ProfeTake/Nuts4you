/**
 * Tests del middleware autorizar — contrato de autorización por rol.
 *
 * Fija la política que consumen las rutas (401 sin usuario, 403 rol no listado,
 * next() para rol permitido) y la política SUPERVISOR de A5/D1 (RRHH solo ADMIN,
 * Facturas también SUPERVISOR).
 * Ejecutar con: npm test
 */
import { describe, it, expect, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { autorizar } from '../autorizar'

function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this },
    json(payload: unknown) { this.body = payload; return this },
  }
  return res as unknown as Response & { statusCode: number; body: unknown }
}

function run(roles: string[], usuario: { rol: string } | undefined) {
  const req = { usuario, method: 'GET', originalUrl: '/x' } as unknown as Request
  const res = fakeRes()
  const next = vi.fn() as unknown as NextFunction
  autorizar(...roles)(req, res, next as NextFunction)
  return { res, next: next as unknown as ReturnType<typeof vi.fn> }
}

describe('autorizar — contrato por rol', () => {
  it('sin req.usuario responde 401 y no llama next()', () => {
    const { res, next } = run(['ADMIN'], undefined)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rol permitido llama next() y no responde error', () => {
    const { res, next } = run(['ADMIN', 'SUPERVISOR'], { rol: 'SUPERVISOR' })
    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(0)
  })

  it('rol no listado responde 403 y no llama next()', () => {
    const { res, next } = run(['ADMIN', 'SUPERVISOR'], { rol: 'VENDEDOR' })
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  describe('política SUPERVISOR de A5/D1 (P1)', () => {
    // RRHH/Nómina/sueldos → solo ADMIN (SUPERVISOR queda fuera).
    const setRRHH = ['ADMIN']
    it('RRHH: ADMIN entra', () => {
      const { next } = run(setRRHH, { rol: 'ADMIN' })
      expect(next).toHaveBeenCalledOnce()
    })
    it('RRHH: SUPERVISOR queda fuera → 403 (no ve sueldos)', () => {
      const { res, next } = run(setRRHH, { rol: 'SUPERVISOR' })
      expect(res.statusCode).toBe(403)
      expect(next).not.toHaveBeenCalled()
    })

    // Facturas/Proveedores → ADMIN y SUPERVISOR (SUPERVISOR sí ve facturas).
    const setFacturas = ['ADMIN', 'SUPERVISOR']
    it('Facturas: SUPERVISOR entra', () => {
      const { next } = run(setFacturas, { rol: 'SUPERVISOR' })
      expect(next).toHaveBeenCalledOnce()
    })
  })
})
