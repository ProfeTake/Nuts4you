import { Router } from 'express'
import { autenticar } from '../middlewares/autenticar'
import { autorizar } from '../middlewares/autorizar'
import { crearSolicitudSchema, despacharSolicitudSchema } from '../validaciones/solicitudes.schema'
import { crearSolicitud, getSolicitudes, despacharSolicitud, regularizarSolicitud, confirmarSolicitud, rechazarSolicitud } from '../servicios/solicitudes.servicio'

const router = Router()

router.use(autenticar)

// POST /api/solicitudes — vendedor/bodeguero crea solicitud de insumos
router.post('/',
  autorizar('VENDEDOR', 'BODEGUERO', 'ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const parsed = crearSolicitudSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }
    try {
      const data = await crearSolicitud(parsed.data, req.usuario!.id)
      res.status(201).json({ data })
    } catch (error) {
      next(error)
    }
  }
)

// GET /api/solicitudes — lista solicitudes según rol
// ?pdvId= filtra por sucursal (solo ADMIN/SUPERVISOR/BODEGUERO)
router.get('/',
  autorizar('VENDEDOR', 'BODEGUERO', 'ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const filtroPdvId = req.query.pdvId ? parseInt(req.query.pdvId as string, 10) : undefined
    try {
      const data = await getSolicitudes(
        req.usuario!.rol,
        req.usuario!.id,
        filtroPdvId,
      )
      res.json({ data })
    } catch (error) {
      next(error)
    }
  }
)

// PATCH /api/solicitudes/:id/despachar — bodeguero/admin despacha los productos.
// MUEVE STOCK real (A15): el body trae las cantidades efectivamente enviadas
// (pueden ser menores a las pedidas, o 0 en un producto sin stock).
router.patch('/:id/despachar',
  autorizar('BODEGUERO', 'ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const id = parseInt(req.params.id as string, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
    const parsed = despacharSolicitudSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }
    try {
      const data = await despacharSolicitud(id, parsed.data, req.usuario!)
      res.json({ data })
    } catch (error) {
      next(error)
    }
  }
)

// PATCH /api/solicitudes/:id/regularizar — mueve el stock de una entrega que quedó
// registrada como despachada/confirmada pero nunca descontó bodega (pedidos
// cerrados con el flujo anterior a A15). No cambia el estado de la solicitud.
router.patch('/:id/regularizar',
  autorizar('BODEGUERO', 'ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const id = parseInt(req.params.id as string, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
    const parsed = despacharSolicitudSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }
    try {
      const data = await regularizarSolicitud(id, parsed.data, req.usuario!)
      res.json({ data })
    } catch (error) {
      next(error)
    }
  }
)

// PATCH /api/solicitudes/:id/rechazar — bodeguero/admin rechaza el pedido (A18)
router.patch('/:id/rechazar',
  autorizar('BODEGUERO', 'ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const id = parseInt(req.params.id as string, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
    const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo : undefined
    try {
      const data = await rechazarSolicitud(id, motivo)
      res.json({ data })
    } catch (error) {
      next(error)
    }
  }
)

// PATCH /api/solicitudes/:id/confirmar — vendedor confirma recepción
router.patch('/:id/confirmar',
  autorizar('VENDEDOR', 'BODEGUERO', 'ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const id = parseInt(req.params.id as string, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
    try {
      const data = await confirmarSolicitud(id, req.usuario!)
      res.json({ data })
    } catch (error) {
      next(error)
    }
  }
)

export default router
