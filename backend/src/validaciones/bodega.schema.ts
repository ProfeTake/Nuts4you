import { z } from 'zod'

export const despachoSchema = z.object({
  pdvDestinoId: z.number().int().positive(),
  items: z.array(z.object({
    productoId: z.number().int().positive(),
    cantidad:   z.number().int().positive(),
  })).min(1),
  observacion: z.string().max(300).optional(),
})

export type DespachoInput = z.infer<typeof despachoSchema>

export const ajustarStockSchema = z.object({
  stockActual:  z.number().int().min(0),
  stockCritico: z.number().int().min(0),
})

export type AjustarStockInput = z.infer<typeof ajustarStockSchema>

export const crearInventarioSchema = z.object({
  productoId:   z.number().int().positive(),
  stockActual:  z.number().int().min(0).default(0),
  stockCritico: z.number().int().min(0).default(0),
})

export type CrearInventarioInput = z.infer<typeof crearInventarioSchema>
