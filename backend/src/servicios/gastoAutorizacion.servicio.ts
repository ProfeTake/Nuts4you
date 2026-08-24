import { Prisma } from '@prisma/client'
import prisma from '../config/prisma'
import { noEncontrado, conflicto, accesoDenegado } from '../lib/errores'
import type { SolicitarGastoInput, ResolverGastoInput } from '../validaciones/gastoAutorizacion.schema'

// ─── Gasto con autorización ───────────────────────────────────────────────────
//
// El vendedor solicita autorizar un gasto (monto + motivo + foto del boucher).
// Supervisor/Admin reciben una notificación y aprueban o rechazan. Al aprobar se
// crea un GastoTurno vinculado al turno, de modo que el gasto aparece en el
// cierre de caja (el vendedor lo carga vía cargarGastosDesdeAPI). La foto va en
// base64 y se sirve aparte (no en los listados) para no inflar las respuestas.

/** Contexto mínimo del usuario autenticado. */
export interface UsuarioCtx { id: number; nombre: string; rol: string; pdvId: number | null }

const clp = (n: number) => `$${n.toLocaleString('es-CL')}`

/** Crea una notificación para cada ADMIN/SUPERVISOR activo (autorizadores). */
async function notificarAutorizadores(
  tx: Prisma.TransactionClient,
  notif: { titulo: string; mensaje: string },
) {
  const autorizadores = await tx.usuario.findMany({
    where:  { activo: true, es_demo: false, rol: { nombre: { in: ['ADMIN', 'SUPERVISOR'] } } },
    select: { id: true },
  })
  if (autorizadores.length === 0) return
  await tx.notificacion.createMany({
    data: autorizadores.map((u) => ({ usuario_id: u.id, titulo: notif.titulo, mensaje: notif.mensaje })),
  })
}

// ─── Serialización (sin la foto) ──────────────────────────────────────────────

// select explícito que EXCLUYE la foto (columna grande) de los listados.
const solSelect = {
  id: true, turno_id: true, pdv_id: true, usuario_id: true, usuario_nombre: true,
  monto: true, motivo: true, categoria: true, estado: true,
  resuelto_por_nombre: true, comentario_resolucion: true, creado_en: true, resuelto_en: true,
  pdv:     { select: { nombre: true } },
  usuario: { select: { nombre: true } },
} satisfies Prisma.SolicitudGastoSelect

type SolRow = Prisma.SolicitudGastoGetPayload<{ select: typeof solSelect }>

function mapSolicitud(s: SolRow) {
  return {
    id:          s.id,
    turnoId:     s.turno_id,
    pdvId:       s.pdv_id,
    pdvNombre:   s.pdv?.nombre ?? null,
    vendedor:    s.usuario_nombre ?? s.usuario?.nombre ?? null,
    monto:       s.monto,
    motivo:      s.motivo,
    categoria:   s.categoria,
    estado:      s.estado,
    resueltoPor: s.resuelto_por_nombre,
    comentario:  s.comentario_resolucion,
    creadoEn:    s.creado_en.toISOString(),
    resueltoEn:  s.resuelto_en?.toISOString() ?? null,
  }
}

// ─── Solicitar (vendedor) ─────────────────────────────────────────────────────

export async function solicitarGasto(data: SolicitarGastoInput, usuario: UsuarioCtx) {
  const turno = await prisma.turnoCaja.findUnique({ where: { id: data.turnoId } })
  if (!turno) throw noEncontrado('Turno')
  if (turno.estado !== 'ABIERTO') throw conflicto('El turno ya está cerrado')

  const esAutorizador = usuario.rol === 'ADMIN' || usuario.rol === 'SUPERVISOR'
  if (!esAutorizador && turno.usuario_id !== usuario.id && turno.pdv_id !== usuario.pdvId) {
    throw accesoDenegado('El turno no pertenece a tu punto de venta')
  }

  const creada = await prisma.$transaction(async (tx) => {
    const sol = await tx.solicitudGasto.create({
      data: {
        turno_id:       turno.id,
        pdv_id:         turno.pdv_id,
        usuario_id:     usuario.id,
        usuario_nombre: usuario.nombre,
        monto:          data.monto,
        motivo:         data.motivo,
        categoria:      data.categoria ?? null,
        foto:           data.foto ?? null,
        estado:         'PENDIENTE',
      },
    })
    const pdv = await tx.pDV.findUnique({ where: { id: turno.pdv_id }, select: { nombre: true } })
    await notificarAutorizadores(tx, {
      titulo:  'Gasto por autorizar',
      mensaje: `${usuario.nombre} en ${pdv?.nombre ?? 'sucursal'} solicita autorizar ` +
               `${clp(data.monto)} — ${data.motivo}`,
    })
    return sol
  })

  return { id: creada.id, estado: creada.estado }
}

// ─── Lecturas ─────────────────────────────────────────────────────────────────

/** Listado para autorizadores (admin/supervisor). Sin foto. */
export async function getSolicitudesGasto(filtros: { estado?: string; pdvId?: number }) {
  const where: Prisma.SolicitudGastoWhereInput = {}
  if (filtros.estado) where.estado = filtros.estado as Prisma.EnumEstadoGastoFilter['equals']
  if (filtros.pdvId)  where.pdv_id = filtros.pdvId

  const rows = await prisma.solicitudGasto.findMany({
    where,
    select:  solSelect,
    orderBy: { creado_en: 'desc' },
    take:    200,
  })
  return rows.map(mapSolicitud)
}

/** Solicitudes de un turno (para que el vendedor vea el estado en su cuadre). */
export async function getSolicitudesGastoTurno(turnoId: number, usuario: UsuarioCtx) {
  const turno = await prisma.turnoCaja.findUnique({ where: { id: turnoId } })
  if (!turno) throw noEncontrado('Turno')
  const esAutorizador = usuario.rol === 'ADMIN' || usuario.rol === 'SUPERVISOR'
  if (!esAutorizador && turno.usuario_id !== usuario.id && turno.pdv_id !== usuario.pdvId) {
    throw accesoDenegado('El turno no pertenece a tu punto de venta')
  }
  const rows = await prisma.solicitudGasto.findMany({
    where:   { turno_id: turnoId },
    select:  solSelect,
    orderBy: { creado_en: 'desc' },
  })
  return rows.map(mapSolicitud)
}

/** Cantidad de solicitudes pendientes (para badge de autorizadores). */
export async function contarPendientes() {
  return prisma.solicitudGasto.count({ where: { estado: 'PENDIENTE' } })
}

/** Foto (data URI base64) de una solicitud, o null. Servida aparte del listado. */
export async function getFotoSolicitud(id: number) {
  const sol = await prisma.solicitudGasto.findUnique({ where: { id }, select: { foto: true } })
  if (!sol) throw noEncontrado('Solicitud de gasto')
  return sol.foto
}

// ─── Resolver: aprobar / rechazar (supervisor / admin) ────────────────────────

export async function resolverGasto(id: number, data: ResolverGastoInput, usuario: UsuarioCtx) {
  // select explícito: sin él se leía la fila completa (incluida la foto en
  // LONGTEXT) solo para validar estado y armar el GastoTurno.
  const sol = await prisma.solicitudGasto.findUnique({
    where:  { id },
    select: { estado: true, turno_id: true, motivo: true, monto: true, usuario_id: true },
  })
  if (!sol) throw noEncontrado('Solicitud de gasto')
  if (sol.estado !== 'PENDIENTE') throw conflicto('Esta solicitud ya fue resuelta')

  await prisma.$transaction(async (tx) => {
    let gastoTurnoId: number | null = null

    // Al aprobar: crear el GastoTurno para que aparezca en el cierre de caja.
    // Guarda H3: el turno puede haberse cerrado entre solicitar y aprobar; si el
    // cuadre ya se persistió, el gasto no entraría. Se exige turno ABIERTO.
    if (data.aprobar) {
      const turno = await tx.turnoCaja.findUnique({
        where:  { id: sol.turno_id },
        select: { estado: true },
      })
      if (!turno) throw noEncontrado('Turno')
      if (turno.estado !== 'ABIERTO') {
        throw conflicto('No se puede aprobar el gasto: el turno ya fue cerrado')
      }
      const gasto = await tx.gastoTurno.create({
        data: { turno_id: sol.turno_id, descripcion: sol.motivo, monto: sol.monto },
      })
      gastoTurnoId = gasto.id
    }

    await tx.solicitudGasto.update({
      where: { id },
      data: {
        estado:                data.aprobar ? 'APROBADO' : 'RECHAZADO',
        gasto_turno_id:        gastoTurnoId,
        resuelto_por_id:       usuario.id,
        resuelto_por_nombre:   usuario.nombre,
        comentario_resolucion: data.comentario ?? null,
        resuelto_en:           new Date(),
      },
    })

    // Avisar al vendedor el resultado.
    if (sol.usuario_id) {
      await tx.notificacion.create({
        data: {
          usuario_id: sol.usuario_id,
          titulo:     data.aprobar ? 'Gasto aprobado' : 'Gasto rechazado',
          mensaje:    `Tu gasto de ${clp(sol.monto)} (${sol.motivo}) fue ` +
                      `${data.aprobar ? 'aprobado' : 'rechazado'}` +
                      `${data.comentario ? `: ${data.comentario}` : ''}.`,
        },
      })
    }
  })

  return { id, estado: data.aprobar ? 'APROBADO' : 'RECHAZADO' }
}
