import { Router } from 'express'
import { autenticar } from '../middlewares/autenticar'
import { loginSchema } from '../validaciones/auth.schema'
import { login, me } from '../servicios/auth.servicio'

const router = Router()

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
    return
  }
  try {
    const resultado = await login(parsed.data.rut, parsed.data.password)
    res.json({ data: resultado })
  } catch (error) {
    if (error instanceof Error && error.message === 'RUT o contraseña incorrectos') {
      res.status(401).json({ error: error.message })
      return
    }
    next(error)
  }
})

// GET /api/auth/me — requiere JWT válido
router.get('/me', autenticar, async (req, res, next) => {
  try {
    const resultado = await me(req.usuario!.id)
    res.json({ data: resultado })
  } catch (error) {
    next(error)
  }
})

export default router
