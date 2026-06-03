import { z } from 'zod'

export const actualizarDepositoSchema = z.object({
  estado:       z.enum(['CONFIRMADO', 'TRANSFERENCIA']),
  montoReal:    z.number().int().min(0).optional(),
  fechaDeposito: z.string().optional(),
})

export type ActualizarDepositoInput = z.infer<typeof actualizarDepositoSchema>
