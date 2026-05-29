import { Router } from 'express'
import { autenticar } from '../middlewares/autenticar'
import { autorizar } from '../middlewares/autorizar'
import { crearPersonalSchema, editarPersonalSchema, importarHorariosSchema, actualizarTurnoPlaneadoSchema } from '../validaciones/rrhh.schema'
import {
  getPersonal,
  crearPersonal,
  editarPersonal,
  getTurnosRRHH,
  getNomina,
  importarHorarios,
  getHorarios,
  actualizarTurnoPlaneado,
  eliminarTurnoPlaneado,
  limpiarHorariosMes,
  publicarHorarios,
  getSeguimientoVendedores,
} from '../servicios/rrhh.servicio'

const router = Router()

// Todos los endpoints de RRHH son para ADMIN y SUPERVISOR
router.use(autenticar, autorizar('ADMIN', 'SUPERVISOR'))

// ─── Personal (VENDEDOR) ─────────────────────────────────────────────────────

/** GET /api/rrhh/personal — Lista vendedoras con PDV y último turno */
router.get('/personal', async (_req, res, next) => {
  try {
    const data = await getPersonal()
    res.json({ data })
  } catch (error) {
    next(error)
  }
})

/** POST /api/rrhh/personal — Crea vendedora con contraseña inicial "1234" */
router.post('/personal', async (req, res, next) => {
  const parsed = crearPersonalSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
    return
  }
  try {
    const data = await crearPersonal(parsed.data)
    res.status(201).json({ data })
  } catch (error) {
    if (error instanceof Error) {
      res.status(409).json({ error: error.message })
      return
    }
    next(error)
  }
})

/** PATCH /api/rrhh/personal/:id — Edita nombre, PDV, pago diario o estado */
router.patch('/personal/:id', async (req, res, next) => {
  const id = parseInt(req.params.id as string, 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }

  const parsed = editarPersonalSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
    return
  }
  try {
    const data = await editarPersonal(id, parsed.data)
    res.json({ data })
  } catch (error) {
    next(error)
  }
})

// ─── Turnos (historial real de TurnoCaja) ────────────────────────────────────

/** GET /api/rrhh/turnos?mes=YYYY-MM — Historial de turnos del mes */
router.get('/turnos', async (req, res, next) => {
  const mes = typeof req.query.mes === 'string' ? req.query.mes : ''
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    res.status(400).json({ error: 'Se requiere mes en formato YYYY-MM' })
    return
  }
  try {
    const data = await getTurnosRRHH(mes)
    res.json({ data })
  } catch (error) {
    next(error)
  }
})

// ─── Nómina ──────────────────────────────────────────────────────────────────

/** GET /api/rrhh/nomina?mes=YYYY-MM — Liquidaciones del mes */
router.get('/nomina', async (req, res, next) => {
  const mes = typeof req.query.mes === 'string' ? req.query.mes : ''
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    res.status(400).json({ error: 'Se requiere mes en formato YYYY-MM' })
    return
  }
  try {
    const data = await getNomina(mes)
    res.json({ data })
  } catch (error) {
    next(error)
  }
})

// ─── Horarios planeados ──────────────────────────────────────────────────────

/** GET /api/rrhh/horarios?mes=YYYY-MM — Grilla de horarios del mes */
router.get('/horarios', async (req, res, next) => {
  const mes = typeof req.query.mes === 'string' ? req.query.mes : ''
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    res.status(400).json({ error: 'Se requiere mes en formato YYYY-MM' }); return
  }
  try {
    const data = await getHorarios(mes)
    res.json({ data })
  } catch (error) { next(error) }
})

/** POST /api/rrhh/horarios/importar — Importar turnos desde Excel parseado */
router.post('/horarios/importar', async (req, res, next) => {
  const parsed = importarHorariosSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() }); return
  }
  try {
    const data = await importarHorarios(parsed.data)
    res.status(201).json({ data })
  } catch (error) { next(error) }
})

/** PATCH /api/rrhh/horarios/:id — Cambiar vendedora asignada */
router.patch('/horarios/:id', async (req, res, next) => {
  const id = parseInt(req.params.id as string, 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  const parsed = actualizarTurnoPlaneadoSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() }); return
  }
  try {
    const data = await actualizarTurnoPlaneado(id, parsed.data)
    res.json({ data })
  } catch (error) { next(error) }
})

/** DELETE /api/rrhh/horarios/mes/:mes — Limpiar todos los turnos planeados de un mes */
router.delete('/horarios/mes/:mes', async (req, res, next) => {
  const mes = req.params.mes as string
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    res.status(400).json({ error: 'Se requiere mes en formato YYYY-MM' }); return
  }
  try {
    const data = await limpiarHorariosMes(mes)
    res.json({ data })
  } catch (error) { next(error) }
})

/** DELETE /api/rrhh/horarios/:id — Eliminar turno planeado individual */
router.delete('/horarios/:id', async (req, res, next) => {
  const id = parseInt(req.params.id as string, 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  try {
    const data = await eliminarTurnoPlaneado(id)
    res.json({ data })
  } catch (error) { next(error) }
})

/** POST /api/rrhh/horarios/publicar — Publicar horario y notificar a vendedores */
router.post('/horarios/publicar', async (req, res, next) => {
  const mes = typeof req.body.mes === 'string' ? req.body.mes : ''
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    res.status(400).json({ error: 'Se requiere { mes: "YYYY-MM" }' }); return
  }
  try {
    const data = await publicarHorarios(mes)
    res.json({ data })
  } catch (error) {
    if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
    next(error)
  }
})

// ─── Seguimiento de vendedoras ────────────────────────────────────────────────

/** GET /api/rrhh/seguimiento?mes=YYYY-MM — Desempeño por vendedora */
router.get('/seguimiento', async (req, res, next) => {
  const mes = typeof req.query.mes === 'string' ? req.query.mes : ''
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    res.status(400).json({ error: 'Se requiere mes en formato YYYY-MM' }); return
  }
  try {
    const data = await getSeguimientoVendedores(mes)
    res.json({ data })
  } catch (error) { next(error) }
})

export default router
