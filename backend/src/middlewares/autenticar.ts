import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import entorno from '../config/entorno'
import prisma from '../config/prisma'

export interface UsuarioReq {
  id: number
  rut: string
  nombre: string
  rol: string
  pdvId: number | null
  esDemo?: boolean
}

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioReq
    }
  }
}

export async function autenticar(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autorizado — token requerido' })
    return
  }

  const token = authHeader.slice(7)
  let payload: UsuarioReq
  try {
    payload = jwt.verify(token, entorno.jwtSecret) as UsuarioReq
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
    return
  }

  // Cuenta demo: el frontend simula TODOS los datos en el navegador (ver
  // lib/demoFixtures.ts) y nunca debería llegar a este punto salvo /auth/me.
  // Se bloquea acá cualquier acceso a la BD real (lectura o escritura) como
  // capa de seguridad, ya que este token se comparte externamente con
  // clientes potenciales y podría usarse directo contra la API.
  if (payload.esDemo && !req.originalUrl.startsWith('/api/auth/')) {
    res.status(403).json({ error: 'Modo demo: sin acceso a la base de datos real' })
    return
  }

  // Revocación efectiva: el JWT es stateless (8 h), así que rol y estado se
  // revalidan contra la BD en cada request. Desactivar un usuario o cambiarle
  // el rol surte efecto de inmediato, sin esperar a que expire el token.
  try {
    const u = await prisma.usuario.findUnique({
      where:  { id: payload.id },
      select: { activo: true, rol: { select: { nombre: true } } },
    })
    if (!u || !u.activo) {
      res.status(401).json({ error: 'Sesión revocada — vuelve a iniciar sesión' })
      return
    }
    req.usuario = { ...payload, rol: u.rol.nombre }
    next()
  } catch (error) {
    next(error)
  }
}
