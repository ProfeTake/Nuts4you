import { z } from 'zod'

export const itemSolicitudSchema = z.object({
  productoId: z.number().int().positive(),
  cantidad:   z.number().int().positive(),
})

export const crearSolicitudSchema = z.object({
  pdvId: z.number().int().positive(),
  items: z.array(itemSolicitudSchema).min(1, 'Debe incluir al menos un producto'),
  notas: z.string().max(500).optional(),
})

export const despacharSolicitudSchema = z.object({
  notas: z.string().max(500).optional(),
})

export type CrearSolicitudInput   = z.infer<typeof crearSolicitudSchema>
export type DespacharSolicitudInput = z.infer<typeof despacharSolicitudSchema>
