import { z } from 'zod'

// Fecha en formato YYYY-MM-DD (día calendario chileno del turno a preparar).
const fechaISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD')

// ─── Guardar preparación del siguiente turno ──────────────────────────────────
// El admin/supervisor define, por sucursal y fecha, cuántas unidades de cada
// producto ingresarán. Los ítems con cantidad 0 se descartan (no se guardan).

export const guardarPreparacionSchema = z.object({
  pdvId: z.number().int().positive(),
  fecha: fechaISO,
  notas: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        productoId: z.number().int().positive(),
        cantidad:   z.number().int().min(0),
      }),
    )
    .default([]),
})

export type GuardarPreparacionInput = z.infer<typeof guardarPreparacionSchema>
