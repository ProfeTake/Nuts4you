import { Router } from 'express'
import { autenticar } from '../middlewares/autenticar'
import { autorizar } from '../middlewares/autorizar'
import { solicitarGastoSchema, resolverGastoSchema } from '../validaciones/gastoAutorizacion.schema'
import {
  solicitarGasto,
  getSolicitudesGasto,
  getSolicitudesGastoTurno,
  getFotoSolicitud,
  resolverGasto,
  contarPendientes,
} from '../servicios/gastoAutorizacion.servicio'
import type { UsuarioCtx } from '../servicios/gastoAutorizacion.servicio'

const router = Router()

router.use(autenticar)

function ctx(req: { usuario?: { id: number; nombre: string; rol: string; pdvId: number | null } }): UsuarioCtx {
  return { id: req.usuario!.id, nombre: req.usuario!.nombre, rol: req.usuario!.rol, pdvId: req.usuario!.pdvId }
}

// POST /api/solicitudes-gasto — el vendedor pide autorización (monto, motivo, foto)
router.post('/', autorizar('VENDEDOR', 'ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  const parsed = solicitarGastoSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
    return
  }
  try {
    res.status(201).json({ data: await solicitarGasto(parsed.data, ctx(req)) })
  } catch (error) { next(error) }
})

// GET /api/solicitudes-gasto?estado=&pdvId= — listado para autorizadores
router.get('/', autorizar('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  const estado = typeof req.query.estado === 'string' ? req.query.estado : undefined
  const pdvId  = req.query.pdvId ? Number(req.query.pdvId) : undefined
  try {
    res.json({ data: await getSolicitudesGasto({ estado, pdvId }) })
  } catch (error) { next(error) }
})

// GET /api/solicitudes-gasto/pendientes/contar — badge de pendientes
router.get('/pendientes/contar', autorizar('ADMIN', 'SUPERVISOR'), async (_req, res, next) => {
  try {
    res.json({ data: { pendientes: await contarPendientes() } })
  } catch (error) { next(error) }
})

// GET /api/solicitudes-gasto/turno/:turnoId — estado de las solicitudes de un turno
router.get('/turno/:turnoId', async (req, res, next) => {
  const turnoId = Number(req.params.turnoId)
  if (!turnoId) { res.status(400).json({ error: 'turnoId inválido' }); return }
  try {
    res.json({ data: await getSolicitudesGastoTurno(turnoId, ctx(req)) })
  } catch (error) { next(error) }
})

// GET /api/solicitudes-gasto/:id/foto — foto del boucher (data URI base64)
router.get('/:id/foto', autorizar('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  const id = Number(req.params.id)
  if (!id) { res.status(400).json({ error: 'id inválido' }); return }
  try {
    res.json({ data: { foto: await getFotoSolicitud(id) } })
  } catch (error) { next(error) }
})

// PATCH /api/solicitudes-gasto/:id/resolver — aprobar o rechazar
router.patch('/:id/resolver', autorizar('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  const id = Number(req.params.id)
  if (!id) { res.status(400).json({ error: 'id inválido' }); return }
  const parsed = resolverGastoSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
    return
  }
  try {
    res.json({ data: await resolverGasto(id, parsed.data, ctx(req)) })
  } catch (error) { next(error) }
})

export default router
