import { Prisma } from '@prisma/client'
import prisma from '../config/prisma'
import { ErrorApp, noEncontrado, conflicto } from '../lib/errores'
import { resolverBodegaId } from './bodega.servicio'
import type { GuardarPreparacionInput } from '../validaciones/preparacion.schema'

// ─── Preparación del siguiente turno ──────────────────────────────────────────
//
// El admin/supervisor prepara, por sucursal y fecha, los ingresos que recibirá
// un turno futuro. Preparar DESCUENTA de la bodega central (reserva el stock,
// queda "en tránsito"). Al abrir el turno, la vendedora verifica y el ingreso se
// SUMA al stock del PDV (stock = inicio + ingreso), pasando la preparación a
// CONFIRMADA. Anular una preparación PENDIENTE devuelve el stock a la bodega.
//
// Regla anti-doble-conteo: la bodega baja al PREPARAR y el PDV sube al CONFIRMAR
// (en la apertura). Nunca ambas en el mismo paso.

// ─── Helpers de fecha (@db.Date con mediodía UTC) ──

/** Convierte 'YYYY-MM-DD' al Date de mediodía UTC usado para columnas @db.Date. */
function fechaADate(fecha: string): Date {
  return new Date(`${fecha}T12:00:00.000Z`)
}

// ─── Serialización ────────────────────────────────────────────────────────────

const prepInclude = {
  pdv:   { select: { nombre: true } },
  items: {
    include: { producto: { select: { nombre: true, categoria: { select: { nombre: true } } } } },
    orderBy: { producto: { nombre: 'asc' } },
  },
} satisfies Prisma.PreparacionTurnoInclude

type PrepConItems = Prisma.PreparacionTurnoGetPayload<{ include: typeof prepInclude }>

function mapPreparacion(prep: PrepConItems) {
  return {
    id:            prep.id,
    pdvId:         prep.pdv_id,
    pdvNombre:     prep.pdv.nombre,
    fecha:         prep.fecha.toISOString().slice(0, 10),
    estado:        prep.estado,
    notas:         prep.notas,
    creadoPor:     prep.creado_por_nombre,
    creadoEn:      prep.creado_en.toISOString(),
    confirmadoEn:  prep.confirmado_en?.toISOString() ?? null,
    totalUnidades: prep.items.reduce((s, i) => s + i.cantidad, 0),
    items: prep.items.map((i) => ({
      productoId: i.producto_id,
      nombre:     i.producto.nombre,
      categoria:  i.producto.categoria.nombre,
      cantidad:   i.cantidad,
    })),
  }
}

// ─── Lecturas ─────────────────────────────────────────────────────────────────

/** Lista de preparaciones (admin), opcionalmente filtradas por fecha. */
export async function getPreparaciones(fecha?: string) {
  const preps = await prisma.preparacionTurno.findMany({
    where:   fecha ? { fecha: fechaADate(fecha) } : {},
    include: prepInclude,
    orderBy: [{ fecha: 'desc' }, { pdv_id: 'asc' }],
    take:    500,
  })
  return preps.map(mapPreparacion)
}

/** Preparación de un PDV para una fecha concreta (o null si no existe). */
export async function getPreparacionPorPdvFecha(pdvId: number, fecha: string) {
  const prep = await prisma.preparacionTurno.findUnique({
    where:   { pdv_id_fecha: { pdv_id: pdvId, fecha: fechaADate(fecha) } },
    include: prepInclude,
  })
  return prep ? mapPreparacion(prep) : null
}

// ─── Guardar (crear o editar) ─────────────────────────────────────────────────

/**
 * Crea o actualiza la preparación de una sucursal para una fecha. Ajusta la
 * bodega central por la DIFERENCIA respecto a lo ya reservado por esta misma
 * preparación (si estaba PENDIENTE): descuenta lo que aumenta, devuelve lo que
 * baja. Valida stock suficiente en bodega (409). Una preparación CONFIRMADA no
 * se puede modificar (el ingreso ya fue recibido por la vendedora).
 */
export async function guardarPreparacion(
  data: GuardarPreparacionInput,
  usuario: { id: number; nombre: string },
) {
  const BODEGA_PDV_ID = await resolverBodegaId()

  const pdv = await prisma.pDV.findUnique({ where: { id: data.pdvId } })
  if (!pdv) throw noEncontrado('Sucursal')
  if (pdv.tipo !== 'PUNTO_VENTA') throw new ErrorApp('La preparación solo aplica a puntos de venta')

  const fechaDate = fechaADate(data.fecha)

  // Consolidar por producto y descartar cantidades en 0.
  const deseado = new Map<number, number>()
  for (const it of data.items) {
    if (it.cantidad <= 0) continue
    deseado.set(it.productoId, (deseado.get(it.productoId) ?? 0) + it.cantidad)
  }

  // Nombres de producto para mensajes de error legibles.
  const productos = await prisma.producto.findMany({
    where:  { id: { in: [...deseado.keys()] } },
    select: { id: true, nombre: true },
  })
  const nombrePorId = new Map(productos.map((p) => [p.id, p.nombre]))

  await prisma.$transaction(async (tx) => {
    const existente = await tx.preparacionTurno.findUnique({
      where:   { pdv_id_fecha: { pdv_id: data.pdvId, fecha: fechaDate } },
      include: { items: true },
    })
    if (existente?.estado === 'CONFIRMADA') {
      throw conflicto('Esta preparación ya fue confirmada por la vendedora; no se puede modificar')
    }

    // Lo ya reservado en bodega por esta preparación (solo si sigue PENDIENTE;
    // una ANULADA ya devolvió su stock, así que su reserva vigente es 0).
    const reservadoPrev = new Map<number, number>()
    if (existente && existente.estado === 'PENDIENTE') {
      for (const it of existente.items) reservadoPrev.set(it.producto_id, it.cantidad)
    }

    const productoIds = new Set<number>([...reservadoPrev.keys(), ...deseado.keys()])

    // Aplicar la diferencia contra la bodega, producto por producto.
    for (const pid of productoIds) {
      const delta = (deseado.get(pid) ?? 0) - (reservadoPrev.get(pid) ?? 0)
      if (delta === 0) continue

      if (delta > 0) {
        // Reservar más: descuento condicional para no dejar bodega negativa.
        const descontado = await tx.inventario.updateMany({
          where: { pdv_id: BODEGA_PDV_ID, producto_id: pid, stock_actual: { gte: delta } },
          data:  { stock_actual: { decrement: delta } },
        })
        if (descontado.count === 0) {
          const invB = await tx.inventario.findUnique({
            where: { pdv_id_producto_id: { pdv_id: BODEGA_PDV_ID, producto_id: pid } },
          })
          const nombre = nombrePorId.get(pid) ?? `#${pid}`
          throw new ErrorApp(
            `Stock insuficiente en bodega para ${nombre}: ` +
            `disponible ${invB?.stock_actual ?? 0}, se necesitan ${delta} más`,
            409,
          )
        }
      } else {
        // Liberar reserva: devolver a bodega.
        await tx.inventario.upsert({
          where:  { pdv_id_producto_id: { pdv_id: BODEGA_PDV_ID, producto_id: pid } },
          update: { stock_actual: { increment: -delta } },
          create: { pdv_id: BODEGA_PDV_ID, producto_id: pid, stock_actual: -delta, stock_critico: 0 },
        })
      }
    }

    // Upsert de la cabecera (queda PENDIENTE) + reemplazo de ítems.
    const prep = await tx.preparacionTurno.upsert({
      where:  { pdv_id_fecha: { pdv_id: data.pdvId, fecha: fechaDate } },
      update: {
        estado:            'PENDIENTE',
        notas:             data.notas ?? null,
        creado_por_id:     usuario.id,
        creado_por_nombre: usuario.nombre,
        confirmado_en:     null,
      },
      create: {
        pdv_id:            data.pdvId,
        fecha:             fechaDate,
        estado:            'PENDIENTE',
        notas:             data.notas ?? null,
        creado_por_id:     usuario.id,
        creado_por_nombre: usuario.nombre,
      },
    })

    await tx.preparacionItem.deleteMany({ where: { preparacion_id: prep.id } })
    if (deseado.size > 0) {
      await tx.preparacionItem.createMany({
        data: [...deseado.entries()].map(([productoId, cantidad]) => ({
          preparacion_id: prep.id,
          producto_id:    productoId,
          cantidad,
        })),
      })
    }
  })

  return {
    mensaje: 'Preparación guardada',
    pdv:     pdv.nombre,
    fecha:   data.fecha,
    items:   deseado.size,
  }
}

// ─── Anular ───────────────────────────────────────────────────────────────────

/** Anula una preparación PENDIENTE y devuelve el stock reservado a la bodega. */
export async function anularPreparacion(id: number) {
  const BODEGA_PDV_ID = await resolverBodegaId()

  await prisma.$transaction(async (tx) => {
    const prep = await tx.preparacionTurno.findUnique({ where: { id }, include: { items: true } })
    if (!prep) throw noEncontrado('Preparación')
    if (prep.estado === 'CONFIRMADA') throw conflicto('No se puede anular una preparación ya confirmada')
    if (prep.estado === 'ANULADA') return

    for (const it of prep.items) {
      if (it.cantidad <= 0) continue
      await tx.inventario.upsert({
        where:  { pdv_id_producto_id: { pdv_id: BODEGA_PDV_ID, producto_id: it.producto_id } },
        update: { stock_actual: { increment: it.cantidad } },
        create: { pdv_id: BODEGA_PDV_ID, producto_id: it.producto_id, stock_actual: it.cantidad, stock_critico: 0 },
      })
    }

    await tx.preparacionTurno.update({ where: { id }, data: { estado: 'ANULADA', confirmado_en: null } })
  })

  return { anulada: id }
}

// ─── Confirmación en la apertura del turno ────────────────────────────────────

/**
 * Aplica (si existe) la preparación PENDIENTE de un PDV para una fecha: suma el
 * ingreso al stock del PDV, registra el movimiento TRASPASO y marca la
 * preparación como CONFIRMADA. Diseñada para correr DENTRO de la transacción de
 * apertura de turno. Devuelve un resumen o null si no había preparación.
 *
 * No vuelve a descontar la bodega: ese descuento ya ocurrió al preparar.
 */
export async function confirmarPreparacionEnApertura(
  tx: Prisma.TransactionClient,
  pdvId: number,
  fecha: string,
) {
  const prep = await tx.preparacionTurno.findFirst({
    where:   { pdv_id: pdvId, fecha: fechaADate(fecha), estado: 'PENDIENTE' },
    include: { items: true },
  })
  if (!prep) return null

  const loteId = crypto.randomUUID()
  const ahora  = new Date()

  for (const it of prep.items) {
    if (it.cantidad <= 0) continue
    await tx.inventario.upsert({
      where:  { pdv_id_producto_id: { pdv_id: pdvId, producto_id: it.producto_id } },
      update: { stock_actual: { increment: it.cantidad } },
      create: { pdv_id: pdvId, producto_id: it.producto_id, stock_actual: it.cantidad, stock_critico: 0 },
    })
    // TRASPASO sin origen: la salida de bodega ya se contabilizó al preparar.
    await tx.movimientoInv.create({
      data: {
        lote_id:        loteId,
        producto_id:    it.producto_id,
        pdv_origen_id:  null,
        pdv_destino_id: pdvId,
        tipo:           'TRASPASO',
        cantidad:       it.cantidad,
        fecha:          ahora,
      },
    })
  }

  await tx.preparacionTurno.update({
    where: { id: prep.id },
    data:  { estado: 'CONFIRMADA', confirmado_en: ahora },
  })

  return { preparacionId: prep.id, items: prep.items.length }
}
