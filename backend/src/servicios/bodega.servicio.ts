import prisma from '../config/prisma'
import type { DespachoInput, AjustarStockInput, CrearInventarioInput, CrearProductoInput } from '../validaciones/bodega.schema'

const BODEGA_PDV_ID = 1

export async function getStockBodega() {
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
          producto_id:    item.productoId,
          pdv_origen_id:  BODEGA_PDV_ID,
          pdv_destino_id: data.pdvDestinoId,
          tipo:           'TRASPASO',
          cantidad:       item.cantidad,
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
    take: 100,
  })

  return movimientos.map((m) => ({
    id:          m.id,
    producto:    m.producto.nombre,
    origen:      m.pdv_origen?.nombre  ?? 'Bodega Central',
    destino:     m.pdv_destino?.nombre ?? '—',
    cantidad:    m.cantidad,
    fecha:       m.fecha.toISOString(),
  }))
}
