import { Router } from 'express'
import { autenticar } from '../middlewares/autenticar'
import { autorizar }  from '../middlewares/autorizar'
import { registrarCierreSchema } from '../validaciones/cierrePreventivo.schema'
import {
  registrarCierrePreventivo,
  getCierresPreventivos,
  getCierresHoy,
  eliminarCierrePreventivo,
} from '../servicios/cierrePreventivo.servicio'

const router = Router()

/** GET /api/cierres-preventivos/hoy — IDs de PDVs con cierre preventivo hoy */
router.get('/hoy',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (_req, res, next) => {
    try {
      const data = await getCierresHoy()
      res.json({ data })
    } catch (error) { next(error) }
  }
)

/** GET /api/cierres-preventivos?pdvId=&desde=&hasta= */
router.get('/',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const pdvId = req.query.pdvId ? parseInt(req.query.pdvId as string) : undefined
    const desde = String(req.query.desde ?? '').trim() || undefined
    const hasta = String(req.query.hasta ?? '').trim() || undefined
    try {
      const data = await getCierresPreventivos({ pdvId, desde, hasta })
      res.json({ data })
    } catch (error) { next(error) }
  }
)

/** POST /api/cierres-preventivos — Registrar cierre preventivo */
router.post('/',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    if (!req.usuario) { res.status(401).json({ error: 'No autorizado' }); return }
    const parsed = registrarCierreSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }
    try {
      const data = await registrarCierrePreventivo(req.usuario.id, parsed.data)
      res.status(201).json({ data })
    } catch (error) {
      if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
      next(error)
    }
  }
)

/** DELETE /api/cierres-preventivos/:id — Eliminar registro (solo ADMIN) */
router.delete('/:id',
  autenticar,
  autorizar('ADMIN'),
  async (req, res, next) => {
    const id = parseInt(req.params.id as string)
    if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
    try {
      const data = await eliminarCierrePreventivo(id)
      res.json({ data })
    } catch (error) {
      if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
      next(error)
    }
  }
)

export default router
