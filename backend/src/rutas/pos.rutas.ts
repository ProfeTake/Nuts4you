import { Router } from 'express'
import { autenticar } from '../middlewares/autenticar'
import { autorizar } from '../middlewares/autorizar'
import { abrirTurnoSchema, cerrarTurnoSchema, retiroSchema, gastoSchema } from '../validaciones/pos.schema'
import { abrirTurno, cerrarTurno, getTurnoActivo, registrarRetiro, getRetirosTurno, registrarGasto, getGastosTurno, eliminarGasto } from '../servicios/pos.servicio'

const router = Router()

// Todos los endpoints de POS requieren auth
router.use(autenticar)

// ─── PDVs disponibles (todos los roles autenticados) ─────────────────────────

router.get('/pdvs', async (_req, res, next) => {
  try {
    const prisma = (await import('../config/prisma')).default
    const pdvs = await prisma.pDV.findMany({
      where:   { tipo: 'PUNTO_VENTA', activo: true },
      select:  { id: true, nombre: true, tipo: true, activo: true },
      orderBy: { nombre: 'asc' },
    })
    res.json({ data: pdvs })
  } catch (error) { next(error) }
})

// ─── Turnos ───────────────────────────────────────────────────────────────────

// POST /api/pos/turnos — abrir turno
router.post('/turnos', autorizar('VENDEDOR', 'ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  const parsed = abrirTurnoSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
    return
  }
  try {
    const turno = await abrirTurno(parsed.data, req.usuario!.id)
    res.status(201).json({ data: turno })
  } catch (error) {
    if (error instanceof Error) {
      res.status(409).json({ error: error.message })
      return
    }
    next(error)
  }
})

// GET /api/pos/turnos/activo?pdvId=1
router.get('/turnos/activo', async (req, res, next) => {
  const pdvId = Number(req.query.pdvId)
  if (!pdvId) {
    res.status(400).json({ error: 'pdvId es requerido' })
    return
  }
  try {
    const turno = await getTurnoActivo(pdvId)
    res.json({ data: turno })
  } catch (error) {
    next(error)
  }
})

// PATCH /api/pos/turnos/:id/cerrar — cerrar turno
router.patch('/turnos/:id/cerrar', autorizar('VENDEDOR', 'ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  const id = Number(req.params.id)
  const parsed = cerrarTurnoSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
    return
  }
  try {
    await cerrarTurno(id, parsed.data, req.usuario!.id, req.usuario!.rol)
    res.json({ data: { mensaje: 'Turno cerrado correctamente' } })
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ error: error.message })
      return
    }
    next(error)
  }
})

// ─── Gastos de turno (accesible a todos los roles) ──────────────────────────

router.post('/turnos/:id/gastos', autorizar('VENDEDOR', 'ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  const id = Number(req.params.id)
  const parsed = gastoSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() }); return }
  try {
    const data = await registrarGasto(id, parsed.data)
    res.status(201).json({ data })
  } catch (error) {
    if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
    next(error)
  }
})

router.get('/turnos/:id/gastos', async (req, res, next) => {
  const id = Number(req.params.id)
  try { res.json({ data: await getGastosTurno(id) }) } catch (error) { next(error) }
})

router.delete('/turnos/:id/gastos/:gastoId', autorizar('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  const id      = Number(req.params.id)
  const gastoId = Number(req.params.gastoId)
  try {
    const data = await eliminarGasto(gastoId, id)
    res.json({ data })
  } catch (error) {
    if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
    next(error)
  }
})

// ─── Retiros ─────────────────────────────────────────────────────────────────

// POST /api/pos/turnos/:id/retiros — registrar retiro de dinero del punto
router.post('/turnos/:id/retiros', autorizar('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  const id = Number(req.params.id)
  const parsed = retiroSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
    return
  }
  try {
    const retiro = await registrarRetiro(id, parsed.data, req.usuario!.id)
    res.status(201).json({ data: retiro })
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ error: error.message })
      return
    }
    next(error)
  }
})

// GET /api/pos/turnos/:id/retiros — historial de retiros del turno
router.get('/turnos/:id/retiros', autorizar('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  const id = Number(req.params.id)
  try {
    const retiros = await getRetirosTurno(id)
    res.json({ data: retiros })
  } catch (error) {
    next(error)
  }
})

export default router
