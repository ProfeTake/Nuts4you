import { Router } from 'express'
import prisma from '../config/prisma'
import { autenticar } from '../middlewares/autenticar'
import { autorizar } from '../middlewares/autorizar'
import { abrirTurnoSchema, cerrarTurnoSchema, recepcionTurnoSchema, retiroSchema, gastoSchema } from '../validaciones/pos.schema'
import { abrirTurno, cerrarTurno, cerrarTurnoAdministrativo, reabrirTurno, confirmarRecepcionTurno, getTurnoActivo, getMisTurnos, registrarRetiro, getRetirosTurno, eliminarRetiro, registrarGasto, getGastosTurno, eliminarGasto } from '../servicios/pos.servicio'
import type { UsuarioTurno } from '../servicios/pos.servicio'

const router = Router()

// Todos los endpoints de POS requieren auth
router.use(autenticar)

/** Contexto del usuario autenticado para los servicios (scope de turno/PDV). */
function usuarioReq(req: { usuario?: { id: number; rol: string; pdvId: number | null } }): UsuarioTurno {
  return { id: req.usuario!.id, rol: req.usuario!.rol, pdvId: req.usuario!.pdvId }
}

// ─── PDVs disponibles (todos los roles autenticados) ─────────────────────────

router.get('/pdvs', async (_req, res, next) => {
  try {
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
    const turno = await getTurnoActivo(pdvId, usuarioReq(req))
    res.json({ data: turno })
  } catch (error) {
    next(error)
  }
})

// GET /api/pos/turnos/mios — historial de turnos cerrados del propio usuario
// (C15/A36: la vendedora audita sus diferencias de caja; scope implícito por token)
router.get('/turnos/mios', async (req, res, next) => {
  const limite = req.query.limite ? Number(req.query.limite) : undefined
  try {
    const data = await getMisTurnos(req.usuario!.id, limite)
    res.json({ data })
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
    next(error)
  }
})

// PATCH /api/pos/turnos/:id/cerrar-admin — admin/supervisor cierra un turno que
// quedó ABIERTO sin cuadre del vendedor (turnos huérfanos). Cierra en $0.
router.patch('/turnos/:id/cerrar-admin', autorizar('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  const id = Number(req.params.id)
  try {
    const data = await cerrarTurnoAdministrativo(id, { id: req.usuario!.id, nombre: req.usuario!.nombre })
    res.json({ data })
  } catch (error) {
    next(error)
  }
})

// PATCH /api/pos/turnos/:id/reabrir — deshace un cierre mal declarado para que el
// vendedor vuelva a cuadrar. Solo ADMIN: revierte stock, depósito y cuadre.
router.patch('/turnos/:id/reabrir', autorizar('ADMIN'), async (req, res, next) => {
  const id = Number(req.params.id)
  try {
    const data = await reabrirTurno(id, { id: req.usuario!.id, nombre: req.usuario!.nombre })
    res.json({ data })
  } catch (error) {
    next(error)
  }
})

// PATCH /api/pos/turnos/:id/recepcion — admin/supervisor confirma dinero recibido
// y da término al turno (2ª etapa del cierre).
router.patch('/turnos/:id/recepcion', autorizar('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  const id = Number(req.params.id)
  const parsed = recepcionTurnoSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
    return
  }
  try {
    const data = await confirmarRecepcionTurno(id, parsed.data, usuarioReq(req))
    res.json({ data })
  } catch (error) {
    next(error)
  }
})

// ─── Gastos de turno ──────────────────────────────────────────────────────────
// Scope: el servicio valida que el turno pertenezca al usuario o a su PDV.

router.post('/turnos/:id/gastos', autorizar('VENDEDOR', 'ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  const id = Number(req.params.id)
  const parsed = gastoSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() }); return }
  try {
    const data = await registrarGasto(id, parsed.data, usuarioReq(req))
    res.status(201).json({ data })
  } catch (error) {
    next(error)
  }
})

router.get('/turnos/:id/gastos', async (req, res, next) => {
  const id = Number(req.params.id)
  try { res.json({ data: await getGastosTurno(id, usuarioReq(req)) }) } catch (error) { next(error) }
})

router.delete('/turnos/:id/gastos/:gastoId', autorizar('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  const id      = Number(req.params.id)
  const gastoId = Number(req.params.gastoId)
  try {
    const data = await eliminarGasto(gastoId, id)
    res.json({ data })
  } catch (error) {
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
    const retiro = await registrarRetiro(id, parsed.data, usuarioReq(req))
    res.status(201).json({ data: retiro })
  } catch (error) {
    next(error)
  }
})

// GET /api/pos/turnos/:id/retiros — historial de retiros del turno.
// Sin autorizar() por rol: el servicio limita el acceso al dueño del turno (o a
// admin/supervisor), igual que los gastos. El vendedor necesita verlos para que
// su cuadre descuente el efectivo que el admin retiró del punto.
router.get('/turnos/:id/retiros', async (req, res, next) => {
  const id = Number(req.params.id)
  try {
    const retiros = await getRetirosTurno(id, usuarioReq(req))
    res.json({ data: retiros })
  } catch (error) {
    next(error)
  }
})

// DELETE /api/pos/turnos/:id/retiros/:retiroId — corregir un retiro mal cargado.
// Solo ADMIN y solo con el turno abierto (el servicio lo valida).
router.delete('/turnos/:id/retiros/:retiroId', autorizar('ADMIN'), async (req, res, next) => {
  const id       = Number(req.params.id)
  const retiroId = Number(req.params.retiroId)
  try {
    res.json({ data: await eliminarRetiro(retiroId, id) })
  } catch (error) {
    next(error)
  }
})

export default router
