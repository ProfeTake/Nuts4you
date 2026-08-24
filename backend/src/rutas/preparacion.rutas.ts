import { Router } from 'express'
import { autenticar } from '../middlewares/autenticar'
import { autorizar } from '../middlewares/autorizar'
import { guardarPreparacionSchema } from '../validaciones/preparacion.schema'
import {
  getPreparaciones,
  getPreparacionPorPdvFecha,
  guardarPreparacion,
  anularPreparacion,
} from '../servicios/preparacion.servicio'

const router = Router()

// Todos los endpoints requieren autenticación.
router.use(autenticar)

const fechaValida = (f: unknown): f is string => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f)

// GET /api/preparaciones?fecha=YYYY-MM-DD — lista (admin/supervisor)
router.get('/', autorizar('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  const fecha = req.query.fecha
  if (fecha !== undefined && !fechaValida(fecha)) {
    res.status(400).json({ error: 'fecha inválida (use YYYY-MM-DD)' })
    return
  }
  try {
    res.json({ data: await getPreparaciones(fecha as string | undefined) })
  } catch (error) { next(error) }
})

// GET /api/preparaciones/pdv/:pdvId?fecha=YYYY-MM-DD — preparación de un PDV/fecha
// La usa la vendedora al abrir turno; scope: un VENDEDOR solo su propio PDV.
router.get('/pdv/:pdvId', async (req, res, next) => {
  const pdvId = Number(req.params.pdvId)
  const fecha = req.query.fecha
  if (!pdvId) { res.status(400).json({ error: 'pdvId inválido' }); return }
  if (!fechaValida(fecha)) { res.status(400).json({ error: 'fecha requerida (YYYY-MM-DD)' }); return }
  if (req.usuario!.rol === 'VENDEDOR' && req.usuario!.pdvId !== pdvId) {
    res.status(403).json({ error: 'Acceso denegado' })
    return
  }
  try {
    res.json({ data: await getPreparacionPorPdvFecha(pdvId, fecha) })
  } catch (error) { next(error) }
})

// POST /api/preparaciones — crear/actualizar (admin/supervisor)
router.post('/', autorizar('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  const parsed = guardarPreparacionSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
    return
  }
  try {
    const data = await guardarPreparacion(parsed.data, {
      id: req.usuario!.id, nombre: req.usuario!.nombre,
    })
    res.status(201).json({ data })
  } catch (error) { next(error) }
})

// PATCH /api/preparaciones/:id/anular — anular y devolver stock a bodega
router.patch('/:id/anular', autorizar('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  const id = Number(req.params.id)
  if (!id) { res.status(400).json({ error: 'id inválido' }); return }
  try {
    res.json({ data: await anularPreparacion(id) })
  } catch (error) { next(error) }
})

export default router
