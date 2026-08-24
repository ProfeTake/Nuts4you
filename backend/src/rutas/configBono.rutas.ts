import { Router } from 'express'
import { z } from 'zod'
import { autenticar } from '../middlewares/autenticar'
import { autorizar } from '../middlewares/autorizar'
import { getConfigBonos, guardarTramosPdv } from '../servicios/configBono.servicio'

const router = Router()

const guardarTramosSchema = z.object({
  tramos: z.array(z.object({
    umbral: z.number().int().min(0),
    monto:  z.number().int().min(0),
  })).max(20),
})

/** GET /api/config-bonos — configuración de bonos por sucursal (solo admin) */
router.get('/',
  autenticar,
  autorizar('ADMIN'),
  async (_req, res, next) => {
    try {
      res.json({ data: await getConfigBonos() })
    } catch (error) { next(error) }
  },
)

/** PUT /api/config-bonos/:pdvId — reemplaza los tramos de un PDV */
router.put('/:pdvId',
  autenticar,
  autorizar('ADMIN'),
  async (req, res, next) => {
    const pdvId = parseInt(req.params.pdvId as string)
    if (isNaN(pdvId)) { res.status(400).json({ error: 'pdvId inválido' }); return }

    const parsed = guardarTramosSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }
    try {
      const data = await guardarTramosPdv(pdvId, parsed.data.tramos)
      res.json({ data })
    } catch (error) {
      next(error)
    }
  },
)

export default router
