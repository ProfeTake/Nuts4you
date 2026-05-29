import { z } from 'zod'

export const crearPersonalSchema = z.object({
  nombre:     z.string().min(2).max(80),
  rut:        z.string().min(9).max(12),
  pdvId:      z.number().int().positive().nullable().optional(),
  pagoDiario: z.number().int().min(0).default(28000),
})

export const editarPersonalSchema = z.object({
  nombre:     z.string().min(2).max(80).optional(),
  pdvId:      z.number().int().positive().nullable().optional(),
  pagoDiario: z.number().int().min(0).optional(),
  activo:     z.boolean().optional(),
})

export type CrearPersonalInput  = z.infer<typeof crearPersonalSchema>
export type EditarPersonalInput = z.infer<typeof editarPersonalSchema>

export const importarHorariosSchema = z.object({
  items: z.array(z.object({
    fecha:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido'),
    pdvId:     z.number().int().positive(),
    usuarioId: z.number().int().positive(),
  })).min(1, 'Debe incluir al menos un turno'),
})

export const actualizarTurnoPlaneadoSchema = z.object({
  usuarioId: z.number().int().positive(),
})

export type ImportarHorariosInput        = z.infer<typeof importarHorariosSchema>
export type ActualizarTurnoPlaneadoInput = z.infer<typeof actualizarTurnoPlaneadoSchema>
