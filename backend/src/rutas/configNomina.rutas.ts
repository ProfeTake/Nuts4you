import { Router } from 'express'
import { z } from 'zod'
import { autenticar } from '../middlewares/autenticar'
import { autorizar } from '../middlewares/autorizar'
import { getConfigNomina, guardarConfigNomina } from '../servicios/configNomina.servicio'

const router = Router()

// Todos los campos son opcionales: el panel guarda solo lo que el admin tocó y
// el servicio conserva el resto (ver guardarConfigNomina).
const guardarConfigSchema = z.object({
  // Pago por turno trabajado (planilla "Sueldos Feb 2026.xlsx", celda P13).
  pagoDiarioBase:      z.number().int().min(0).max(1_000_000).optional(),
  // Valor de una unidad de "Adicional"/Extra del turno (el 3.000 de la planilla).
  valorExtra:          z.number().int().min(0).max(100_000).optional(),
  // Cotizaciones sugeridas al liquidar (planilla, celda H164).
  cotizacionesDefault: z.number().int().min(0).max(500_000).optional(),
  // Tope razonable: la tolerancia es para descuadres de vuelto, no para faltantes
  // reales. 100.000 deja margen de sobra sin permitir desactivar el control.
  toleranciaFaltante:  z.number().int().min(0).max(100_000).optional(),
})

/** GET /api/config-nomina — parámetros del cálculo de sueldos (solo admin) */
router.get('/',
  autenticar,
  autorizar('ADMIN'),
  async (_req, res, next) => {
    try {
      res.json({ data: await getConfigNomina() })
    } catch (error) { next(error) }
  },
)

/** PUT /api/config-nomina — actualiza los parámetros globales de sueldos */
router.put('/',
  autenticar,
  autorizar('ADMIN'),
  async (req, res, next) => {
    const parsed = guardarConfigSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }
    try {
      res.json({ data: await guardarConfigNomina(parsed.data) })
    } catch (error) { next(error) }
  },
)

export default router
