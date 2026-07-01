import prisma from '../config/prisma'
import type { DespachoInput, AjustarStockInput, CrearInventarioInput, CrearProductoInput, GuardarLoteInput } from '../validaciones/bodega.schema'
import { rangoFechaChile } from '../lib/tiempoChile'

// El ID de la Bodega Central se resuelve por tipo (BODEGA), no se asume que sea 1.
// Esto evita que un re-seed o migración con IDs distintos rompa silenciosamente
// toda la lógica de despacho. Se cachea tras la primera resolución.
let bodegaPdvIdCache: number | null = null

async function resolverBodegaId(): Promise<number> {
  if (bodegaPdvIdCache != null) return bodegaPdvIdCache
  const bodega = await prisma.pDV.findFirstOrThrow({ where: { tipo: 'BODEGA' } })
  bodegaPdvIdCache = bodega.id
  return bodegaPdvIdCache
}

export async function getStockBodega() {
  const BODEGA_PDV_ID = await resolverBodegaId()
  const items = await prisma.inventario.findMany({
    where: { pdv_id: BODEGA_PDV_ID },
    include: {
      producto: {
        include: { categoria: { select: { nombre: true } } },
      },
    },
    orderBy: [
      { producto: { categoria: { nombre: 'asc' } } },
      { producto: { nombre: 'asc' } },
    ],
  })

  return items.map((i) => ({
    inventarioId: i.id,
    productoId:   i.producto_id,
    nombre:       i.producto.nombre,
    categoria:    i.producto.categoria.nombre,
    precioVenta:  i.producto.precio_venta,
    stockActual:  i.stock_actual,
    stockCritico: i.stock_critico,
  }))
}

export async function ajustarStock(inventarioId: number, data: AjustarStockInput) {
  const BODEGA_PDV_ID = await resolverBodegaId()
  const inv = await prisma.inventario.findUniqueOrThrow({ where: { id: inventarioId } })
  if (inv.pdv_id !== BODEGA_PDV_ID) {
    throw new Error('Solo se puede ajustar stock de la bodega central desde aquí')
  }
  if (data.nombre) {
    await prisma.producto.update({
      where: { id: inv.producto_id },
      data:  { nombre: data.nombre.trim() },
    })
  }
  const actualizado = await prisma.inventario.update({
    where: { id: inventarioId },
    data: {
      stock_actual:  data.stockActual,
      stock_critico: data.stockCritico,
    },
    include: { producto: { select: { nombre: true } } },
  })
  return {
    inventarioId: actualizado.id,
    nombre:       actualizado.producto.nombre,
    stockActual:  actualizado.stock_actual,
    stockCritico: actualizado.stock_critico,
  }
}

export async function registrarDespacho(data: DespachoInput, _usuarioId: number) {
  const BODEGA_PDV_ID = await resolverBodegaId()
  // Verificar que el PDV destino existe y es PUNTO_VENTA
  const pdvDestino = await prisma.pDV.findUnique({
    where: { id: data.pdvDestinoId },
  })
  if (!pdvDestino) throw new Error('PDV destino no encontrado')
  if (pdvDestino.tipo !== 'PUNTO_VENTA') throw new Error('El destino debe ser un punto de venta')

  // Verificar stock disponible en bodega para cada item
  for (const item of data.items) {
    const invBodega = await prisma.inventario.findUnique({
      where: { pdv_id_producto_id: { pdv_id: BODEGA_PDV_ID, producto_id: item.productoId } },
    })
    if (!invBodega) {
      const producto = await prisma.producto.findUnique({ where: { id: item.productoId } })
      throw new Error(`Sin stock en bodega: ${producto?.nombre ?? `#${item.productoId}`}`)
    }
    if (invBodega.stock_actual < item.cantidad) {
      const producto = await prisma.producto.findUnique({ where: { id: item.productoId } })
      throw new Error(
        `Stock insuficiente en bodega para ${producto?.nombre ?? `#${item.productoId}`}: ` +
        `disponible ${invBodega.stock_actual}, solicitado ${item.cantidad}`
      )
    }
  }

  // Un id de lote por despacho: agrupa todos los productos de este envío.
  const loteId = crypto.randomUUID()
  const fechaLote = new Date()

  // Ejecutar despacho en transacción
  await prisma.$transaction(async (tx) => {
    for (const item of data.items) {
      // Descontar de bodega
      await tx.inventario.update({
        where: { pdv_id_producto_id: { pdv_id: BODEGA_PDV_ID, producto_id: item.productoId } },
        data: { stock_actual: { decrement: item.cantidad } },
      })

      // Sumar en PDV destino (upsert por si no existe aún)
      await tx.inventario.upsert({
        where: { pdv_id_producto_id: { pdv_id: data.pdvDestinoId, producto_id: item.productoId } },
        update: { stock_actual: { increment: item.cantidad } },
        create: {
          pdv_id:       data.pdvDestinoId,
          producto_id:  item.productoId,
          stock_actual: item.cantidad,
          stock_critico: 0,
        },
      })

      // Registrar movimiento TRASPASO
      await tx.movimientoInv.create({
        data: {
          lote_id:        loteId,
          producto_id:    item.productoId,
          pdv_origen_id:  BODEGA_PDV_ID,
          pdv_destino_id: data.pdvDestinoId,
          tipo:           'TRASPASO',
          cantidad:       item.cantidad,
          fecha:          fechaLote, // mismo timestamp para todo el despacho
        },
      })
    }
  })

  return {
    mensaje:     'Despacho registrado',
    destino:     pdvDestino.nombre,
    items:       data.items.length,
    observacion: data.observacion ?? null,
  }
}

export async function getProductosDisponibles() {
  const BODEGA_PDV_ID = await resolverBodegaId()
  const enBodega = await prisma.inventario.findMany({
    where: { pdv_id: BODEGA_PDV_ID },
    select: { producto_id: true },
  })
  const idsEnBodega = new Set(enBodega.map((i) => i.producto_id))

  const todos = await prisma.producto.findMany({
    where: { activo: true },
    include: { categoria: { select: { nombre: true } } },
    orderBy: [{ categoria: { nombre: 'asc' } }, { nombre: 'asc' }],
  })

  return todos
    .filter((p) => !idsEnBodega.has(p.id))
    .map((p) => ({ id: p.id, nombre: p.nombre, categoria: p.categoria.nombre }))
}

export async function crearInventarioBodega(data: CrearInventarioInput) {
  const BODEGA_PDV_ID = await resolverBodegaId()
  const existe = await prisma.inventario.findUnique({
    where: { pdv_id_producto_id: { pdv_id: BODEGA_PDV_ID, producto_id: data.productoId } },
  })
  if (existe) throw new Error('Este producto ya está en el inventario de la bodega')

  const inv = await prisma.inventario.create({
    data: {
      pdv_id:       BODEGA_PDV_ID,
      producto_id:  data.productoId,
      stock_actual: data.stockActual,
      stock_critico: data.stockCritico,
    },
    include: { producto: { include: { categoria: { select: { nombre: true } } } } },
  })

  return {
    inventarioId: inv.id,
    productoId:   inv.producto_id,
    nombre:       inv.producto.nombre,
    categoria:    inv.producto.categoria.nombre,
    precioVenta:  inv.producto.precio_venta,
    stockActual:  inv.stock_actual,
    stockCritico: inv.stock_critico,
  }
}

export async function eliminarInventarioBodega(inventarioId: number) {
  const BODEGA_PDV_ID = await resolverBodegaId()
  const inv = await prisma.inventario.findUniqueOrThrow({ where: { id: inventarioId } })
  if (inv.pdv_id !== BODEGA_PDV_ID) throw new Error('Solo se puede eliminar stock de la bodega central')
  await prisma.inventario.delete({ where: { id: inventarioId } })
  return { eliminado: inventarioId }
}

export async function getCategorias() {
  return prisma.categoria.findMany({ orderBy: { nombre: 'asc' } })
}

export async function buscarPorCodigoBarra(codigo: string) {
  return prisma.producto.findUnique({
    where: { codigo_barra: codigo },
    include: { categoria: { select: { nombre: true } } },
  })
}

export async function crearProducto(data: CrearProductoInput) {
  // Resolver categoría: usar la existente o crear una nueva
  let categoriaId: number
  if (data.categoriaId) {
    categoriaId = data.categoriaId
  } else {
    const cat = await prisma.categoria.upsert({
      where:  { nombre: data.categoriaNombre! },
      update: {},
      create: { nombre: data.categoriaNombre! },
    })
    categoriaId = cat.id
  }

  // Verificar si el código de barras ya existe
  if (data.codigoBarra) {
    const existente = await prisma.producto.findUnique({ where: { codigo_barra: data.codigoBarra } })
    if (existente) throw new Error(`El código de barras ya está asignado a "${existente.nombre}"`)
  }

  const producto = await prisma.producto.create({
    data: {
      nombre:       data.nombre,
      categoria_id: categoriaId,
      precio_venta: data.precioVenta,
      costo:        data.costo,
      codigo_barra: data.codigoBarra || null,
    },
    include: { categoria: { select: { nombre: true } } },
  })

  // Crear inventario en bodega central
  const BODEGA_PDV_ID = await resolverBodegaId()
  const inv = await prisma.inventario.create({
    data: {
      pdv_id:       BODEGA_PDV_ID,
      producto_id:  producto.id,
      stock_actual: data.stockActual,
      stock_critico: data.stockCritico,
    },
  })

  return {
    inventarioId: inv.id,
    productoId:   producto.id,
    nombre:       producto.nombre,
    categoria:    producto.categoria.nombre,
    codigoBarra:  producto.codigo_barra,
    precioVenta:  producto.precio_venta,
    stockActual:  inv.stock_actual,
    stockCritico: inv.stock_critico,
  }
}

/**
 * Guarda por lote los ingresos/utilizadas escritos en la tabla de inventario.
 * Por cada ítem con cambios calcula el saldo nuevo = saldo anterior + ingresos − utilizadas,
 * actualiza el stock y registra una entrada en el historial (con snapshot de quién/cuándo).
 */
export async function guardarLoteInventario(
  data: GuardarLoteInput,
  usuario: { id: number; nombre: string },
) {
  const BODEGA_PDV_ID = await resolverBodegaId()

  // Solo procesamos ítems con algún cambio real.
  const cambios = data.items.filter(
    (i) => (i.ingresos ?? 0) > 0 || (i.utilizadas ?? 0) > 0 || (i.nombre && i.nombre.trim()),
  )
  if (cambios.length === 0) throw new Error('No hay cambios para guardar')

  // Cargar inventarios involucrados y validar que sean de la bodega central.
  const ids = cambios.map((c) => c.inventarioId)
  const inventarios = await prisma.inventario.findMany({
    where:   { id: { in: ids } },
    include: { producto: { select: { id: true, nombre: true } } },
  })
  const porId = new Map(inventarios.map((inv) => [inv.id, inv]))

  for (const c of cambios) {
    const inv = porId.get(c.inventarioId)
    if (!inv) throw new Error(`Ítem de inventario #${c.inventarioId} no encontrado`)
    if (inv.pdv_id !== BODEGA_PDV_ID) throw new Error('Solo se puede editar stock de la bodega central')
    const saldoNuevo = inv.stock_actual + (c.ingresos ?? 0) - (c.utilizadas ?? 0)
    if (saldoNuevo < 0) {
      throw new Error(`El stock de "${inv.producto.nombre}" no puede quedar negativo (saldo resultante ${saldoNuevo})`)
    }
  }

  // Un id de lote por cada guardado: agrupa todos los ítems de este "Guardar".
  const loteId = crypto.randomUUID()
  const fechaLote = new Date()

  // Aplicar todo en una transacción: actualizar stock/nombre + registrar historial.
  await prisma.$transaction(async (tx) => {
    for (const c of cambios) {
      const inv = porId.get(c.inventarioId)!
      const ingresos   = c.ingresos ?? 0
      const utilizadas = c.utilizadas ?? 0
      const saldoAnterior = inv.stock_actual
      const saldoNuevo    = saldoAnterior + ingresos - utilizadas
      const nombreNuevo   = c.nombre?.trim()

      if (nombreNuevo && nombreNuevo !== inv.producto.nombre) {
        await tx.producto.update({ where: { id: inv.producto_id }, data: { nombre: nombreNuevo } })
      }
      if (ingresos !== 0 || utilizadas !== 0) {
        await tx.inventario.update({ where: { id: inv.id }, data: { stock_actual: saldoNuevo } })
      }

      await tx.historialInventario.create({
        data: {
          lote_id:        loteId,
          inventario_id:  inv.id,
          producto_id:    inv.producto_id,
          nombre:         nombreNuevo || inv.producto.nombre,
          saldo_anterior: saldoAnterior,
          ingresos,
          utilizadas,
          saldo_nuevo:    saldoNuevo,
          usuario_id:     usuario.id,
          usuario_nombre: usuario.nombre,
          creado_en:      fechaLote, // mismo timestamp para todo el lote
        },
      })
    }
  })

  return { guardados: cambios.length }
}

/**
 * Historial de ingresos/ajustes de bodega, filtrable por rango de fechas (Chile),
 * AGRUPADO por lote de guardado: cada grupo = un "Guardar" con sus ítems.
 */
export async function getHistorialInventario(desde?: string, hasta?: string) {
  const where: { creado_en?: { gte?: Date; lte?: Date } } = {}
  if (desde || hasta) {
    where.creado_en = {}
    if (desde) where.creado_en.gte = rangoFechaChile(desde).inicio
    if (hasta) where.creado_en.lte = rangoFechaChile(hasta).fin
  }

  const filas = await prisma.historialInventario.findMany({
    where,
    orderBy: { creado_en: 'desc' },
    take: 2000,
  })

  // Agrupar por lote_id (los registros antiguos sin lote forman grupos individuales).
  const grupos = new Map<string, typeof filas>()
  for (const f of filas) {
    const clave = f.lote_id ?? `solo-${f.id}`
    const arr = grupos.get(clave) ?? []
    arr.push(f)
    grupos.set(clave, arr)
  }

  return [...grupos.entries()].map(([loteId, items]) => {
    const primero = items[0]
    return {
      loteId,
      fecha:          primero.creado_en.toISOString(),
      usuario:        primero.usuario_nombre ?? 'Sistema',
      cantidad:       items.length,
      totalIngresos:  items.reduce((s, i) => s + i.ingresos, 0),
      totalUtilizadas: items.reduce((s, i) => s + i.utilizadas, 0),
      items: items.map((f) => ({
        id:            f.id,
        nombre:        f.nombre,
        saldoAnterior: f.saldo_anterior,
        ingresos:      f.ingresos,
        utilizadas:    f.utilizadas,
        saldoNuevo:    f.saldo_nuevo,
      })),
    }
  }).sort((a, b) => b.fecha.localeCompare(a.fecha)) // más reciente primero
}

/**
 * Historial de despachos AGRUPADO por evento (lote_id): cada grupo = un envío con
 * todos sus productos. Los movimientos antiguos sin lote forman grupos individuales.
 */
export async function getDespachos(pdvId?: number) {
  const movimientos = await prisma.movimientoInv.findMany({
    where: {
      tipo: 'TRASPASO',
      ...(pdvId ? { OR: [{ pdv_origen_id: pdvId }, { pdv_destino_id: pdvId }] } : {}),
    },
    include: {
      producto: { select: { nombre: true } },
      pdv_origen:  { select: { nombre: true } },
      pdv_destino: { select: { nombre: true } },
    },
    orderBy: { fecha: 'desc' },
    take: 1000,
  })

  // Agrupar por lote_id (los antiguos sin lote se agrupan por su propio id).
  const grupos = new Map<string, typeof movimientos>()
  for (const m of movimientos) {
    const clave = m.lote_id ?? `solo-${m.id}`
    const arr = grupos.get(clave) ?? []
    arr.push(m)
    grupos.set(clave, arr)
  }

  return [...grupos.entries()].map(([loteId, items]) => {
    const primero = items[0]
    return {
      loteId,
      fecha:        primero.fecha.toISOString(),
      origen:       primero.pdv_origen?.nombre  ?? 'Bodega Central',
      destino:      primero.pdv_destino?.nombre ?? '—',
      cantidadItems: items.length,
      totalUnidades: items.reduce((s, m) => s + m.cantidad, 0),
      items: items.map((m) => ({
        id:       m.id,
        producto: m.producto.nombre,
        cantidad: m.cantidad,
      })),
    }
  }).sort((a, b) => b.fecha.localeCompare(a.fecha))
}
