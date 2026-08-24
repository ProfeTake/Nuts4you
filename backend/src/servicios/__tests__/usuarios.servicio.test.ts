/**
 * Tests de la guarda "último admin" en editarUsuario/cambiarEstadoUsuario (P4/A4)
 * y de la guarda "turno ABIERTO" al desactivar/eliminar (C19/A35).
 *
 * Bug de auditoría P4: solo eliminarUsuario protegía al único admin; editar
 * (degradar rol) o cambiar estado (desactivar) podían dejar al sistema sin
 * administrador activo → lockout total. Se replica el conteo transaccional.
 * Bug de auditoría C19: desactivar/eliminar un vendedor con turno ABIERTO lo
 * dejaba huérfano — sesión revocada, turno imposible de cerrar, PDV bloqueado.
 * Ejecutar con: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock, tx } = vi.hoisted(() => {
  const tx = {
    usuario:       { findUniqueOrThrow: vi.fn(), count: vi.fn(), update: vi.fn(), delete: vi.fn() },
    turnoCaja:     { findFirst: vi.fn(), updateMany: vi.fn() },
    retiroTurno:   { updateMany: vi.fn() },
    solicitud:     { updateMany: vi.fn() },
    turnoPlaneado: { deleteMany: vi.fn() },
  }
  const prismaMock = {
    rol:     { findUnique: vi.fn() },
    usuario: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    // formatearUsuario resuelve el pago diario efectivo con el valor global:
    // null aquí hace que getConfigSueldos() caiga en los defaults del Excel.
    configNomina: { findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  }
  return { prismaMock, tx }
})
vi.mock('../../config/prisma', () => ({ default: prismaMock }))
vi.mock('../correo.servicio', () => ({ enviarCredencialesUsuario: vi.fn() }))

import { editarUsuario, cambiarEstadoUsuario, eliminarUsuario } from '../usuarios.servicio'

const filaUsuario = {
  id: 1, rut: '11111111-1', nombre: 'Admin', email: 'a@a.cl', activo: true, es_demo: false,
  pago_diario: 0, rol: { nombre: 'VENDEDOR' }, pdv: null, turnos: [] as unknown[],
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.configNomina.findUnique.mockResolvedValue(null)
  prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
  tx.usuario.update.mockResolvedValue(filaUsuario)
  tx.turnoCaja.findFirst.mockResolvedValue(null) // por defecto: sin turno abierto
})

describe('editarUsuario — guarda último admin (P4/A4)', () => {
  it('degradar el rol del único admin activo lanza 409 y no actualiza', async () => {
    prismaMock.rol.findUnique.mockResolvedValue({ id: 3 })
    tx.usuario.findUniqueOrThrow.mockResolvedValue({ rol: { nombre: 'ADMIN' } })
    tx.usuario.count.mockResolvedValue(1)

    await expect(editarUsuario(1, { rol: 'VENDEDOR' })).rejects.toMatchObject({ estado: 409 })
    expect(tx.usuario.update).not.toHaveBeenCalled()
  })

  it('degradar rol cuando hay 2 admins activos procede', async () => {
    prismaMock.rol.findUnique.mockResolvedValue({ id: 3 })
    tx.usuario.findUniqueOrThrow.mockResolvedValue({ rol: { nombre: 'ADMIN' } })
    tx.usuario.count.mockResolvedValue(2)

    await editarUsuario(1, { rol: 'VENDEDOR' })
    expect(tx.usuario.update).toHaveBeenCalledOnce()
  })

  it('editar sin cambiar rol no dispara la guarda', async () => {
    await editarUsuario(1, { nombre: 'Nuevo' })
    expect(tx.usuario.findUniqueOrThrow).not.toHaveBeenCalled()
    expect(tx.usuario.count).not.toHaveBeenCalled()
    expect(tx.usuario.update).toHaveBeenCalledOnce()
  })

  it('mantener/asignar rol ADMIN no dispara la guarda', async () => {
    prismaMock.rol.findUnique.mockResolvedValue({ id: 1 })
    await editarUsuario(1, { rol: 'ADMIN' })
    expect(tx.usuario.findUniqueOrThrow).not.toHaveBeenCalled()
    expect(tx.usuario.update).toHaveBeenCalledOnce()
  })
})

describe('cambiarEstadoUsuario — guarda último admin (P4/A4)', () => {
  it('desactivar al único admin activo lanza 409 y no actualiza', async () => {
    tx.usuario.findUniqueOrThrow.mockResolvedValue({ rol: { nombre: 'ADMIN' } })
    tx.usuario.count.mockResolvedValue(1)

    await expect(cambiarEstadoUsuario(1, { activo: false })).rejects.toMatchObject({ estado: 409 })
    expect(tx.usuario.update).not.toHaveBeenCalled()
  })

  it('desactivar un admin cuando hay 2 admins activos procede', async () => {
    tx.usuario.findUniqueOrThrow.mockResolvedValue({ rol: { nombre: 'ADMIN' } })
    tx.usuario.count.mockResolvedValue(2)

    await cambiarEstadoUsuario(1, { activo: false })
    expect(tx.usuario.update).toHaveBeenCalledOnce()
  })

  it('desactivar un NO-admin no cuenta admins y procede', async () => {
    tx.usuario.findUniqueOrThrow.mockResolvedValue({ rol: { nombre: 'VENDEDOR' } })

    await cambiarEstadoUsuario(1, { activo: false })
    expect(tx.usuario.count).not.toHaveBeenCalled()
    expect(tx.usuario.update).toHaveBeenCalledOnce()
  })

  it('activar (activo=true) no dispara la guarda', async () => {
    await cambiarEstadoUsuario(1, { activo: true })
    expect(tx.usuario.findUniqueOrThrow).not.toHaveBeenCalled()
    expect(tx.usuario.update).toHaveBeenCalledOnce()
  })
})

describe('guarda turno ABIERTO al desactivar/eliminar (C19/A35)', () => {
  const turnoAbierto = { id: 77, pdv: { nombre: 'Mall Patio' } }

  it('desactivar un vendedor con turno ABIERTO lanza 409 y no actualiza', async () => {
    tx.usuario.findUniqueOrThrow.mockResolvedValue({ rol: { nombre: 'VENDEDOR' } })
    tx.turnoCaja.findFirst.mockResolvedValue(turnoAbierto)

    await expect(cambiarEstadoUsuario(1, { activo: false })).rejects.toMatchObject({ estado: 409 })
    expect(tx.usuario.update).not.toHaveBeenCalled()
  })

  it('desactivar sin turno abierto procede', async () => {
    tx.usuario.findUniqueOrThrow.mockResolvedValue({ rol: { nombre: 'VENDEDOR' } })

    await cambiarEstadoUsuario(1, { activo: false })
    expect(tx.turnoCaja.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { usuario_id: 1, estado: 'ABIERTO' } }),
    )
    expect(tx.usuario.update).toHaveBeenCalledOnce()
  })

  it('activar (activo=true) no consulta turnos', async () => {
    await cambiarEstadoUsuario(1, { activo: true })
    expect(tx.turnoCaja.findFirst).not.toHaveBeenCalled()
  })

  it('eliminar un usuario con turno ABIERTO lanza 409 y no borra nada', async () => {
    prismaMock.usuario.findUniqueOrThrow.mockResolvedValue({ nombre: 'Vende Dora', rol: { nombre: 'VENDEDOR' } })
    tx.turnoCaja.findFirst.mockResolvedValue(turnoAbierto)

    await expect(eliminarUsuario(1, 99)).rejects.toMatchObject({ estado: 409 })
    expect(tx.usuario.delete).not.toHaveBeenCalled()
    expect(tx.turnoCaja.updateMany).not.toHaveBeenCalled()
  })

  it('eliminar sin turno abierto procede (desvincula histórico y borra)', async () => {
    prismaMock.usuario.findUniqueOrThrow.mockResolvedValue({ nombre: 'Vende Dora', rol: { nombre: 'VENDEDOR' } })

    await eliminarUsuario(1, 99)
    expect(tx.turnoCaja.updateMany).toHaveBeenCalledOnce()
    expect(tx.usuario.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })
})
