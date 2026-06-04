import { z } from 'zod'

export const crearProveedorSchema = z.object({
  nombre:        z.string().min(1).max(200),
  rut:           z.string().max(20).optional(),
  contacto:      z.string().max(300).optional(),
  banco:         z.string().max(100).optional(),
  tipoCuenta:    z.string().max(50).optional(),
  numeroCuenta:  z.string().max(100).optional(),
})

export const toggleActivoSchema = z.object({
  activo: z.boolean(),
})

export const crearFacturaSchema = z.object({
  proveedorId:      z.number().int().positive(),
  numeroFactura:    z.string().min(1).max(100),
  fecha:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  montoTotal:       z.number().int().positive(),
  notas:            z.string().max(1000).optional(),
  items: z.array(z.object({
    descripcion:    z.string().min(1).max(300),
    cantidad:       z.number().int().positive(),
    precioUnitario: z.number().int().min(0),
  })).min(1),
})

export const actualizarEstadoFacturaSchema = z.object({
  estado: z.enum(['PENDIENTE', 'PAGADA', 'ANULADA']),
})

export type CrearProveedorInput          = z.infer<typeof crearProveedorSchema>
export type CrearFacturaInput            = z.infer<typeof crearFacturaSchema>
export type ActualizarEstadoFacturaInput = z.infer<typeof actualizarEstadoFacturaSchema>
export type ToggleActivoInput            = z.infer<typeof toggleActivoSchema>
