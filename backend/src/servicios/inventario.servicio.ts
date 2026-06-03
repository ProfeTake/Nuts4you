import prisma from '../config/prisma'
import type { ActualizarInventarioInput } from '../validaciones/inventario.schema'

export async function getInventarioPDV(pdvId: number) {
  const items = await prisma.inventario.findMany({
    where: { pdv_id: pdvId },
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

export async function actualizarInventario(pdvId: number, data: ActualizarInventarioInput) {
  for (const item of data.items) {
    await prisma.inventario.upsert({
      where: {
        pdv_id_producto_id: { pdv_id: pdvId, producto_id: item.productoId },
      },
      update: { stock_actual: item.stockActual },
      create: {
        pdv_id:       pdvId,
        producto_id:  item.productoId,
        stock_actual: item.stockActual,
      },
    })
  }
  return { mensaje: 'Inventario actualizado', items: data.items.length }
}
