import { Router } from 'express'
import { autenticar } from '../middlewares/autenticar'
import { autorizar } from '../middlewares/autorizar'
import {
  crearUsuarioSchema,
  editarUsuarioSchema,
  estadoUsuarioSchema,
} from '../validaciones/usuarios.schema'
import {
  getUsuarios,
  crearUsuario,
  editarUsuario,
  cambiarEstadoUsuario,
  eliminarUsuario,
} from '../servicios/usuarios.servicio'

const router = Router()

// Todos los endpoints de usuarios son solo para ADMIN
router.use(autenticar, autorizar('ADMIN'))

/** GET /api/usuarios — Lista todos los usuarios con rol y PDV */
router.get('/', async (_req, res, next) => {
  try {
    const data = await getUsuarios()
    res.json({ data })
  } catch (error) {
    next(error)
  }
})

/** POST /api/usuarios — Crear usuario */
router.post('/', async (req, res, next) => {
  const parsed = crearUsuarioSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
    return
  }
  try {
    const data = await crearUsuario(parsed.data)
    res.status(201).json({ data })
  } catch (error) {
    if (error instanceof Error) {
      res.status(409).json({ error: error.message })
      return
    }
    next(error)
  }
})

/** PATCH /api/usuarios/:id — Editar nombre, contraseña, PDV o pago_diario */
router.patch('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id as string, 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }

  const parsed = editarUsuarioSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
    return
  }
  try {
    const data = await editarUsuario(id, parsed.data)
    res.json({ data })
  } catch (error) {
    next(error)
  }
})

/** PATCH /api/usuarios/:id/estado — Activar o desactivar usuario */
router.patch('/:id/estado', async (req, res, next) => {
  const id = parseInt(req.params.id as string, 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }

  const parsed = estadoUsuarioSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
    return
  }
  try {
    const data = await cambiarEstadoUsuario(id, parsed.data)
    res.json({ data })
  } catch (error) {
    next(error)
  }
})

/** DELETE /api/usuarios/:id — Eliminar usuario permanentemente */
router.delete('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id as string, 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  try {
    const data = await eliminarUsuario(id, req.usuario!.id)
    res.json({ data })
  } catch (error) {
    if (error instanceof Error) { res.status(400).json({ error: error.message }); return }
    next(error)
  }
})

export default router
