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

// Despacho de una solicitud (A15): mueve stock real, así que el bodeguero
// declara las cantidades que efectivamente envía. Puede ajustar a la baja o
// poner 0 en un producto sin stock (de ahí `min(0)`), pero al menos un ítem
// debe quedar > 0 — eso lo valida el servicio, que conoce el pedido.
export const despacharSolicitudSchema = z.object({
  items: z.array(z.object({
    productoId: z.number().int().positive(),
    cantidad:   z.number().int().min(0),
  })).min(1, 'Debe incluir al menos un producto'),
  notas: z.string().max(500).optional(),
})

export type CrearSolicitudInput     = z.infer<typeof crearSolicitudSchema>
export type DespacharSolicitudInput = z.infer<typeof despacharSolicitudSchema>
