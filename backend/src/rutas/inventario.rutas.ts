import { Router } from 'express'
import { autenticar } from '../middlewares/autenticar'
import { getInventarioPDV } from '../servicios/inventario.servicio'

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

    // Scope de rol: un VENDEDOR solo puede consultar el inventario del PDV donde
    // opera hoy (el pdvId resuelto en su token). ADMIN/SUPERVISOR/BODEGUERO ven cualquiera.
    if (req.usuario!.rol === 'VENDEDOR' && req.usuario!.pdvId !== pdvId) {
      res.status(403).json({ error: 'Acceso denegado' })
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

// Nota: el stock de un PDV NO se edita por API directa. Se actualiza por el flujo
// de cierre de turno (declaración de saldos) y por los despachos de bodega. El
// antiguo PATCH /:pdvId (sin UI, C8) se eliminó por ser endpoint muerto y superficie
// de escritura innecesaria sobre inventario.

export default router
