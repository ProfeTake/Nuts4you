import prisma from '../config/prisma'
import type { CrearProveedorInput, CrearFacturaInput, ActualizarEstadoFacturaInput } from '../validaciones/proveedores.schema'

const PROVEEDOR_SELECT = {
  id: true, nombre: true, rut: true, contacto: true, activo: true,
  banco: true, tipo_cuenta: true, numero_cuenta: true,
} as const

// ─── Proveedores ─────────────────────────────────────────────────────────────

export async function getProveedores() {
  return prisma.proveedor.findMany({
    orderBy: { nombre: 'asc' },
    select: PROVEEDOR_SELECT,
  })
}

export async function crearProveedor(data: CrearProveedorInput) {
  return prisma.proveedor.create({
    data: {
      nombre:        data.nombre.trim(),
      rut:           data.rut?.trim()           || null,
      contacto:      data.contacto?.trim()      || null,
      banco:         data.banco?.trim()         || null,
      tipo_cuenta:   data.tipoCuenta?.trim()    || null,
      numero_cuenta: data.numeroCuenta?.trim()  || null,
    },
    select: PROVEEDOR_SELECT,
  })
}

export async function editarProveedor(id: number, data: CrearProveedorInput) {
  return prisma.proveedor.update({
    where: { id },
    data: {
      nombre:        data.nombre.trim(),
      rut:           data.rut?.trim()           || null,
      contacto:      data.contacto?.trim()      || null,
      banco:         data.banco?.trim()         || null,
      tipo_cuenta:   data.tipoCuenta?.trim()    || null,
      numero_cuenta: data.numeroCuenta?.trim()  || null,
    },
    select: PROVEEDOR_SELECT,
  })
}

export async function toggleActivoProveedor(id: number, activo: boolean) {
  return prisma.proveedor.update({
    where: { id },
    data: { activo },
    select: PROVEEDOR_SELECT,
  })
}

export async function eliminarProveedor(id: number) {
  const conFacturas = await prisma.facturaProveedor.count({ where: { proveedor_id: id } })
  if (conFacturas > 0) {
    throw new Error(`No se puede eliminar: el proveedor tiene ${conFacturas} factura${conFacturas !== 1 ? 's' : ''} registrada${conFacturas !== 1 ? 's' : ''}`)
  }
  await prisma.proveedor.delete({ where: { id } })
  return { mensaje: 'Proveedor eliminado', id }
}

// ─── Facturas ─────────────────────────────────────────────────────────────────

function mapearFactura(f: {
  id: number
  proveedor_id: number
  numero_factura: string
  fecha: Date
  fecha_vencimiento: Date | null
  monto_total: number
  estado: string
  notas: string | null
  creado_en: Date
  proveedor: { nombre: string }
  items: { id: number; descripcion: string; cantidad: number; precio_unitario: number }[]
}) {
  return {
    id:               f.id,
    proveedorId:      f.proveedor_id,
    proveedorNombre:  f.proveedor.nombre,
    numeroFactura:    f.numero_factura,
    fecha:            f.fecha.toISOString().split('T')[0],
    fechaVencimiento: f.fecha_vencimiento ? f.fecha_vencimiento.toISOString().split('T')[0] : null,
    montoTotal:       f.monto_total,
    estado:           f.estado,
    notas:            f.notas,
    creadoEn:         f.creado_en.toISOString(),
    items: f.items.map((i) => ({
      id:             i.id,
      descripcion:    i.descripcion,
      cantidad:       i.cantidad,
      precioUnitario: i.precio_unitario,
    })),
  }
}

export async function getFacturas(filtros: { mes?: string; proveedorId?: number; estado?: string }) {
  const where: Record<string, unknown> = {}

  if (filtros.mes) {
    const [anio, mes] = filtros.mes.split('-').map(Number)
    const inicio = new Date(anio, mes - 1, 1)
    const fin    = new Date(anio, mes, 1)
    where.fecha = { gte: inicio, lt: fin }
  }

  if (filtros.proveedorId) {
    where.proveedor_id = filtros.proveedorId
  }

  if (filtros.estado) {
    where.estado = filtros.estado
  }

  const facturas = await prisma.facturaProveedor.findMany({
    where,
    include: {
      proveedor: { select: { nombre: true } },
      items:     true,
    },
    orderBy: { fecha: 'desc' },
  })

  return facturas.map(mapearFactura)
}

export async function crearFactura(data: CrearFacturaInput) {
  const proveedor = await prisma.proveedor.findUniqueOrThrow({ where: { id: data.proveedorId } })

  const factura = await prisma.facturaProveedor.create({
    data: {
      proveedor_id:      proveedor.id,
      numero_factura:    data.numeroFactura.trim(),
      fecha:             new Date(data.fecha),
      fecha_vencimiento: data.fechaVencimiento ? new Date(data.fechaVencimiento) : null,
      monto_total:       data.montoTotal,
      notas:             data.notas?.trim() || null,
      items: {
        create: data.items.map((item) => ({
          descripcion:    item.descripcion.trim(),
          cantidad:       item.cantidad,
          precio_unitario: item.precioUnitario,
        })),
      },
    },
    include: {
      proveedor: { select: { nombre: true } },
      items:     true,
    },
  })

  return mapearFactura(factura)
}

export async function actualizarEstadoFactura(id: number, data: ActualizarEstadoFacturaInput) {
  await prisma.facturaProveedor.findUniqueOrThrow({ where: { id } })

  await prisma.facturaProveedor.update({
    where: { id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { estado: data.estado as any },
  })

  return { mensaje: 'Estado actualizado', id }
}

export async function eliminarFactura(id: number) {
  await prisma.facturaProveedor.findUniqueOrThrow({ where: { id } })
  await prisma.facturaProveedor.delete({ where: { id } })
  return { mensaje: 'Factura eliminada', id }
}

export async function getResumenFacturasMes(mes: string) {
  const [anio, m] = mes.split('-').map(Number)
  const inicio = new Date(anio, m - 1, 1)
  const fin    = new Date(anio, m, 1)

  const facturas = await prisma.facturaProveedor.findMany({
    where: { fecha: { gte: inicio, lt: fin } },
    select: { monto_total: true, estado: true },
  })

  const total     = facturas.reduce((s: number, f: { monto_total: number }) => s + f.monto_total, 0)
  const pendiente = facturas.filter((f) => f.estado === 'PENDIENTE').reduce((s: number, f: { monto_total: number }) => s + f.monto_total, 0)
  const pagada    = facturas.filter((f) => f.estado === 'PAGADA').reduce((s: number, f: { monto_total: number }) => s + f.monto_total, 0)

  return {
    mes,
    totalFacturas: facturas.length,
    montoTotal:    total,
    pendiente,
    pagada,
  }
}
