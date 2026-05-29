import { Router } from 'express'
import { autenticar } from '../middlewares/autenticar'
import { autorizar } from '../middlewares/autorizar'
import { actualizarInventarioSchema } from '../validaciones/inventario.schema'
import { getInventarioPDV, actualizarInventario } from '../servicios/inventario.servicio'

const router = Router()

/** GET /api/inventario/:pdvId — Stock actual del PDV */
router.get('/:pdvId',
  autenticar,
  async (req, res, next) => {
    const pdvId = parseInt(req.params.pdvId as string)
    if (isNaN(pdvId)) {
      res.status(400).json({ error: 'pdvId inválido' })
      return
    }

    try {
      const data = await getInventarioPDV(pdvId)
      res.json({ data })
    } catch (error) {
      next(error)
    }
  }
)

/** PATCH /api/inventario/:pdvId — Actualizar saldos de inventario */
router.patch('/:pdvId',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR', 'VENDEDOR', 'BODEGUERO'),
  async (req, res, next) => {
    const pdvId = parseInt(req.params.pdvId as string)
    if (isNaN(pdvId)) {
      res.status(400).json({ error: 'pdvId inválido' })
      return
    }

    const parsed = actualizarInventarioSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }

    try {
      const resultado = await actualizarInventario(pdvId, parsed.data)
      res.json({ data: resultado })
    } catch (error) {
      next(error)
    }
  }
)

export default router
