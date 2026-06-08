import { Router } from 'express'
import { z } from 'zod'
import { autenticar } from '../middlewares/autenticar'
import { autorizar } from '../middlewares/autorizar'
import {
  getResumenDiario, getVentasSucursal, getPDVs,
  crearPDV, editarPDV, toggleEstadoPDV, eliminarPDV,
  getHistorialFaltantesVendedor, getHistorialTurnosSucursal,
} from '../servicios/admin.servicio'
import { guardarRegistroDiario, getRegistroDiario } from '../servicios/reporte.servicio'

const router = Router()

// ─── PDVs ─────────────────────────────────────────────────────────────────────

/** GET /api/admin/pdvs — Lista PDVs (activos para selector, todos para gestión) */
router.get('/pdvs',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    try {
      const todos = req.query.todos === 'true'
      const data  = await getPDVs(todos)
      res.json({ data })
    } catch (error) {
      next(error)
    }
  }
)

const pdvSchema = z.object({
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(60),
  tipo:   z.enum(['PUNTO_VENTA', 'BODEGA']),
})

/** POST /api/admin/pdvs — Crear nuevo PDV (solo ADMIN) */
router.post('/pdvs',
  autenticar,
  autorizar('ADMIN'),
  async (req, res, next) => {
    const parsed = pdvSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
      return
    }
    try {
      const data = await crearPDV(parsed.data.nombre, parsed.data.tipo)
      res.status(201).json({ data })
    } catch (error) {
      if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
      next(error)
    }
  }
)

/** PATCH /api/admin/pdvs/:id — Editar nombre de un PDV (solo ADMIN) */
router.patch('/pdvs/:id',
  autenticar,
  autorizar('ADMIN'),
  async (req, res, next) => {
    const id = parseInt(req.params.id as string, 10)
    const parsed = z.object({ nombre: z.string().min(2).max(60) }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Nombre inválido' })
      return
    }
    try {
      const data = await editarPDV(id, parsed.data.nombre)
      res.json({ data })
    } catch (error) {
      if (error instanceof Error) { res.status(404).json({ error: error.message }); return }
      next(error)
    }
  }
)

/** PATCH /api/admin/pdvs/:id/estado — Activar / desactivar PDV (solo ADMIN) */
router.patch('/pdvs/:id/estado',
  autenticar,
  autorizar('ADMIN'),
  async (req, res, next) => {
    const id = parseInt(req.params.id as string, 10)
    const parsed = z.object({ activo: z.boolean() }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Se requiere el campo activo (boolean)' })
      return
    }
    try {
      const data = await toggleEstadoPDV(id, parsed.data.activo)
      res.json({ data })
    } catch (error) {
      if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
      next(error)
    }
  }
)

/** DELETE /api/admin/pdvs/:id — Eliminar PDV sin historial (solo ADMIN) */
router.delete('/pdvs/:id',
  autenticar,
  autorizar('ADMIN'),
  async (req, res, next) => {
    const id = parseInt(req.params.id as string, 10)
    try {
      await eliminarPDV(id)
      res.json({ data: { mensaje: 'Punto de venta eliminado' } })
    } catch (error) {
      if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
      next(error)
    }
  }
)

// ─── Dashboard ────────────────────────────────────────────────────────────────

/** GET /api/admin/resumen-diario?fecha=2026-05-01 */
router.get('/resumen-diario',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    let fecha = typeof req.query.fecha === 'string' ? req.query.fecha : ''
    if (!fecha) {
      const ahora   = new Date()
      const chileMs = ahora.getTime() - 4 * 3_600_000
      fecha = new Date(chileMs).toISOString().split('T')[0]
    }
    try {
      const data = await getResumenDiario(fecha)
      res.json({ data })
    } catch (error) {
      next(error)
    }
  }
)

/** GET /api/admin/ventas-sucursal?pdvId=2&fecha=2026-05-01 */
router.get('/ventas-sucursal',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const pdvId = parseInt(req.query.pdvId as string)
    const fecha = typeof req.query.fecha === 'string' ? req.query.fecha : ''
    if (isNaN(pdvId) || !fecha) {
      res.status(400).json({ error: 'Se requieren pdvId y fecha' })
      return
    }
    try {
      const data = await getVentasSucursal(pdvId, fecha)
      if (!data) { res.status(404).json({ error: 'No hay turno para ese PDV en esa fecha' }); return }
      res.json({ data })
    } catch (error) {
      next(error)
    }
  }
)

/** GET /api/admin/historial-turnos?pdvId=X&desde=Y&hasta=Z&usuarioId=W */
router.get('/historial-turnos',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const pdvId     = parseInt(req.query.pdvId as string)
    const desde     = typeof req.query.desde === 'string' ? req.query.desde : ''
    const hasta     = typeof req.query.hasta === 'string' ? req.query.hasta : ''
    const usuarioId = req.query.usuarioId ? parseInt(req.query.usuarioId as string) : undefined
    if (isNaN(pdvId) || !desde || !hasta) {
      res.status(400).json({ error: 'Se requieren pdvId, desde y hasta' }); return
    }
    try {
      const data = await getHistorialTurnosSucursal(pdvId, desde, hasta, usuarioId)
      res.json({ data })
    } catch (error) { next(error) }
  }
)

/** GET /api/admin/vendedores/:id/faltantes */
router.get('/vendedores/:id/faltantes',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    const id = parseInt(req.params.id as string)
    if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
    try {
      const data = await getHistorialFaltantesVendedor(id)
      res.json({ data })
    } catch (error) { next(error) }
  }
)

/** POST /api/admin/registro-diario */
router.post('/registro-diario',
  autenticar,
  autorizar('ADMIN', 'SUPERVISOR', 'VENDEDOR'),
  async (req, res, next) => {
    const { pdvId, fecha, datos } = req.body as { pdvId: number; fecha: string; datos: unknown }
    if (!pdvId || !fecha) { res.status(400).json({ error: 'Se requieren pdvId y fecha' }); return }
    try {
      const result = await guardarRegistroDiario(pdvId, fecha, datos)
      res.json({ data: result })
    } catch (error) {
      next(error)
    }
  }
)

/** GET /api/admin/registro-diario?pdvId=X&fecha=Y */
router.get('/registro-diario',
  autenticar,
  async (req, res, next) => {
    const pdvId = parseInt(req.query.pdvId as string)
    const fecha = typeof req.query.fecha === 'string' ? req.query.fecha : ''
    if (isNaN(pdvId) || !fecha) { res.status(400).json({ error: 'Se requieren pdvId y fecha' }); return }
    try {
      const data = await getRegistroDiario(pdvId, fecha)
      if (!data) { res.status(404).json({ error: 'No hay registro' }); return }
      res.json({ data })
    } catch (error) {
      next(error)
    }
  }
)

export default router
