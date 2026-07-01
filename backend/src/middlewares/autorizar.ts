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
      // El detalle se loguea en servidor para debugging, sin exponer el mapa de roles al cliente.
      console.warn(
        `[autorizar] Rol ${req.usuario.rol} sin acceso a ${req.method} ${req.originalUrl}. Roles permitidos: ${rolesPermitidos.join(', ')}`,
      )
      res.status(403).json({ error: 'Acceso denegado' })
      return
    }

    next()
  }
}
