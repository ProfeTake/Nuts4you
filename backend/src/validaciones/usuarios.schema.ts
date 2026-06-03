import { z } from 'zod'

export const crearUsuarioSchema = z.object({
  rut:        z.string().regex(/^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/, 'RUT inválido (ej: 12345678-9)'),
  nombre:     z.string().min(2).max(80),
  password:   z.string().min(4, 'Mínimo 4 caracteres'),
  rol:        z.enum(['ADMIN', 'SUPERVISOR', 'BODEGUERO', 'VENDEDOR']),
  pdvId:      z.number().int().positive().optional().nullable(),
  pagoDiario: z.number().int().min(0).default(28000),
})

export const editarUsuarioSchema = z.object({
  rut:        z.string().regex(/^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/, 'RUT inválido (ej: 12345678-9)').optional(),
  nombre:     z.string().min(2).max(80).optional(),
  password:   z.string().min(4).optional(),
  rol:        z.enum(['ADMIN', 'SUPERVISOR', 'BODEGUERO', 'VENDEDOR']).optional(),
  pdvId:      z.number().int().positive().nullable().optional(),
  pagoDiario: z.number().int().min(0).optional(),
})

export const estadoUsuarioSchema = z.object({
  activo: z.boolean(),
})

export type CrearUsuarioInput  = z.infer<typeof crearUsuarioSchema>
export type EditarUsuarioInput = z.infer<typeof editarUsuarioSchema>
export type EstadoUsuarioInput = z.infer<typeof estadoUsuarioSchema>
