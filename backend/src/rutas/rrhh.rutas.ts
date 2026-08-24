import { Router } from 'express'
import { autenticar } from '../middlewares/autenticar'
import { autorizar } from '../middlewares/autorizar'
import {
  crearPersonalSchema, editarPersonalSchema, importarHorariosSchema, actualizarTurnoPlaneadoSchema,
  generarPagosSchema, pagoDirectoSchema, extraTurnoSchema,
} from '../validaciones/rrhh.schema'
import {
  getPersonal,
  crearPersonal,
  editarPersonal,
  getTurnosRRHH,
  getNomina,
  setExtraTurno,
  importarHorarios,
  getHorarios,
  actualizarTurnoPlaneado,
  eliminarTurnoPlaneado,
  limpiarHorariosMes,
  publicarHorarios,
  getSeguimientoVendedores,
} from '../servicios/rrhh.servicio'
import {
  getResumenPago,
  generarPagos,
  getPagos,
  anularPago,
  getVendedoresPendientesDePago,
  pagarTurnosDesdeCaja,
} from '../servicios/pagos.servicio'

const router = Router()

// Autenticación para todos los endpoints de RRHH.
router.use(autenticar)

// ── Excepción de solo-lectura para SUPERVISOR ──
// El supervisor puede VER la grilla de horarios (planificación de turnos por
// sucursal) pero no editarla. Se declara ANTES del guard ADMIN global para que
// use su propia autorización; todo lo demás de RRHH (remuneraciones, nómina,
// edición de horarios) sigue siendo solo ADMIN (D1/P1).
router.get('/horarios', autorizar('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  const mes = typeof req.query.mes === 'string' ? req.query.mes : ''
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    res.status(400).json({ error: 'Se requiere mes en formato YYYY-MM' }); return
  }
  try {
    const data = await getHorarios(mes)
    res.json({ data })
  } catch (error) { next(error) }
})

// El resto de los endpoints de RRHH son solo para ADMIN.
router.use(autorizar('ADMIN'))

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

/** POST /api/rrhh/personal — Crea vendedora; devuelve passwordInicial (una vez)
 * si el backend generó la contraseña aleatoria. */
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

// ─── Pagos por rango flexible (C3/A39, D6) ───────────────────────────────────
// El admin elige el rango (día/semana/mes) y genera pagos con los turnos
// CERRADOS + recepción confirmada + sin pago previo. Hereda el ADMIN-only global.

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

/** GET /api/rrhh/pagos/resumen?desde=&hasta= — Preview del pago del rango */
router.get('/pagos/resumen', async (req, res, next) => {
  const desde = String(req.query.desde ?? '')
  const hasta = String(req.query.hasta ?? '')
  if (!FECHA_RE.test(desde) || !FECHA_RE.test(hasta)) {
    res.status(400).json({ error: 'Se requieren desde y hasta en formato YYYY-MM-DD' })
    return
  }
  try {
    res.json({ data: await getResumenPago(desde, hasta) })
  } catch (error) { next(error) }
})

/**
 * POST /api/rrhh/pagos — Genera los pagos del rango {desde, hasta}.
 * `ajustes` lleva el "Adicional" y las "Cotizaciones" de cada vendedor
 * (planilla, celdas H163 y H164); ausente = 0 para todos.
 */
router.post('/pagos', async (req, res, next) => {
  const parsed = generarPagosSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }); return
  }
  const { desde, hasta, ajustes, usuarioIds } = parsed.data
  try {
    const porUsuario = ajustes && ajustes.length > 0
      ? new Map(ajustes.map((a) => [a.usuarioId, { adicional: a.adicional, cotizaciones: a.cotizaciones }]))
      : undefined
    const data = await generarPagos(
      desde, hasta, { id: req.usuario!.id, nombre: req.usuario!.nombre }, porUsuario, usuarioIds,
    )
    res.status(201).json({ data })
  } catch (error) { next(error) }
})

// ─── "Adicional"/Extra del turno (planilla, columna E) ───────────────────────

/** PATCH /api/rrhh/turnos/:id/extra — Carga el adicional de un turno cerrado e impago */
router.patch('/turnos/:id/extra', async (req, res, next) => {
  const id = parseInt(req.params.id as string, 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  const parsed = extraTurnoSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'El adicional debe ser 0, 0,5, 1 o 1,5' }); return
  }
  try {
    res.json({ data: await setExtraTurno(id, parsed.data.extraDecimas) })
  } catch (error) { next(error) }
})

// ── Pago directo desde la caja de una sucursal ("Pagar a vendedor") ──
// Se paga al vendedor con el efectivo del punto y el monto se descuenta del
// "a depositar" de ese turno, como la celda F29 de la planilla del cliente.

/** GET /api/rrhh/pagos/pendientes — Vendedores con sus turnos impagos y totales */
router.get('/pagos/pendientes', async (_req, res, next) => {
  try {
    res.json({ data: await getVendedoresPendientesDePago() })
  } catch (error) { next(error) }
})

/** POST /api/rrhh/pagos/directo — Paga N turnos de un vendedor con la caja del turno */
router.post('/pagos/directo', async (req, res, next) => {
  const parsed = pagoDirectoSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }); return
  }
  try {
    const data = await pagarTurnosDesdeCaja(parsed.data, { id: req.usuario!.id, nombre: req.usuario!.nombre })
    res.status(201).json({ data })
  } catch (error) { next(error) }
})

/** GET /api/rrhh/pagos — Historial de pagos generados */
router.get('/pagos', async (_req, res, next) => {
  try {
    res.json({ data: await getPagos() })
  } catch (error) { next(error) }
})

/** DELETE /api/rrhh/pagos/:id — Anula un pago (libera sus turnos) */
router.delete('/pagos/:id', async (req, res, next) => {
  const id = parseInt(req.params.id as string, 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  try {
    res.json({ data: await anularPago(id) })
  } catch (error) { next(error) }
})

// ─── Horarios planeados ──────────────────────────────────────────────────────
// (GET /horarios se define arriba, con acceso de lectura para SUPERVISOR.)

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
