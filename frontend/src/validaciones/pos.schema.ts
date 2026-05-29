import { z } from 'zod'

// ─── Apertura de Turno ────────────────────────────────────────────────────────

export const saldoInicialSchema = z.object({
  saldoInicial: z
    .number()
    .int('El monto debe ser un número entero')
    .min(0, 'El saldo no puede ser negativo'),
})

export type SaldoInicialInput = z.infer<typeof saldoInicialSchema>

// ─── Cuadre de Caja (modal antes del cierre) ─────────────────────────────────

export const cuadreCajaSchema = z.object({
  efectivo:      z.number().int().min(0, 'No puede ser negativo'),
  tarjeta:       z.number().int().min(0, 'No puede ser negativo'),
  transferencia: z.number().int().min(0, 'No puede ser negativo'),
})

export type CuadreCajaInput = z.infer<typeof cuadreCajaSchema>

// ─── Cierre de Caja ───────────────────────────────────────────────────────────

export const stockFinalItemSchema = z.object({
  productoId: z.number().int().positive(),
  cantidad:   z.number().int().min(0, 'No puede ser negativo'),
})

export const cierreCajaSchema = z.object({
  cuadre:     cuadreCajaSchema,
  stockFinal: z.array(stockFinalItemSchema).min(1, 'Ingresa el saldo final de al menos un producto'),
})

export type CierreCajaInput = z.infer<typeof cierreCajaSchema>

// ─── Movimiento de caja (gasto / retiro / ingreso) ───────────────────────────

export const movimientoCajaSchema = z.object({
  descripcion: z
    .string()
    .min(1, 'Ingresa una descripción')
    .max(100, 'Máximo 100 caracteres'),
  monto: z
    .number()
    .int()
    .positive('El monto debe ser mayor a 0'),
  categoria: z.string().optional(),
})

export type MovimientoCajaInput = z.infer<typeof movimientoCajaSchema>
