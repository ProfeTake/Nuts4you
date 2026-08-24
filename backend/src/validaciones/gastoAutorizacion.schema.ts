import { z } from 'zod'

// ─── Solicitud de gasto (vendedor) ────────────────────────────────────────────
// El vendedor pide autorización de un gasto: monto, motivo y (opcional) la foto
// del boucher como data URI base64. La foto se comprime en el navegador; aun así
// se permite un tamaño amplio (el body de esta ruta usa un límite mayor).

export const solicitarGastoSchema = z.object({
  turnoId:   z.number().int().positive(),
  monto:     z.number().int().positive(),
  motivo:    z.string().trim().min(3).max(500),
  categoria: z.string().trim().max(50).optional(),
  foto: z
    .string()
    .max(5_000_000, 'La foto es demasiado grande')
    .refine((s) => s.startsWith('data:image/'), 'La foto debe ser una imagen')
    .optional(),
})

// ─── Resolución (supervisor / admin) ──────────────────────────────────────────

export const resolverGastoSchema = z.object({
  aprobar:    z.boolean(),
  comentario: z.string().trim().max(500).optional(),
})

export type SolicitarGastoInput = z.infer<typeof solicitarGastoSchema>
export type ResolverGastoInput  = z.infer<typeof resolverGastoSchema>
