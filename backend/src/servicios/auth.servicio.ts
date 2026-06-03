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

/** Normaliza RUT: quita puntos y espacios — formato almacenado: XXXXXXXX-D */
function normalizarRut(rut: string): string {
  return rut.replace(/\./g, '').trim()
}

export async function login(rut: string, password: string): Promise<LoginResult> {
  const rutNormalizado = normalizarRut(rut)
  const u = await prisma.usuario.findFirst({
    where: { rut: rutNormalizado, activo: true },
    include: {
      rol: true,
      pdv: true,
    },
  })

  if (!u) throw new Error('RUT o contraseña incorrectos')

  const passwordOk = await bcrypt.compare(password, u.password_hash)
  if (!passwordOk) throw new Error('RUT o contraseña incorrectos')

  const payload: UsuarioReq = {
    id:     u.id,
    rut:    u.rut,
    nombre: u.nombre,
    rol:    u.rol.nombre,
    pdvId:  u.pdv_id ?? null,
  }

  const token = jwt.sign(payload, entorno.jwtSecret, {
    expiresIn: entorno.jwtExpiracion as jwt.SignOptions['expiresIn'],
  })

  return {
    token,
    usuario: { id: u.id, rut: u.rut, nombre: u.nombre, rol: u.rol.nombre },
    pdv: u.pdv ? { id: u.pdv.id, nombre: u.pdv.nombre, tipo: u.pdv.tipo, activo: u.pdv.activo } : null,
  }
}

export async function me(usuarioId: number): Promise<LoginResult['usuario'] & { pdv: LoginResult['pdv'] }> {
  const u = await prisma.usuario.findUniqueOrThrow({
    where: { id: usuarioId },
    include: { rol: true, pdv: true },
  })
  return {
    id: u.id, rut: u.rut, nombre: u.nombre, rol: u.rol.nombre,
    pdv: u.pdv ? { id: u.pdv.id, nombre: u.pdv.nombre, tipo: u.pdv.tipo, activo: u.pdv.activo } : null,
  }
}
