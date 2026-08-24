import prisma from '../config/prisma'
import { conflicto, accesoDenegado, noEncontrado } from '../lib/errores'
import { despacharSolicitudConStock, regularizarSolicitudSinDespacho, acreditarDespachoEnPDV } from './bodega.servicio'
import type { CrearSolicitudInput, DespacharSolicitudInput } from '../validaciones/solicitudes.schema'

// ⚠️ Alcance del flujo de solicitudes (A15 — antes eran dos pasos separados):
// despachar una solicitud SÍ mueve stock real. El pedido y la entrega quedan
// unificados: `despacharSolicitud` delega en
// `bodega.servicio.despacharSolicitudConStock`, que en una transacción descuenta
// bodega, suma al PDV, registra MovimientoInv y crea el Despacho enlazado
// (`solicitud_id`). El despacho ad-hoc (`registrarDespacho`) sigue existiendo
// para envíos sin pedido previo. Lo que nunca hay que hacer es despachar la
// solicitud Y registrar además un despacho manual por lo mismo: se duplicaría
// el movimiento de stock.

// ─── Crear solicitud (vendedor) ───────────────────────────────────────────────

export async function crearSolicitud(data: CrearSolicitudInput, usuarioId: number) {
  const solicitud = await prisma.$transaction(async (tx) => {
    const sol = await tx.solicitud.create({
      data: {
        pdv_id:     data.pdvId,
        usuario_id: usuarioId,
        notas:      data.notas ?? null,
        items: {
          create: data.items.map(it => ({
            producto_id: it.productoId,
            cantidad:    it.cantidad,
          })),
        },
      },
      include: {
        items:   { include: { producto: { select: { nombre: true, categoria: { select: { nombre: true } } } } } },
        pdv:     { select: { nombre: true } },
        usuario: { select: { nombre: true } },
      },
    })

    // Avisar a quienes despachan (BODEGUERO/ADMIN/SUPERVISOR). Antes la solicitud
    // aparecía en la lista sin notificar a nadie — el admin no se enteraba.
    // Global (sin pdv_id): la bodega atiende todas las sucursales.
    const despachadores = await tx.usuario.findMany({
      where:  { activo: true, es_demo: false, id: { not: usuarioId },
                rol: { nombre: { in: ['BODEGUERO', 'ADMIN', 'SUPERVISOR'] } } },
      select: { id: true },
    })
    if (despachadores.length > 0) {
      await tx.notificacion.createMany({
        data: despachadores.map((u) => ({
          usuario_id: u.id,
          titulo:  'Nueva solicitud de insumos',
          mensaje: `${sol.usuario?.nombre ?? 'Un vendedor'} en ${sol.pdv.nombre} ` +
                   `pidió ${data.items.length} producto(s) a bodega.`,
        })),
      })
    }
    return sol
  })
  return formatearSolicitud(solicitud)
}

// ─── Listar solicitudes ───────────────────────────────────────────────────────
// - VENDEDOR: solo las de su PDV
// - BODEGUERO / ADMIN / SUPERVISOR: todas (o filtradas por pdvId)

export async function getSolicitudes(rol: string, usuarioId: number, filtroPdvId?: number) {
  const where: Record<string, unknown> = {}

  if (rol === 'VENDEDOR') {
    // Vendedores ven sus propias solicitudes (independiente del PDV donde roten)
    where.usuario_id = usuarioId
  } else if (filtroPdvId) {
    where.pdv_id = filtroPdvId
  }

  const solicitudes = await prisma.solicitud.findMany({
    where,
    include: {
      items: { include: { producto: { select: { nombre: true, categoria: { select: { nombre: true } } } } } },
      pdv:     { select: { nombre: true } },
      usuario: { select: { nombre: true } },
    },
    orderBy: { fecha: 'desc' },
    take: 300,
  })

  const despachosPorSolicitud = await cargarDespachos(solicitudes.map((s) => s.id))
  return solicitudes.map((s) => formatearSolicitud(s, despachosPorSolicitud.get(s.id)))
}

// ─── Despachar solicitud (bodeguero/admin/supervisor) ────────────────────────
// MUEVE STOCK real (A15): delega en `bodega.servicio.despacharSolicitudConStock`
// (descuenta bodega, suma al PDV, crea el despacho enlazado y marca DESPACHADA).
// Antes aquí solo se cambiaba el estado sin mover inventario — el PDV nunca
// recibía el stock. Devuelve la solicitud ya actualizada para que el frontend
// no tenga que refetchear a ciegas.

export async function despacharSolicitud(
  solicitudId: number,
  data: DespacharSolicitudInput,
  usuario: { id: number; nombre: string },
) {
  await despacharSolicitudConStock(solicitudId, data, usuario)
  return releerSolicitud(solicitudId)
}

/**
 * Regulariza una solicitud cerrada que nunca movió stock (ver
 * `bodega.servicio.regularizarSolicitudSinDespacho`). El estado de la solicitud no
 * cambia: lo que faltaba era el movimiento de inventario, no el acuse.
 */
export async function regularizarSolicitud(
  solicitudId: number,
  data: DespacharSolicitudInput,
  usuario: { id: number; nombre: string },
) {
  await regularizarSolicitudSinDespacho(solicitudId, data, usuario)
  return releerSolicitud(solicitudId)
}

async function releerSolicitud(solicitudId: number) {
  const sol = await prisma.solicitud.findUniqueOrThrow({
    where: { id: solicitudId },
    include: {
      items: { include: { producto: { select: { nombre: true, categoria: { select: { nombre: true } } } } } },
      pdv:     { select: { nombre: true } },
      usuario: { select: { nombre: true } },
    },
  })
  const despachos = await cargarDespachos([solicitudId])
  return formatearSolicitud(sol, despachos.get(solicitudId))
}

// ─── Rechazar solicitud (bodeguero/admin/supervisor) ─────────────────────────
// A18/H9: antes un pedido que no se despacharía quedaba PENDIENTE para siempre.
// Rechazar le da un estado final con motivo opcional y avisa al vendedor.

export async function rechazarSolicitud(solicitudId: number, motivo?: string) {
  const sol = await prisma.solicitud.findUnique({ where: { id: solicitudId } })
  if (!sol) throw noEncontrado('Solicitud')
  if (sol.estado !== 'PENDIENTE') throw conflicto('Solo se pueden rechazar solicitudes pendientes')

  const motivoLimpio = motivo?.trim() || null

  const actualizada = await prisma.$transaction(async (tx) => {
    const upd = await tx.solicitud.update({
      where: { id: solicitudId },
      data:  { estado: 'RECHAZADA', motivo_rechazo: motivoLimpio, fecha_cierre: new Date() },
      include: {
        items: { include: { producto: { select: { nombre: true, categoria: { select: { nombre: true } } } } } },
        pdv:     { select: { nombre: true } },
        usuario: { select: { nombre: true } },
      },
    })
    // Aviso al vendedor, scoped al PDV de la solicitud (solo se ve en esa sesión).
    if (sol.usuario_id) {
      await tx.notificacion.create({
        data: {
          usuario_id: sol.usuario_id,
          pdv_id:     sol.pdv_id,
          titulo:     'Solicitud rechazada',
          mensaje:    `Tu solicitud de insumos #${sol.id} fue rechazada` +
                      `${motivoLimpio ? `: ${motivoLimpio}` : '.'}`,
        },
      })
    }
    return upd
  })

  return formatearSolicitud(actualizada)
}

// ─── Confirmar recepción (vendedor) ──────────────────────────────────────────

export async function confirmarSolicitud(
  solicitudId: number,
  usuario: { id: number; nombre: string; rol: string },
) {
  const sol = await prisma.solicitud.findUnique({ where: { id: solicitudId } })
  if (!sol) throw noEncontrado('Solicitud')
  if (sol.estado !== 'DESPACHADA') throw conflicto('Solo se pueden confirmar solicitudes ya despachadas')
  // Bypass administrativo (H1): si el vendedor original queda inactivo, la
  // solicitud DESPACHADA quedaría colgada sin salida. ADMIN/SUPERVISOR pueden
  // confirmar en su lugar. BODEGUERO no (despacha; confirmar sería conflicto).
  const esAutorizador = usuario.rol === 'ADMIN' || usuario.rol === 'SUPERVISOR'
  if (!esAutorizador && sol.usuario_id !== null && sol.usuario_id !== usuario.id) throw accesoDenegado('Solo el vendedor que solicitó puede confirmar la recepción')

  const actualizada = await prisma.$transaction(async (tx) => {
    const upd = await tx.solicitud.update({
      where: { id: solicitudId },
      data:  { estado: 'CONFIRMADA', fecha_cierre: new Date() },
      include: {
        items: { include: { producto: { select: { nombre: true, categoria: { select: { nombre: true } } } } } },
        pdv:     { select: { nombre: true } },
        usuario: { select: { nombre: true } },
      },
    })
    // Acreditar AHORA el stock en el inventario del PDV (despacho diferido): al
    // despachar el stock salió de bodega pero NO entró al PDV; recién con la
    // confirmación del vendedor cuenta para su turno/cierre. Se lee cada despacho
    // ENVIADO enlazado y se suman sus cantidades al PDV.
    const despachosPend = await tx.despacho.findMany({
      where:  { solicitud_id: solicitudId, estado: 'ENVIADO' },
      select: { lote_id: true, pdv_destino_id: true },
    })
    for (const d of despachosPend) {
      await acreditarDespachoEnPDV(tx, d.lote_id, d.pdv_destino_id)
    }

    // Confirmar el/los despacho(s) enlazado(s) (A15): la recepción del vendedor
    // sobre la solicitud es el acuse del despacho real de stock.
    await tx.despacho.updateMany({
      where: { solicitud_id: solicitudId, estado: 'ENVIADO' },
      data:  {
        estado:                'CONFIRMADO',
        confirmado_por_id:     usuario.id,
        // Snapshot del nombre de QUIEN confirma (no del solicitante: con el
        // bypass administrativo pueden ser distintos). El historial de despachos
        // lo lee desde aquí, igual que confirmarDespacho.
        confirmado_por_nombre: usuario.nombre,
        confirmado_en:         new Date(),
      },
    })
    return upd
  })
  const despachos = await cargarDespachos([solicitudId])
  return formatearSolicitud(actualizada, despachos.get(solicitudId))
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type SolicitudConRelaciones = Awaited<ReturnType<typeof prisma.solicitud.findUniqueOrThrow>> & {
  items:   Array<{ id: number; cantidad: number; producto_id: number; producto: { nombre: string; categoria: { nombre: string } } }>
  pdv:     { nombre: string }
  usuario: { nombre: string } | null
}

interface DespachoResumen {
  loteId:        string
  fecha:         string
  enviadoPor:    string | null
  estado:        string
  observacion:   string | null // nota que el bodeguero dejó al despachar
  cantidadItems: number
  totalUnidades: number
  items:         Array<{ productoId: number; producto: string; cantidad: number }>
}

/**
 * Despachos enlazados a un conjunto de solicitudes (A15), con el detalle de lo
 * que realmente salió de bodega. Sirve para comparar "pedido vs despachado":
 * el bodeguero puede enviar menos de lo solicitado, y los ítems de la solicitud
 * siguen mostrando el pedido original.
 * Dos consultas fijas (encabezados + movimientos), no una por solicitud.
 */
async function cargarDespachos(solicitudIds: number[]): Promise<Map<number, DespachoResumen[]>> {
  const porSolicitud = new Map<number, DespachoResumen[]>()
  if (solicitudIds.length === 0) return porSolicitud

  const headers = await prisma.despacho.findMany({
    where:   { solicitud_id: { in: solicitudIds } },
    orderBy: { creado_en: 'desc' },
  })
  if (headers.length === 0) return porSolicitud

  const movimientos = await prisma.movimientoInv.findMany({
    where:   { lote_id: { in: headers.map((h) => h.lote_id) } },
    include: { producto: { select: { nombre: true } } },
  })
  const itemsPorLote = new Map<string, DespachoResumen['items']>()
  for (const m of movimientos) {
    if (!m.lote_id) continue
    const arr = itemsPorLote.get(m.lote_id) ?? []
    arr.push({ productoId: m.producto_id, producto: m.producto.nombre, cantidad: m.cantidad })
    itemsPorLote.set(m.lote_id, arr)
  }

  for (const h of headers) {
    if (h.solicitud_id == null) continue
    const arr = porSolicitud.get(h.solicitud_id) ?? []
    arr.push({
      loteId:        h.lote_id,
      fecha:         h.creado_en.toISOString(),
      enviadoPor:    h.usuario_envia_nombre ?? null,
      estado:        h.estado as string,
      observacion:   h.observacion ?? null,
      cantidadItems: h.cantidad_items,
      totalUnidades: h.total_unidades,
      items:         itemsPorLote.get(h.lote_id) ?? [],
    })
    porSolicitud.set(h.solicitud_id, arr)
  }
  return porSolicitud
}

function formatearSolicitud(s: SolicitudConRelaciones, despachos: DespachoResumen[] = []) {
  return {
    id:          s.id,
    pdvNombre:   s.pdv.nombre,
    pdvId:       s.pdv_id,
    solicitante: s.usuario?.nombre ?? 'Usuario eliminado',
    estado:      s.estado as string,
    notas:       s.notas ?? null,
    motivoRechazo: s.motivo_rechazo ?? null,
    fecha:       s.fecha.toISOString(),
    fechaCierre: s.fecha_cierre?.toISOString() ?? null,
    items: s.items.map(it => ({
      id:         it.id,
      // productoId: el bodeguero despacha por producto (cantidades ajustadas),
      // no por id de línea de solicitud.
      productoId: it.producto_id,
      producto:   it.producto.nombre,
      categoria:  it.producto.categoria.nombre,
      cantidad:   it.cantidad,
    })),
    despachos,
  }
}
