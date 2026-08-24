import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../config/prisma'
import entorno from '../config/entorno'
import { ErrorApp } from '../lib/errores'
import { fechaHoyChile } from '../lib/tiempoChile'
import type { UsuarioReq } from '../middlewares/autenticar'

export interface LoginResult {
  token: string
  usuario: {
    id: number
    rut: string
    nombre: string
    rol: string
    esDemo: boolean
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
 * 1. Busca TurnoPlaneado de hoy (publicado) para el usuario → su PDV ese día
 * 2. Si no hay turno planeado publicado hoy, usa el pdv_id fijo del perfil
 * Esto permite que vendedores que rotan entre sucursales accedan al POS
 * correcto sin necesitar un pdv_id permanente en su perfil.
 *
 * El día calendario se toma en hora de Chile (`fechaHoyChile`): con UTC, la ventana
 * ~20:00–23:59 chilena ya cae en el día siguiente y resolvería el PDV de mañana (C17).
 * PERO el filtro se hace por FRONTERA UTC del día: los TurnoPlaneado se guardan a
 * medianoche UTC (columna @db.Date, ej. `new Date("2026-07-31")` → 2026-07-31T00:00Z).
 * Usar la ventana en hora de Chile (04:00Z–03:59Z) dejaba la fecha guardada (00:00Z)
 * FUERA del rango → el vendedor nunca veía su sucursal aunque el turno estuviera
 * publicado. Solo turnos `publicado: true` (un borrador no cambia la sucursal, C18).
 */
async function resolverPDVHoy(usuarioId: number, pdvFijo: PDVInfo | null): Promise<PDVInfo | null> {
  // Fecha calendario de hoy en Chile → frontera de día en UTC (como se almacena).
  const [anio, mes, dia] = fechaHoyChile().split('-').map(Number)
  const inicio = new Date(Date.UTC(anio, mes - 1, dia))
  const fin    = new Date(Date.UTC(anio, mes - 1, dia + 1))

  const turnoHoy = await prisma.turnoPlaneado.findFirst({
    where: { usuario_id: usuarioId, publicado: true, fecha: { gte: inicio, lt: fin } },
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

  if (!u) throw new ErrorApp('RUT o contraseña incorrectos', 401)

  const passwordOk = await bcrypt.compare(password, u.password_hash)
  if (!passwordOk) throw new ErrorApp('RUT o contraseña incorrectos', 401)

  const pdv = await resolverPDVHoy(u.id, u.pdv)

  const payload: UsuarioReq = {
    id:     u.id,
    rut:    u.rut,
    nombre: u.nombre,
    rol:    u.rol.nombre,
    pdvId:  pdv?.id ?? null,
    esDemo: u.es_demo,
  }

  const token = jwt.sign(payload, entorno.jwtSecret, {
    expiresIn: entorno.jwtExpiracion as jwt.SignOptions['expiresIn'],
  })

  return {
    token,
    usuario: { id: u.id, rut: u.rut, nombre: u.nombre, rol: u.rol.nombre, esDemo: u.es_demo },
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
    id: u.id, rut: u.rut, nombre: u.nombre, rol: u.rol.nombre, esDemo: u.es_demo,
    pdv: pdv ? { id: pdv.id, nombre: pdv.nombre, tipo: pdv.tipo, activo: pdv.activo } : null,
  }
}
