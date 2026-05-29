import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import entorno from '../config/entorno'

export interface UsuarioReq {
  id: number
  rut: string
  nombre: string
  rol: string
  pdvId: number | null
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
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
  }
}
