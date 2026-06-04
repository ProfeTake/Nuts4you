import bcrypt from 'bcryptjs'
import prisma from '../config/prisma'
import { calcularBono } from './calculos.servicio'
import { enviarCorreoHorario } from './correo.servicio'
import type {
  CrearPersonalInput,
  EditarPersonalInput,
  ImportarHorariosInput,
  ActualizarTurnoPlaneadoInput,
} from '../validaciones/rrhh.schema'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatearPersonal(u: {
  id: number
  rut: string
  nombre: string
  email: string | null
  activo: boolean
  pago_diario: number
  pdv: { id: number; nombre: string } | null
  turnos: { id: number; fecha_apertura: Date }[]
}) {
  return {
    id:          u.id,
    nombre:      u.nombre,
    rut:         u.rut,
    email:       u.email,
    pdvId:       u.pdv?.id ?? null,
    pdvNombre:   u.pdv?.nombre ?? null,
    pagoDiario:  u.pago_diario,
    activo:      u.activo,
    ultimoTurno: u.turnos[0]?.fecha_apertura.toISOString() ?? null,
  }
}

// ─── Personal (VENDEDOR) ─────────────────────────────────────────────────────

export async function getPersonal() {
  const rol = await prisma.rol.findUnique({ where: { nombre: 'VENDEDOR' } })
  if (!rol) return []

  const usuarios = await prisma.usuario.findMany({
    where: { rol_id: rol.id },
    include: {
      pdv:    { select: { id: true, nombre: true } },
      turnos: {
        orderBy: { fecha_apertura: 'desc' },
        take: 1,
        select: { id: true, fecha_apertura: true },
      },
    },
    orderBy: { nombre: 'asc' },
  })

  return usuarios.map(formatearPersonal)
}

const limpiarRut = (rut: string) => rut.replace(/\./g, '').trim()

export async function crearPersonal(data: CrearPersonalInput) {
  const rut = limpiarRut(data.rut)
  const existente = await prisma.usuario.findUnique({ where: { rut } })
  if (existente) throw new Error(`Ya existe un usuario con el RUT ${rut}`)

  const rol = await prisma.rol.findUnique({ where: { nombre: 'VENDEDOR' } })
  if (!rol) throw new Error('Rol VENDEDOR no encontrado')

  const hash = await bcrypt.hash('1234', 10)

  const usuario = await prisma.usuario.create({
    data: {
      rut,
      nombre:        data.nombre,
      email:         data.email ?? null,
      password_hash: hash,
      rol_id:        rol.id,
      pdv_id:        data.pdvId ?? null,
      pago_diario:   data.pagoDiario,
    },
    include: {
      pdv:    { select: { id: true, nombre: true } },
      turnos: { orderBy: { fecha_apertura: 'desc' }, take: 1, select: { id: true, fecha_apertura: true } },
    },
  })

  return formatearPersonal(usuario)
}

export async function editarPersonal(id: number, data: EditarPersonalInput) {
  const updateData: Record<string, unknown> = {}
  if (data.nombre !== undefined)     updateData.nombre      = data.nombre
  if (data.pdvId !== undefined)      updateData.pdv_id      = data.pdvId
  if (data.pagoDiario !== undefined) updateData.pago_diario = data.pagoDiario
  if (data.activo !== undefined)     updateData.activo      = data.activo
  if (data.email !== undefined)      updateData.email       = data.email ?? null

  const usuario = await prisma.usuario.update({
    where: { id },
    data:  updateData,
    include: {
      pdv:    { select: { id: true, nombre: true } },
      turnos: { orderBy: { fecha_apertura: 'desc' }, take: 1, select: { id: true, fecha_apertura: true } },
    },
  })

  return formatearPersonal(usuario)
}

// ─── Turnos RRHH (historial real de TurnoCaja) ──────────────────────────────

export async function getTurnosRRHH(mes: string) {
  const inicio = new Date(`${mes}-01T00:00:00-04:00`)
  const fin    = new Date(inicio)
  fin.setMonth(fin.getMonth() + 1)

  const turnos = await prisma.turnoCaja.findMany({
    where: {
      fecha_apertura: { gte: inicio, lt: fin },
    },
    include: {
      usuario: { select: { id: true, nombre: true } },
      pdv:     { select: { id: true, nombre: true } },
    },
    orderBy: { fecha_apertura: 'desc' },
  })

  return turnos.map((t) => ({
    id:            t.id,
    fecha:         t.fecha_apertura.toISOString().slice(0, 10),
    usuarioId:     t.usuario?.id ?? 0,
    usuarioNombre: t.usuario?.nombre ?? 'Usuario eliminado',
    pdvId:         t.pdv.id,
    pdvNombre:     t.pdv.nombre,
    estado:        t.estado,
    horaApertura:  t.fecha_apertura.toISOString(),
    horaCierre:    t.fecha_cierre?.toISOString() ?? null,
  }))
}

// ─── Horarios planeados ──────────────────────────────────────────────────────

export async function importarHorarios(data: ImportarHorariosInput) {
  let procesados = 0
  for (const item of data.items) {
    const fecha = new Date(item.fecha)
    await prisma.turnoPlaneado.upsert({
      where: { fecha_pdv_id: { fecha, pdv_id: item.pdvId } },
      update: { usuario_id: item.usuarioId, publicado: false },
      create: { fecha, pdv_id: item.pdvId, usuario_id: item.usuarioId, publicado: false },
    })
    procesados++
  }
  return { procesados }
}

export async function getHorarios(mes: string) {
  const inicio = new Date(`${mes}-01`)
  const fin    = new Date(inicio)
  fin.setMonth(fin.getMonth() + 1)

  const [planeados, reales, pdvs] = await Promise.all([
    prisma.turnoPlaneado.findMany({
      where:   { fecha: { gte: inicio, lt: fin } },
      include: {
        pdv:     { select: { id: true, nombre: true } },
        usuario: { select: { id: true, nombre: true } },
      },
    }),
    prisma.turnoCaja.findMany({
      where: { fecha_apertura: { gte: inicio, lt: fin } },
      include: {
        usuario: { select: { id: true, nombre: true } },
        pdv:     { select: { id: true, nombre: true } },
      },
    }),
    prisma.pDV.findMany({
      where:   { tipo: 'PUNTO_VENTA', activo: true },
      select:  { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
  ])

  // grid: fecha → pdvId → { planeado, real }
  const grid: Record<string, Record<number, {
    id: number | null
    vendedorPlaneado: { id: number; nombre: string } | null
    vendedorReal:     { id: number; nombre: string } | null
    total:            number | null
    estado:           string | null
    publicado:        boolean
  }>> = {}

  for (const t of planeados) {
    const fecha = t.fecha.toISOString().slice(0, 10)
    if (!grid[fecha]) grid[fecha] = {}
    grid[fecha][t.pdv_id] = {
      id:               t.id,
      vendedorPlaneado: { id: t.usuario.id, nombre: t.usuario.nombre },
      vendedorReal:     null,
      total:            null,
      estado:           null,
      publicado:        t.publicado,
    }
  }

  for (const t of reales) {
    const fecha = t.fecha_apertura.toISOString().slice(0, 10)
    if (!grid[fecha]) grid[fecha] = {}
    if (!grid[fecha][t.pdv_id]) {
      grid[fecha][t.pdv_id] = { id: null, vendedorPlaneado: null, vendedorReal: null, total: null, estado: null, publicado: false }
    }
    grid[fecha][t.pdv_id].vendedorReal = { id: t.usuario?.id ?? 0, nombre: t.usuario?.nombre ?? 'Usuario eliminado' }
    grid[fecha][t.pdv_id].total        = t.total_calculado
    grid[fecha][t.pdv_id].estado       = t.estado
  }

  return { pdvs, grid }
}

export async function actualizarTurnoPlaneado(id: number, data: ActualizarTurnoPlaneadoInput) {
  const turno = await prisma.turnoPlaneado.update({
    where:   { id },
    data:    { usuario_id: data.usuarioId },
    include: { usuario: { select: { id: true, nombre: true } }, pdv: { select: { nombre: true } } },
  })
  return { id: turno.id, vendedor: turno.usuario.nombre, pdv: turno.pdv.nombre }
}

export async function eliminarTurnoPlaneado(id: number) {
  await prisma.turnoPlaneado.delete({ where: { id } })
  return { eliminado: id }
}

// ─── Publicar horarios (notificaciones + correo) ─────────────────────────────

const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function mesLabel(mes: string) {
  const [anio, num] = mes.split('-')
  return `${MESES_ES[Number(num) - 1]} ${anio}`
}

function formatearDia(fecha: Date): string {
  return fecha.toLocaleDateString('es-CL', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Santiago',
  })
}

function generarMensajeHorario(
  turnos: { fecha: Date; pdvNombre: string }[],
  mes:    string,
): { texto: string; html: string } {
  // Agrupar bloques consecutivos en el mismo PDV
  const bloques: { pdv: string; dias: string[] }[] = []
  for (const t of turnos) {
    const diaStr = formatearDia(t.fecha)
    const ultimo = bloques[bloques.length - 1]
    if (ultimo && ultimo.pdv === t.pdvNombre) {
      ultimo.dias.push(diaStr)
    } else {
      bloques.push({ pdv: t.pdvNombre, dias: [diaStr] })
    }
  }

  const etiqueta = mesLabel(mes)
  const lineas   = bloques.map(b => `• ${b.pdv}: ${b.dias.join(', ')}`)
  const total    = turnos.length

  const texto = `Tus turnos para ${etiqueta}:\n\n${lineas.join('\n')}\n\nTotal: ${total} día${total !== 1 ? 's' : ''} asignado${total !== 1 ? 's' : ''}.`

  const htmlLineas = bloques.map(b =>
    `<li><strong>${b.pdv}</strong>: ${b.dias.join(', ')}</li>`
  ).join('\n')

  const html = `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <h2 style="color:#111">📅 Tu horario de ${etiqueta}</h2>
      <p>Hola, te compartimos tu planificación de turnos para <strong>${etiqueta}</strong>:</p>
      <ul style="line-height:2">${htmlLineas}</ul>
      <p style="margin-top:16px;color:#555">Total: <strong>${total} día${total !== 1 ? 's' : ''}</strong> asignado${total !== 1 ? 's' : ''}.</p>
      <hr style="margin:24px 0;border:none;border-top:1px solid #eee">
      <p style="font-size:12px;color:#999">Nuts 4 You — Sistema ERP/POS</p>
    </div>`

  return { texto, html }
}

export async function publicarHorarios(mes: string) {
  const inicio = new Date(`${mes}-01`)
  const fin    = new Date(inicio)
  fin.setMonth(fin.getMonth() + 1)

  const turnos = await prisma.turnoPlaneado.findMany({
    where:   { fecha: { gte: inicio, lt: fin } },
    include: {
      pdv:     { select: { nombre: true } },
      usuario: { select: { id: true, nombre: true, email: true } },
    },
    orderBy: [{ usuario_id: 'asc' }, { fecha: 'asc' }],
  })

  if (turnos.length === 0) throw new Error('No hay turnos planeados para este mes')

  // Agrupar por vendedor
  const porVendedor = new Map<number, { nombre: string; email: string | null; turnos: { fecha: Date; pdvNombre: string }[] }>()
  for (const t of turnos) {
    const uid = t.usuario_id
    if (!porVendedor.has(uid)) porVendedor.set(uid, { nombre: t.usuario.nombre, email: t.usuario.email, turnos: [] })
    porVendedor.get(uid)!.turnos.push({ fecha: t.fecha, pdvNombre: t.pdv.nombre })
  }

  const titulo   = `Tu horario de ${mesLabel(mes)} está listo`
  const notifIds: number[] = []
  const vendedores: string[] = []

  for (const [uid, info] of porVendedor) {
    const { texto, html } = generarMensajeHorario(info.turnos, mes)

    const notif = await prisma.notificacion.create({
      data: { usuario_id: uid, titulo, mensaje: texto },
    })
    notifIds.push(notif.id)
    vendedores.push(info.nombre)

    // Correo opcional — falla silenciosamente si SMTP no está configurado o sin email
    await enviarCorreoHorario({ nombre: info.nombre, correo: info.email }, mes, html).catch(() => {})
  }

  // Marcar todos los turnos del mes como publicados
  await prisma.turnoPlaneado.updateMany({
    where: { fecha: { gte: inicio, lt: fin } },
    data:  { publicado: true },
  })

  return {
    publicados: notifIds.length,
    vendedores,
  }
}

export async function limpiarHorariosMes(mes: string) {
  const inicio = new Date(`${mes}-01`)
  const fin    = new Date(inicio)
  fin.setMonth(fin.getMonth() + 1)
  const { count } = await prisma.turnoPlaneado.deleteMany({
    where: { fecha: { gte: inicio, lt: fin } },
  })
  return { eliminados: count }
}

// ─── Seguimiento de vendedoras ────────────────────────────────────────────────

export async function getSeguimientoVendedores(mes: string) {
  const inicio = new Date(`${mes}-01T00:00:00-04:00`)
  const fin    = new Date(inicio)
  fin.setMonth(fin.getMonth() + 1)

  const rolVendedor = await prisma.rol.findUnique({ where: { nombre: 'VENDEDOR' } })
  if (!rolVendedor) return []

  const vendedores = await prisma.usuario.findMany({
    where:   { rol_id: rolVendedor.id },
    orderBy: { nombre: 'asc' },
  })

  const turnos = await prisma.turnoCaja.findMany({
    where: {
      fecha_apertura: { gte: inicio, lt: fin },
      usuario: { rol_id: rolVendedor.id },
    },
    include: {
      pdv:     { select: { id: true, nombre: true } },
      usuario: { select: { id: true } },
    },
    orderBy: { fecha_apertura: 'desc' },
  })

  return vendedores.map((v) => {
    const tv = turnos.filter((t) => t.usuario?.id === v.id)

    const porPDV = new Map<number, { pdvId: number; pdvNombre: string; dias: number; ventas: number }>()
    for (const t of tv) {
      if (!porPDV.has(t.pdv.id)) {
        porPDV.set(t.pdv.id, { pdvId: t.pdv.id, pdvNombre: t.pdv.nombre, dias: 0, ventas: 0 })
      }
      const e = porPDV.get(t.pdv.id)!
      e.dias++
      e.ventas += t.total_calculado ?? 0
    }

    const totalVentas       = tv.reduce((s, t) => s + (t.total_calculado ?? 0), 0)
    const faltantes         = tv.filter((t) => (t.diferencia_caja ?? 0) < 0).reduce((s, t) => s + Math.abs(t.diferencia_caja!), 0)
    const sobrantes         = tv.filter((t) => (t.diferencia_caja ?? 0) > 0).reduce((s, t) => s + t.diferencia_caja!, 0)
    const turnosConFaltante = tv.filter((t) => (t.diferencia_caja ?? 0) < 0).length

    return {
      id:              v.id,
      nombre:          v.nombre,
      rut:             v.rut,
      pagoDiario:      v.pago_diario,
      activo:          v.activo,
      totalTurnos:     tv.length,
      turnosCerrados:  tv.filter((t) => t.estado === 'CERRADO').length,
      totalVentas,
      promedioDiario:  tv.length > 0 ? Math.round(totalVentas / tv.length) : 0,
      faltantes,
      sobrantes,
      turnosConFaltante,
      porPDV: Array.from(porPDV.values()).sort((a, b) => b.dias - a.dias),
      historial: tv.slice(0, 12).map((t) => ({
        id:          t.id,
        fecha:       t.fecha_apertura.toISOString().slice(0, 10),
        pdvNombre:   t.pdv.nombre,
        total:       t.total_calculado,
        diferencia:  t.diferencia_caja,
        estado:      t.estado,
      })),
    }
  })
}

// ─── Nómina mensual con bonos escalonados por sucursal ──────────────────────
// Calcula el bono individualmente por turno (no por mes) porque el bono
// depende de la venta diaria y del PDV donde trabajó ese día.
// Los umbrales de bono están en calculos.servicio.ts → TABLA_BONOS.

export async function getNomina(mes: string) {
  const inicio = new Date(`${mes}-01T00:00:00-04:00`)
  const fin    = new Date(inicio)
  fin.setMonth(fin.getMonth() + 1)

  // Traer todos los turnos cerrados del mes para vendedores
  const turnos = await prisma.turnoCaja.findMany({
    where: {
      estado:         'CERRADO',
      fecha_apertura: { gte: inicio, lt: fin },
      usuario: { rol: { nombre: 'VENDEDOR' } },
    },
    include: {
      usuario: { select: { id: true, nombre: true, pago_diario: true } },
      pdv:     { select: { nombre: true } },
    },
  })

  // Agregar por usuario calculando bono turno a turno
  const porUsuario = new Map<number, {
    nombre:         string
    pagoDiario:     number
    dias:           number
    ventaTotal:     number
    bonos:          number
    descuentosCaja: number
  }>()

  for (const turno of turnos) {
    const uid         = turno.usuario?.id ?? 0
    const ventaTurno  = turno.total_calculado ?? 0
    const bonoTurno   = calcularBono(turno.pdv.nombre, ventaTurno)
    const descuento   = turno.diferencia_caja !== null && turno.diferencia_caja < 0
      ? Math.abs(turno.diferencia_caja)
      : 0

    if (!porUsuario.has(uid)) {
      porUsuario.set(uid, {
        nombre:         turno.usuario?.nombre ?? 'Usuario eliminado',
        pagoDiario:     turno.usuario?.pago_diario ?? 0,
        dias:           0,
        ventaTotal:     0,
        bonos:          0,
        descuentosCaja: 0,
      })
    }

    const entrada = porUsuario.get(uid)!
    entrada.dias++
    entrada.ventaTotal     += ventaTurno
    entrada.bonos          += bonoTurno
    entrada.descuentosCaja += descuento
  }

  return Array.from(porUsuario.entries())
    .sort(([, a], [, b]) => a.nombre.localeCompare(b.nombre, 'es'))
    .map(([usuarioId, data]) => {
      const pagoBase = data.dias * data.pagoDiario
      return {
        usuarioId,
        nombre:              data.nombre,
        diasTrabajados:      data.dias,
        promedioVentaDiaria: data.dias > 0 ? Math.round(data.ventaTotal / data.dias) : 0,
        pagoBase,
        bonos:               data.bonos,
        descuentosCaja:      data.descuentosCaja,
        sueldoLiquido:       pagoBase + data.bonos - data.descuentosCaja,
      }
    })
}
