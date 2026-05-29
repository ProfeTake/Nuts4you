import type { Request, Response, NextFunction } from 'express'

/**
 * Middleware de autorización por rol.
 * Uso: autorizar('ADMIN', 'SUPERVISOR')
 *
 * Debe ir DESPUÉS de autenticar() en la cadena de middlewares.
 */
export function autorizar(...rolesPermitidos: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.usuario) {
      res.status(401).json({ error: 'No autorizado' })
      return
    }

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      res.status(403).json({
        error: 'Sin permisos',
        detalle: `Rol ${req.usuario.rol} no tiene acceso. Roles permitidos: ${rolesPermitidos.join(', ')}`,
      })
      return
    }

    next()
  }
}
