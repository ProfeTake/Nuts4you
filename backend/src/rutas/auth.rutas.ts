import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { autenticar } from '../middlewares/autenticar'
import { loginSchema } from '../validaciones/auth.schema'
import { login, me } from '../servicios/auth.servicio'

const router = Router()

// Limita los intentos de login por IP para frenar ataques de fuerza bruta /
// diccionario contra los RUTs (semi-públicos en Chile).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,                  // 10 intentos por IP en la ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login. Intenta nuevamente en 15 minutos.' },
})

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() })
    return
  }
  try {
    const resultado = await login(parsed.data.rut, parsed.data.password)
    res.json({ data: resultado })
  } catch (error) {
    // El servicio lanza ErrorApp(401) para credenciales incorrectas;
    // manejarErrores responde con el estado y mensaje controlados.
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
