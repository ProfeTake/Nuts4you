/**
 * Error operacional de negocio con código HTTP asociado.
 *
 * Los servicios lanzan ErrorApp para condiciones esperadas (validación,
 * conflicto de estado, recurso ajeno, etc.). El middleware `manejarErrores`
 * responde con `estado` y `message` tal cual. Cualquier otro Error se
 * considera inesperado y se responde 500 con mensaje genérico, sin exponer
 * internals (Prisma, stack traces) al cliente.
 */
export class ErrorApp extends Error {
  readonly estado: number

  constructor(mensaje: string, estado = 400) {
    super(mensaje)
    this.name = 'ErrorApp'
    this.estado = estado
  }
}

/** 404 — recurso inexistente */
export const noEncontrado = (recurso: string) => new ErrorApp(`${recurso} no encontrado`, 404)

/** 409 — conflicto de estado (ej. turno ya cerrado, PDV con turno abierto) */
export const conflicto = (mensaje: string) => new ErrorApp(mensaje, 409)

/** 403 — el recurso existe pero no pertenece al usuario/PDV que llama */
export const accesoDenegado = (mensaje = 'Acceso denegado') => new ErrorApp(mensaje, 403)
