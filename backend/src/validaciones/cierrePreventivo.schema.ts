import { z } from 'zod'

export const registrarCierreSchema = z.object({
  pdvId:         z.number().int().positive(),
  montoRetiro:   z.number().int().min(0).default(0),
  checklist:     z.array(z.object({
    label:   z.string().min(1).max(200),
    marcado: z.boolean(),
  })).min(1),
  notasVendedor: z.string().max(2000).optional(),
  observaciones: z.string().max(2000).optional(),
})

export type RegistrarCierreInput = z.infer<typeof registrarCierreSchema>
