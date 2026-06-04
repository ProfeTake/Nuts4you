import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../config/prisma'
import entorno from '../config/entorno'
import type { UsuarioReq } from '../middlewares/autenticar'

export interface LoginResult {
  token: string
  usuario: {
    id: number
    rut: string
    nombre: string
    rol: string
  }
  pdv: {
    id: number
    nombre: string
    tipo: string
    activo: boolean
  } | null
}

type PDVInfo = { id: number; nombre: string; tipo: string; activo: boolean }

/** Normaliza RUT: quita puntos y espacios — formato almacenado: XXXXXXXX-D */
function normalizarRut(rut: string): string {
  return rut.replace(/\./g, '').trim()
}

/**
 * Determina el PDV activo para el día de hoy:
 * 1. Busca TurnoPlaneado de hoy para el usuario → su PDV asignado ese día
 * 2. Si no hay turno planeado hoy, usa el pdv_id fijo del perfil
 * Esto permite que vendedores que rotan entre sucursales accedan al POS
 * correcto sin necesitar un pdv_id permanente en su perfil.
 */
async function resolverPDVHoy(usuarioId: number, pdvFijo: PDVInfo | null): Promise<PDVInfo | null> {
  const inicio = new Date()
  inicio.setUTCHours(0, 0, 0, 0)
  const fin = new Date(inicio)
  fin.setUTCDate(fin.getUTCDate() + 1)

  const turnoHoy = await prisma.turnoPlaneado.findFirst({
    where: { usuario_id: usuarioId, fecha: { gte: inicio, lt: fin } },
    include: { pdv: true },
  })

  if (turnoHoy) {
    return { id: turnoHoy.pdv.id, nombre: turnoHoy.pdv.nombre, tipo: turnoHoy.pdv.tipo, activo: turnoHoy.pdv.activo }
  }

  return pdvFijo
}

export async function login(rut: string, password: string): Promise<LoginResult> {
  const rutNormalizado = normalizarRut(rut)
  const u = await prisma.usuario.findFirst({
    where: { rut: rutNormalizado, activo: true },
    include: { rol: true, pdv: true },
  })

  if (!u) throw new Error('RUT o contraseña incorrectos')

  const passwordOk = await bcrypt.compare(password, u.password_hash)
  if (!passwordOk) throw new Error('RUT o contraseña incorrectos')

  const pdv = await resolverPDVHoy(u.id, u.pdv)

  const payload: UsuarioReq = {
    id:     u.id,
    rut:    u.rut,
    nombre: u.nombre,
    rol:    u.rol.nombre,
    pdvId:  pdv?.id ?? null,
  }

  const token = jwt.sign(payload, entorno.jwtSecret, {
    expiresIn: entorno.jwtExpiracion as jwt.SignOptions['expiresIn'],
  })

  return {
    token,
    usuario: { id: u.id, rut: u.rut, nombre: u.nombre, rol: u.rol.nombre },
    pdv: pdv ? { id: pdv.id, nombre: pdv.nombre, tipo: pdv.tipo, activo: pdv.activo } : null,
  }
}

export async function me(usuarioId: number): Promise<LoginResult['usuario'] & { pdv: LoginResult['pdv'] }> {
  const u = await prisma.usuario.findUniqueOrThrow({
    where: { id: usuarioId },
    include: { rol: true, pdv: true },
  })
  const pdv = await resolverPDVHoy(u.id, u.pdv)
  return {
    id: u.id, rut: u.rut, nombre: u.nombre, rol: u.rol.nombre,
    pdv: pdv ? { id: pdv.id, nombre: pdv.nombre, tipo: pdv.tipo, activo: pdv.activo } : null,
  }
}
