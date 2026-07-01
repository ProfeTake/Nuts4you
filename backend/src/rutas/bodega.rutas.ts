import { Router } from 'express'
import { autenticar } from '../middlewares/autenticar'
import { autorizar } from '../middlewares/autorizar'
import { despachoSchema, ajustarStockSchema, crearInventarioSchema, crearProductoSchema, guardarLoteSchema } from '../validaciones/bodega.schema'
import { getStockBodega, registrarDespacho, getDespachos, ajustarStock, crearInventarioBodega, eliminarInventarioBodega, getProductosDisponibles, getCategorias, crearProducto, buscarPorCodigoBarra, guardarLoteInventario, getHistorialInventario } from '../servicios/bodega.servicio'

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

/** POST /api/bodega/stock/lote — Guardar por lote ingresos/utilizadas de la tabla editable */
router.post('/stock/lote',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR', 'BODEGUERO'),
  async (req, res, next) => {
    const parsed = guardarLoteSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }
    try {
      const data = await guardarLoteInventario(parsed.data, { id: req.usuario!.id, nombre: req.usuario!.nombre })
      res.json({ data })
    } catch (error) {
      if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
      next(error)
    }
  }
)

/** GET /api/bodega/historial?desde=&hasta= — Historial de ingresos/ajustes de bodega */
router.get('/historial',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR', 'BODEGUERO'),
  async (req, res, next) => {
    const desde = typeof req.query.desde === 'string' ? req.query.desde : undefined
    const hasta = typeof req.query.hasta === 'string' ? req.query.hasta : undefined
    try {
      const data = await getHistorialInventario(desde, hasta)
      res.json({ data })
    } catch (error) { next(error) }
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

/** GET /api/bodega/categorias — Lista todas las categorías */
router.get('/categorias',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR', 'BODEGUERO'),
  async (_req, res, next) => {
    try {
      const data = await getCategorias()
      res.json({ data })
    } catch (error) { next(error) }
  }
)

/** GET /api/bodega/buscar-codigo?codigo= — Buscar producto por código de barras */
router.get('/buscar-codigo',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR', 'BODEGUERO'),
  async (req, res, next) => {
    const codigo = String(req.query.codigo ?? '').trim()
    if (!codigo) { res.status(400).json({ error: 'Falta parámetro codigo' }); return }
    try {
      const producto = await buscarPorCodigoBarra(codigo)
      if (!producto) { res.status(404).json({ error: 'Producto no encontrado' }); return }
      res.json({ data: { id: producto.id, nombre: producto.nombre, categoria: producto.categoria.nombre, codigoBarra: producto.codigo_barra } })
    } catch (error) { next(error) }
  }
)

/** POST /api/bodega/productos — Crear producto nuevo y agregarlo al inventario de bodega */
router.post('/productos',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const parsed = crearProductoSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }
    try {
      const data = await crearProducto(parsed.data)
      res.status(201).json({ data })
    } catch (error) {
      if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
      next(error)
    }
  }
)

export default router
