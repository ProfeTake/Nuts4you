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
  // Precio de venta: solo lo aplica el servicio si el usuario es ADMIN y el
  // producto pertenece a una categoría de venta (Paquetes/Líquidos/Conos).
  precioVenta:  z.number().int().min(0).optional(),
  // Costo: solo ADMIN, cualquier categoría (las mezclas también tienen costo).
  // Antes era de solo-escritura al crear el producto (C7/A42).
  costo:        z.number().int().min(0).optional(),
})

export type AjustarStockInput = z.infer<typeof ajustarStockSchema>

// Merma explícita (C6/A40): baja de stock con causa propia, distinta de un
// ajuste genérico — queda como MovimientoInv tipo MERMA + HistorialInventario.
export const mermaSchema = z.object({
  cantidad: z.number().int().positive(),
  motivo:   z.string().min(1).max(200).trim(),
})

export type MermaInput = z.infer<typeof mermaSchema>

// Guardado por lote desde la tabla editable de inventario.
// Cada ítem aporta los ingresos/utilizadas del momento; el servidor calcula el saldo nuevo.
export const guardarLoteSchema = z.object({
  items: z.array(z.object({
    inventarioId: z.number().int().positive(),
    nombre:       z.string().min(1).max(200).optional(),
    ingresos:     z.number().int().min(0).default(0),
    utilizadas:   z.number().int().min(0).default(0),
  })).min(1).max(200),
})

export type GuardarLoteInput = z.infer<typeof guardarLoteSchema>

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
