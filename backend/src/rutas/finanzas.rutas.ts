import { Router } from 'express'
import { autenticar } from '../middlewares/autenticar'
import { autorizar } from '../middlewares/autorizar'
import { actualizarDepositoSchema } from '../validaciones/finanzas.schema'
import { getDepositos, actualizarDeposito } from '../servicios/finanzas.servicio'

const router = Router()

/** GET /api/finanzas/depositos — Lista de depósitos con estado */
router.get('/depositos',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (_req, res, next) => {
    try {
      const data = await getDepositos()
      res.json({ data })
    } catch (error) {
      next(error)
    }
  }
)

/** PATCH /api/finanzas/depositos/:id — Actualizar estado de un depósito */
router.patch('/depositos/:id',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const id = parseInt(req.params.id as string)
    if (isNaN(id)) {
      res.status(400).json({ error: 'id inválido' })
      return
    }

    const parsed = actualizarDepositoSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }

    try {
      const resultado = await actualizarDeposito(id, parsed.data)
      res.json({ data: resultado })
    } catch (error) {
      next(error)
    }
  }
)

export default router
