import { Router } from 'express'
import { autenticar } from '../middlewares/autenticar'
import { autorizar } from '../middlewares/autorizar'
import { despachoSchema, ajustarStockSchema, crearInventarioSchema } from '../validaciones/bodega.schema'
import { getStockBodega, registrarDespacho, getDespachos, ajustarStock, crearInventarioBodega, eliminarInventarioBodega, getProductosDisponibles } from '../servicios/bodega.servicio'

const router = Router()

/** GET /api/bodega/productos-disponibles — Productos sin inventario en bodega */
router.get('/productos-disponibles',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR', 'BODEGUERO'),
  async (_req, res, next) => {
    try {
      const data = await getProductosDisponibles()
      res.json({ data })
    } catch (error) {
      next(error)
    }
  }
)

/** GET /api/bodega/stock — Stock actual de la bodega central */
router.get('/stock',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR', 'BODEGUERO'),
  async (_req, res, next) => {
    try {
      const data = await getStockBodega()
      res.json({ data })
    } catch (error) {
      next(error)
    }
  }
)

/** GET /api/bodega/despachos?pdvId= — Historial de despachos */
router.get('/despachos',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR', 'BODEGUERO'),
  async (req, res, next) => {
    const pdvId = req.query.pdvId ? parseInt(req.query.pdvId as string) : undefined
    try {
      const data = await getDespachos(pdvId)
      res.json({ data })
    } catch (error) {
      next(error)
    }
  }
)

/** POST /api/bodega/stock — Agregar producto al inventario de bodega */
router.post('/stock',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const parsed = crearInventarioSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }
    try {
      const data = await crearInventarioBodega(parsed.data)
      res.status(201).json({ data })
    } catch (error) {
      if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
      next(error)
    }
  }
)

/** PATCH /api/bodega/stock/:inventarioId — Ajustar stock actual y crítico */
router.patch('/stock/:inventarioId',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR', 'BODEGUERO'),
  async (req, res, next) => {
    const id = parseInt(req.params.inventarioId as string)
    const parsed = ajustarStockSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }
    try {
      const data = await ajustarStock(id, parsed.data)
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

/** DELETE /api/bodega/stock/:inventarioId — Eliminar producto del inventario de bodega */
router.delete('/stock/:inventarioId',
  autenticar,
  autorizar('ADMIN'),
  async (req, res, next) => {
    const id = parseInt(req.params.inventarioId as string)
    if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
    try {
      const data = await eliminarInventarioBodega(id)
      res.json({ data })
    } catch (error) {
      if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
      next(error)
    }
  }
)

/** POST /api/bodega/despachos — Registrar envío de insumos a sucursal */
router.post('/despachos',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR', 'BODEGUERO'),
  async (req, res, next) => {
    const parsed = despachoSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }

    try {
      const usuarioId = req.usuario!.id
      const resultado = await registrarDespacho(parsed.data, usuarioId)
      res.status(201).json({ data: resultado })
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
