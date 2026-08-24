import { Router } from 'express'
import { autenticar } from '../middlewares/autenticar'
import { autorizar }  from '../middlewares/autorizar'
import { registrarCierreSchema } from '../validaciones/cierrePreventivo.schema'
import {
  registrarCierrePreventivo,
  getCierresPreventivos,
  getCierresHoy,
  getTurnosActivos,
  getNotaVendedorVigente,
  getMisCierresPreventivos,
  eliminarCierrePreventivo,
  getTareasChecklist,
  crearTareaChecklist,
  eliminarTareaChecklist,
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

/** GET /api/cierres-preventivos/turnos-activos — Turnos abiertos ahora, para
 *  elegir a cuál hacerle el cierre preventivo. */
router.get('/turnos-activos',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (_req, res, next) => {
    try {
      const data = await getTurnosActivos()
      res.json({ data })
    } catch (error) { next(error) }
  }
)

/**
 * GET /api/cierres-preventivos/nota-vendedor — Nota/tarea vigente para el vendedor.
 * El vendedor lee la de SU PDV; admin/supervisor pueden pasar ?pdvId= para revisar.
 */
router.get('/nota-vendedor',
  autenticar,
  async (req, res, next) => {
    const esAdmin = req.usuario!.rol === 'ADMIN' || req.usuario!.rol === 'SUPERVISOR'
    const pdvId = esAdmin && req.query.pdvId
      ? parseInt(req.query.pdvId as string)
      : req.usuario!.pdvId
    if (!pdvId) { res.status(400).json({ error: 'Sin PDV asignado' }); return }
    try {
      const data = await getNotaVendedorVigente(pdvId)
      res.json({ data })
    } catch (error) { next(error) }
  }
)

/** GET /api/cierres-preventivos/mios — Cierres preventivos ocurridos durante los
 *  turnos del propio vendedor, para su historial "Mis Cierres". */
router.get('/mios',
  autenticar,
  async (req, res, next) => {
    try {
      const data = await getMisCierresPreventivos(req.usuario!.id)
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
      next(error)
    }
  }
)

/** GET /api/cierres-preventivos/tareas — Lista de tareas de la plantilla */
router.get('/tareas',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (_req, res, next) => {
    try {
      const data = await getTareasChecklist()
      res.json({ data })
    } catch (error) { next(error) }
  }
)

/** POST /api/cierres-preventivos/tareas — Crear tarea en la plantilla (solo ADMIN) */
router.post('/tareas',
  autenticar,
  autorizar('ADMIN'),
  async (req, res, next) => {
    const label = String(req.body.label ?? '').trim()
    if (!label) { res.status(400).json({ error: 'La descripción de la tarea es requerida' }); return }
    try {
      const data = await crearTareaChecklist(label)
      res.status(201).json({ data })
    } catch (error) { next(error) }
  }
)

/** DELETE /api/cierres-preventivos/tareas/:id — Eliminar tarea (solo ADMIN) */
router.delete('/tareas/:id',
  autenticar,
  autorizar('ADMIN'),
  async (req, res, next) => {
    const id = parseInt(req.params.id as string)
    if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
    try {
      const data = await eliminarTareaChecklist(id)
      res.json({ data })
    } catch (error) {
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
      next(error)
    }
  }
)

export default router
