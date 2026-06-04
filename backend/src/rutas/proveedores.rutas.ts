import { Router } from 'express'
import { autenticar } from '../middlewares/autenticar'
import { autorizar }  from '../middlewares/autorizar'
import {
  crearProveedorSchema,
  toggleActivoSchema,
  crearFacturaSchema,
  actualizarEstadoFacturaSchema,
} from '../validaciones/proveedores.schema'
import {
  getProveedores,
  crearProveedor,
  editarProveedor,
  toggleActivoProveedor,
  eliminarProveedor,
  getFacturas,
  crearFactura,
  actualizarEstadoFactura,
  eliminarFactura,
  getResumenFacturasMes,
} from '../servicios/proveedores.servicio'

const router = Router()

// ─── Proveedores ─────────────────────────────────────────────────────────────

/** GET /api/proveedores — Lista de proveedores */
router.get('/',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (_req, res, next) => {
    try {
      const data = await getProveedores()
      res.json({ data })
    } catch (error) { next(error) }
  }
)

/** POST /api/proveedores — Crear proveedor */
router.post('/',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const parsed = crearProveedorSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }
    try {
      const data = await crearProveedor(parsed.data)
      res.status(201).json({ data })
    } catch (error) {
      if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
      next(error)
    }
  }
)

/** PATCH /api/proveedores/:id — Editar proveedor */
router.patch('/:id',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const id = parseInt(req.params.id as string)
    if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
    const parsed = crearProveedorSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }
    try {
      const data = await editarProveedor(id, parsed.data)
      res.json({ data })
    } catch (error) {
      if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
      next(error)
    }
  }
)

/** PATCH /api/proveedores/:id/activo — Activar o desactivar proveedor */
router.patch('/:id/activo',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const id = parseInt(req.params.id as string)
    if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
    const parsed = toggleActivoSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }
    try {
      const data = await toggleActivoProveedor(id, parsed.data.activo)
      res.json({ data })
    } catch (error) {
      if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
      next(error)
    }
  }
)

/** DELETE /api/proveedores/:id — Eliminar proveedor (solo si no tiene facturas) */
router.delete('/:id',
  autenticar,
  autorizar('ADMIN'),
  async (req, res, next) => {
    const id = parseInt(req.params.id as string)
    if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
    try {
      const data = await eliminarProveedor(id)
      res.json({ data })
    } catch (error) {
      if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
      next(error)
    }
  }
)

// ─── Facturas ─────────────────────────────────────────────────────────────────

/** GET /api/proveedores/facturas/resumen?mes=YYYY-MM — Resumen del mes para dashboard */
router.get('/facturas/resumen',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const mes = String(req.query.mes ?? '').trim()
    if (!mes) { res.status(400).json({ error: 'Falta parámetro mes (YYYY-MM)' }); return }
    try {
      const data = await getResumenFacturasMes(mes)
      res.json({ data })
    } catch (error) { next(error) }
  }
)

/** GET /api/proveedores/facturas?mes=&proveedorId=&estado= */
router.get('/facturas',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const mes         = String(req.query.mes ?? '').trim() || undefined
    const proveedorId = req.query.proveedorId ? parseInt(req.query.proveedorId as string) : undefined
    const estado      = String(req.query.estado ?? '').trim() || undefined
    try {
      const data = await getFacturas({ mes, proveedorId, estado })
      res.json({ data })
    } catch (error) { next(error) }
  }
)

/** POST /api/proveedores/facturas — Crear factura con detalle */
router.post('/facturas',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const parsed = crearFacturaSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }
    try {
      const data = await crearFactura(parsed.data)
      res.status(201).json({ data })
    } catch (error) {
      if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
      next(error)
    }
  }
)

/** PATCH /api/proveedores/facturas/:id/estado — Cambiar estado de factura */
router.patch('/facturas/:id/estado',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const id = parseInt(req.params.id as string)
    if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
    const parsed = actualizarEstadoFacturaSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }
    try {
      const data = await actualizarEstadoFactura(id, parsed.data)
      res.json({ data })
    } catch (error) {
      if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
      next(error)
    }
  }
)

/** DELETE /api/proveedores/facturas/:id — Eliminar factura */
router.delete('/facturas/:id',
  autenticar,
  autorizar('ADMIN'),
  async (req, res, next) => {
    const id = parseInt(req.params.id as string)
    if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
    try {
      const data = await eliminarFactura(id)
      res.json({ data })
    } catch (error) {
      if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
      next(error)
    }
  }
)

export default router
