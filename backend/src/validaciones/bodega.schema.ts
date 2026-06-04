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
  nombre:       z.string().min(1).max(200).optional(),
})

export type AjustarStockInput = z.infer<typeof ajustarStockSchema>

export const crearInventarioSchema = z.object({
  productoId:   z.number().int().positive(),
  stockActual:  z.number().int().min(0).default(0),
  stockCritico: z.number().int().min(0).default(0),
})

export type CrearInventarioInput = z.infer<typeof crearInventarioSchema>

export const crearProductoSchema = z.object({
  nombre:          z.string().min(1).max(100).trim(),
  categoriaId:     z.number().int().positive().optional(),
  categoriaNombre: z.string().min(1).max(50).trim().optional(),
  codigoBarra:     z.string().max(50).trim().optional(),
  precioVenta:     z.number().int().min(0).default(0),
  costo:           z.number().int().min(0).default(0),
  stockActual:     z.number().int().min(0).default(0),
  stockCritico:    z.number().int().min(0).default(0),
}).refine(d => d.categoriaId || d.categoriaNombre, {
  message: 'Debe indicar una categoría existente o el nombre de una nueva',
})

export type CrearProductoInput = z.infer<typeof crearProductoSchema>
