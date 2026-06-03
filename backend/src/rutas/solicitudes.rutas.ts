import { Router } from 'express'
import { autenticar } from '../middlewares/autenticar'
import { autorizar } from '../middlewares/autorizar'
import { crearSolicitudSchema } from '../validaciones/solicitudes.schema'
import { crearSolicitud, getSolicitudes, despacharSolicitud, confirmarSolicitud } from '../servicios/solicitudes.servicio'

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
      if (error instanceof Error) {
        res.status(400).json({ error: error.message })
        return
      }
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

// PATCH /api/solicitudes/:id/despachar — bodeguero/admin despacha los productos
router.patch('/:id/despachar',
  autorizar('BODEGUERO', 'ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const id = parseInt(req.params.id as string, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
    try {
      const data = await despacharSolicitud(id)
      res.json({ data })
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message })
        return
      }
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
      const data = await confirmarSolicitud(id, req.usuario!.id)
      res.json({ data })
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message })
        return
      }
      next(error)
    }
  }
)

export default router
