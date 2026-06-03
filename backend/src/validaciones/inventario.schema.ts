import { z } from 'zod'

export const actualizarInventarioSchema = z.object({
  items: z.array(z.object({
    productoId:  z.number().int().positive(),
    stockActual: z.number().int().min(0),
  })).min(1),
})

export type ActualizarInventarioInput = z.infer<typeof actualizarInventarioSchema>
