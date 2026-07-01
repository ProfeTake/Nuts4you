import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import entorno from '../config/entorno'

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

export function autenticar(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autorizado — token requerido' })
    return
  }

  const token = authHeader.slice(7)
  try {
    const payload = jwt.verify(token, entorno.jwtSecret) as UsuarioReq
    req.usuario = payload

    // Cuenta demo: el frontend simula TODOS los datos en el navegador (ver
    // lib/demoFixtures.ts) y nunca debería llegar a este punto salvo /auth/me.
    // Se bloquea acá cualquier acceso a la BD real (lectura o escritura) como
    // capa de seguridad, ya que este token se comparte externamente con
    // clientes potenciales y podría usarse directo contra la API.
    if (payload.esDemo && !req.originalUrl.startsWith('/api/auth/')) {
      res.status(403).json({ error: 'Modo demo: sin acceso a la base de datos real' })
      return
    }

    next()
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
  }
}
