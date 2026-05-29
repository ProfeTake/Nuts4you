import { z } from 'zod'

export const loginSchema = z.object({
  rut: z
    .string()
    .min(1, 'RUT es obligatorio')
    .regex(/^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/, 'Formato RUT inválido (ej: 12345678-9)'),
  password: z
    .string()
    .min(1, 'Contraseña es obligatoria'),
})

export type LoginInput = z.infer<typeof loginSchema>
