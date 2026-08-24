import { z } from 'zod'

// `pagoDiario` es un OVERRIDE opcional: null (o ausente al crear) significa
// "usar ConfigNomina.pago_diario_base", el valor global de la planilla (P13).
const pagoDiarioOverride = z.number().int().min(0).max(1_000_000).nullable()

export const crearPersonalSchema = z.object({
  nombre:     z.string().min(2).max(80),
  rut:        z.string().min(9).max(12),
  pdvId:      z.number().int().positive().nullable().optional(),
  pagoDiario: pagoDiarioOverride.optional(),
  email:      z.string().email().max(100).nullable().optional(),
  // Contraseña inicial opcional; si no viene, el backend genera una aleatoria
  // y la devuelve una única vez en la respuesta (passwordInicial).
  password:   z.string().min(4).max(50).optional(),
})

export const editarPersonalSchema = z.object({
  nombre:     z.string().min(2).max(80).optional(),
  pdvId:      z.number().int().positive().nullable().optional(),
  pagoDiario: pagoDiarioOverride.optional(),
  activo:     z.boolean().optional(),
  email:      z.string().email().max(100).nullable().optional(),
})

export type CrearPersonalInput  = z.infer<typeof crearPersonalSchema>
export type EditarPersonalInput = z.infer<typeof editarPersonalSchema>

// ─── Pagos / liquidación (planilla "Sueldos Feb 2026.xlsx") ──────────────────

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido')

/** Ajustes del cierre de período por vendedor (planilla, celdas H163 y H164). */
const ajustePagoSchema = z.object({
  usuarioId:    z.number().int().positive(),
  adicional:    z.number().int().min(0).max(5_000_000).default(0),
  cotizaciones: z.number().int().min(0).max(5_000_000).default(0),
})

export const generarPagosSchema = z.object({
  desde:   FECHA,
  hasta:   FECHA,
  ajustes: z.array(ajustePagoSchema).max(100).optional(),
  // Vendedores a liquidar. Ausente = todos los del rango (comportamiento
  // histórico); con valores, la UI liquida de a una persona a la vez.
  usuarioIds: z.array(z.number().int().positive()).min(1).max(100).optional(),
})

export const pagoDirectoSchema = z.object({
  usuarioId:      z.number().int().positive(),
  cantidadTurnos: z.number().int().positive().max(365),
  turnoId:        z.number().int().positive(),
  adicional:      z.number().int().min(0).max(5_000_000).optional(),
  cotizaciones:   z.number().int().min(0).max(5_000_000).optional(),
})

/**
 * "Adicional"/Extra del turno (planilla, columna E) en décimas.
 * Solo los cuatro valores de la validación de datos del Excel: 0 · 0,5 · 1 · 1,5.
 */
export const extraTurnoSchema = z.object({
  extraDecimas: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(15)]),
})

export type GenerarPagosInput = z.infer<typeof generarPagosSchema>
export type PagoDirectoInput  = z.infer<typeof pagoDirectoSchema>
export type ExtraTurnoInput   = z.infer<typeof extraTurnoSchema>

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
