import { Router } from 'express'
import { autenticar } from '../middlewares/autenticar'
import { getNotificaciones, marcarLeida, marcarTodasLeidas, contarNoLeidas } from '../servicios/notificaciones.servicio'

const router = Router()
router.use(autenticar)

router.get('/', async (req, res, next) => {
  try { res.json({ data: await getNotificaciones(req.usuario!.id) }) } catch (e) { next(e) }
})

router.get('/sin-leer', async (req, res, next) => {
  try { res.json({ data: { count: await contarNoLeidas(req.usuario!.id) } }) } catch (e) { next(e) }
})

router.patch('/:id/leer', async (req, res, next) => {
  const id = parseInt(req.params.id as string, 10)
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
  try { res.json({ data: await marcarLeida(id, req.usuario!.id) }) } catch (e) { next(e) }
})

router.patch('/leer-todas', async (req, res, next) => {
  try { res.json({ data: await marcarTodasLeidas(req.usuario!.id) }) } catch (e) { next(e) }
})

export default router
