import type { Prisma } from '@prisma/client'
import prisma from '../config/prisma'
import { ErrorApp, noEncontrado, conflicto } from '../lib/errores'
import type { DespachoInput, AjustarStockInput, MermaInput, CrearInventarioInput, CrearProductoInput, GuardarLoteInput } from '../validaciones/bodega.schema'
import type { DespacharSolicitudInput } from '../validaciones/solicitudes.schema'
import { rangoFechaChile } from '../lib/tiempoChile'

// El ID de la Bodega Central se resuelve por tipo (BODEGA), no se asume que sea 1.
// Esto evita que un re-seed o migración con IDs distintos rompa silenciosamente
// toda la lógica de despacho. Se cachea tras la primera resolución.
let bodegaPdvIdCache: number | null = null

export async function resolverBodegaId(): Promise<number> {
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
    costo:        i.producto.costo,
    stockActual:  i.stock_actual,
    stockCritico: i.stock_critico,
  }))
}

/**
 * Reporte de margen por producto (C7/A42): cruza `costo` y `precio_venta` —
 * ambos campos existían en el modelo pero ningún reporte los combinaba (costo
 * era de solo-escritura al crear el producto). Solo productos vendibles
 * (precio_venta > 0); las mezclas son materia prima y quedan fuera.
 * margenPct = margen sobre el precio de venta (convención retail).
 */
export async function getMargenes() {
  const productos = await prisma.producto.findMany({
    where:   { precio_venta: { gt: 0 } },
    include: { categoria: { select: { nombre: true } } },
    orderBy: [{ categoria: { nombre: 'asc' } }, { nombre: 'asc' }],
  })

  return productos.map((p) => {
    const margen = p.precio_venta - p.costo
    return {
      productoId:  p.id,
      nombre:      p.nombre,
      categoria:   p.categoria.nombre,
      costo:       p.costo,
      precioVenta: p.precio_venta,
      margen,
      // Sin costo cargado el % engaña (100%): el frontend lo marca "sin costo".
      margenPct:   p.costo > 0 ? Math.round((margen / p.precio_venta) * 100) : null,
    }
  })
}

// El precio de venta se puede editar en toda categoría vendible. Solo las
// materias primas (Mezclas) quedan fuera: no se venden, se cocinan en paquetes.
// Denylist en vez de allowlist para no tener que registrar cada categoría nueva
// (Promos, Helados, etc. quedaban sin input de precio con el allowlist anterior).
// Comparación tolerante a mayúsculas/acentos (ver normalizarCategoria).
const CATEGORIAS_SIN_PRECIO = new Set(['mezclas'])
const normalizarCategoria = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export async function ajustarStock(
  inventarioId: number,
  data: AjustarStockInput,
  usuario: { id: number; nombre: string; rol: string },
) {
  const BODEGA_PDV_ID = await resolverBodegaId()
  const inv = await prisma.inventario.findUnique({
    where:   { id: inventarioId },
    include: { producto: { include: { categoria: { select: { nombre: true } } } } },
  })
  if (!inv) throw noEncontrado('Ítem de inventario')
  if (inv.pdv_id !== BODEGA_PDV_ID) {
    throw new ErrorApp('Solo se puede ajustar stock de la bodega central desde aquí', 403)
  }

  // Cambio de precio: solo ADMIN y en cualquier categoría vendible (todas menos Mezclas).
  if (data.precioVenta !== undefined) {
    if (usuario.rol !== 'ADMIN') {
      throw new ErrorApp('Solo el administrador puede modificar el precio', 403)
    }
    if (CATEGORIAS_SIN_PRECIO.has(normalizarCategoria(inv.producto.categoria.nombre))) {
      throw new ErrorApp('Las mezclas son materia prima y no tienen precio de venta', 400)
    }
  }

  // Cambio de costo: solo ADMIN, cualquier categoría (C7/A42 — antes el costo
  // solo se capturaba al crear el producto y quedaba desactualizado para siempre).
  if (data.costo !== undefined && usuario.rol !== 'ADMIN') {
    throw new ErrorApp('Solo el administrador puede modificar el costo', 403)
  }

  const nombreNuevo   = data.nombre?.trim()
  const saldoAnterior = inv.stock_actual
  const saldoNuevo    = data.stockActual
  const delta         = saldoNuevo - saldoAnterior

  // Ajuste + historial en una transacción: un cambio manual de stock (corrección
  // o merma) debe dejar rastro de quién/cuándo/cuánto en HistorialInventario,
  // igual que "Guardar" por lote — antes era invisible en la pestaña Historial (C5).
  const actualizado = await prisma.$transaction(async (tx) => {
    const datosProducto: { nombre?: string; precio_venta?: number; costo?: number } = {}
    if (nombreNuevo) datosProducto.nombre = nombreNuevo
    if (data.precioVenta !== undefined) datosProducto.precio_venta = data.precioVenta
    if (data.costo !== undefined) datosProducto.costo = data.costo
    if (Object.keys(datosProducto).length > 0) {
      await tx.producto.update({ where: { id: inv.producto_id }, data: datosProducto })
    }

    const upd = await tx.inventario.update({
      where: { id: inventarioId },
      data: {
        stock_actual:  saldoNuevo,
        stock_critico: data.stockCritico,
      },
      include: { producto: { select: { nombre: true, precio_venta: true } } },
    })

    // Solo se registra si el stock cambió (un cambio de solo nombre/precio no es
    // un movimiento de inventario).
    if (delta !== 0) {
      await tx.historialInventario.create({
        data: {
          lote_id:        crypto.randomUUID(),
          inventario_id:  inv.id,
          producto_id:    inv.producto_id,
          nombre:         nombreNuevo || inv.producto.nombre,
          saldo_anterior: saldoAnterior,
          ingresos:       delta > 0 ? delta : 0,
          utilizadas:     delta < 0 ? -delta : 0,
          saldo_nuevo:    saldoNuevo,
          usuario_id:     usuario.id,
          usuario_nombre: usuario.nombre,
        },
      })
    }

    return upd
  })

  return {
    inventarioId: actualizado.id,
    nombre:       actualizado.producto.nombre,
    precioVenta:  actualizado.producto.precio_venta,
    stockActual:  actualizado.stock_actual,
    stockCritico: actualizado.stock_critico,
  }
}

/**
 * Merma explícita de bodega (C6/A40): baja de stock con causa propia, en vez de
 * esconderla en un ajuste genérico. Deja doble rastro en la misma transacción:
 * MovimientoInv tipo MERMA (el enum existía sin ningún uso) + HistorialInventario
 * (visible en la pestaña Historial; el motivo viaja en el snapshot del nombre,
 * ya que ni MovimientoInv ni HistorialInventario tienen columna de motivo y
 * agregar una exigiría migración).
 */
export async function registrarMerma(
  inventarioId: number,
  data: MermaInput,
  usuario: { id: number; nombre: string },
) {
  const BODEGA_PDV_ID = await resolverBodegaId()
  const inv = await prisma.inventario.findUnique({
    where:   { id: inventarioId },
    include: { producto: { select: { id: true, nombre: true } } },
  })
  if (!inv) throw noEncontrado('Ítem de inventario')
  if (inv.pdv_id !== BODEGA_PDV_ID) {
    throw new ErrorApp('Solo se puede registrar merma de la bodega central desde aquí', 403)
  }

  const saldoAnterior = inv.stock_actual
  const saldoNuevo    = saldoAnterior - data.cantidad
  if (saldoNuevo < 0) {
    throw new ErrorApp(
      `La merma (${data.cantidad}) supera el stock actual de "${inv.producto.nombre}" (${saldoAnterior})`,
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.inventario.update({
      where: { id: inventarioId },
      data:  { stock_actual: saldoNuevo },
    })
    await tx.movimientoInv.create({
      data: {
        producto_id:   inv.producto_id,
        pdv_origen_id: BODEGA_PDV_ID,
        tipo:          'MERMA',
        cantidad:      data.cantidad,
      },
    })
    await tx.historialInventario.create({
      data: {
        lote_id:        crypto.randomUUID(),
        inventario_id:  inv.id,
        producto_id:    inv.producto_id,
        nombre:         `${inv.producto.nombre} — MERMA: ${data.motivo}`,
        saldo_anterior: saldoAnterior,
        ingresos:       0,
        utilizadas:     data.cantidad,
        saldo_nuevo:    saldoNuevo,
        usuario_id:     usuario.id,
        usuario_nombre: usuario.nombre,
      },
    })
  })

  return {
    inventarioId,
    nombre:      inv.producto.nombre,
    stockActual: saldoNuevo,
    merma:       data.cantidad,
    motivo:      data.motivo,
  }
}

/**
 * Núcleo del movimiento de stock de un despacho, dentro de una transacción ya
 * abierta. Descuenta bodega (con guarda gte anti-negativo), suma al PDV destino,
 * registra el MovimientoInv TRASPASO y crea el encabezado de Despacho. Reutilizado
 * por `registrarDespacho` (ad-hoc, solicitudId null) y por el despacho de una
 * solicitud (A15, solicitudId set). Devuelve loteId y total de unidades.
 */
async function ejecutarDespachoEnTx(
  tx: Prisma.TransactionClient,
  args: {
    bodegaId:     number
    pdvDestinoId: number
    items:        { productoId: number; cantidad: number }[]
    usuario:      { id: number; nombre: string }
    observacion?: string | null
    solicitudId?: number | null
    nombrePorId:  Map<number, string>
    // Si es false, el stock sale de bodega pero NO se acredita al PDV todavía:
    // queda "en camino" hasta que el vendedor confirme la recepción (entonces se
    // llama `acreditarDespachoEnPDV`). El MovimientoInv y el descuento de bodega
    // sí ocurren ahora. Por defecto true (despacho ad-hoc: acredita al instante).
    creditarPDV?: boolean
  },
): Promise<{ loteId: string; totalUnidades: number }> {
  const creditarPDV = args.creditarPDV ?? true
  const loteId = crypto.randomUUID()
  const fechaLote = new Date()
  const totalUnidades = args.items.reduce((s, i) => s + i.cantidad, 0)

  for (const item of args.items) {
    const nombre = args.nombrePorId.get(item.productoId) ?? `#${item.productoId}`

    // Descuento condicional: solo si hay stock suficiente EN ESTE MOMENTO. La
    // verificación va dentro de la tx para que dos despachos simultáneos del
    // mismo producto no dejen stock negativo.
    const descontado = await tx.inventario.updateMany({
      where: { pdv_id: args.bodegaId, producto_id: item.productoId, stock_actual: { gte: item.cantidad } },
      data:  { stock_actual: { decrement: item.cantidad } },
    })
    if (descontado.count === 0) {
      const invBodega = await tx.inventario.findUnique({
        where: { pdv_id_producto_id: { pdv_id: args.bodegaId, producto_id: item.productoId } },
      })
      if (!invBodega) throw new ErrorApp(`Sin stock en bodega: ${nombre}`, 409)
      throw new ErrorApp(
        `Stock insuficiente en bodega para ${nombre}: disponible ${invBodega.stock_actual}, solicitado ${item.cantidad}`,
        409,
      )
    }

    // Sumar en PDV destino (upsert por si no existe aún). Solo si el despacho
    // acredita al instante; si es diferido, se acredita al confirmar la recepción.
    if (creditarPDV) {
      await tx.inventario.upsert({
        where:  { pdv_id_producto_id: { pdv_id: args.pdvDestinoId, producto_id: item.productoId } },
        update: { stock_actual: { increment: item.cantidad } },
        create: { pdv_id: args.pdvDestinoId, producto_id: item.productoId, stock_actual: item.cantidad, stock_critico: 0 },
      })
    }

    await tx.movimientoInv.create({
      data: {
        lote_id: loteId, producto_id: item.productoId, pdv_origen_id: args.bodegaId,
        pdv_destino_id: args.pdvDestinoId, tipo: 'TRASPASO', cantidad: item.cantidad, fecha: fechaLote,
      },
    })
  }

  // Encabezado del despacho. Si el despacho acredita al instante, el stock ya
  // quedó en el PDV; si es diferido, el PDV se acredita al confirmar la recepción.
  // solicitud_id vincula al pedido que lo originó.
  await tx.despacho.create({
    data: {
      lote_id:              loteId,
      pdv_destino_id:       args.pdvDestinoId,
      usuario_envia_id:     args.usuario.id,
      usuario_envia_nombre: args.usuario.nombre,
      observacion:          args.observacion ?? null,
      estado:               'ENVIADO',
      cantidad_items:       args.items.length,
      total_unidades:       totalUnidades,
      creado_en:            fechaLote,
      solicitud_id:         args.solicitudId ?? null,
    },
  })

  return { loteId, totalUnidades }
}

export async function registrarDespacho(data: DespachoInput, usuario: { id: number; nombre: string }) {
  const BODEGA_PDV_ID = await resolverBodegaId()
  const pdvDestino = await prisma.pDV.findUnique({ where: { id: data.pdvDestinoId } })
  if (!pdvDestino) throw noEncontrado('PDV destino')
  if (pdvDestino.tipo !== 'PUNTO_VENTA') throw new ErrorApp('El destino debe ser un punto de venta')

  const productos = await prisma.producto.findMany({
    where:  { id: { in: data.items.map((i) => i.productoId) } },
    select: { id: true, nombre: true },
  })
  const nombrePorId = new Map(productos.map((p) => [p.id, p.nombre]))

  const { loteId, totalUnidades } = await prisma.$transaction((tx) =>
    ejecutarDespachoEnTx(tx, {
      bodegaId: BODEGA_PDV_ID, pdvDestinoId: data.pdvDestinoId, items: data.items,
      usuario, observacion: data.observacion, solicitudId: null, nombrePorId,
    }),
  )

  await notificarDespachoAlVendedor(data.pdvDestinoId, pdvDestino.nombre, totalUnidades)

  return {
    mensaje:     'Despacho registrado',
    destino:     pdvDestino.nombre,
    items:       data.items.length,
    loteId,
    observacion: data.observacion ?? null,
  }
}

/**
 * Despacha una SOLICITUD de insumos moviendo stock real (A15, fusión Solicitud↔
 * Despacho). El bodeguero ajusta las cantidades (puede despachar menos o nada de
 * un producto sin stock). En una transacción: mueve stock bodega→PDV, crea el
 * despacho enlazado (`solicitud_id`) y marca la solicitud DESPACHADA. Antes el
 * "despachar" de una solicitud solo cambiaba el estado sin mover inventario, así
 * que el PDV nunca recibía el stock y la bodega no se descontaba.
 */
export async function despacharSolicitudConStock(
  solicitudId: number,
  data: DespacharSolicitudInput,
  usuario: { id: number; nombre: string },
) {
  const BODEGA_PDV_ID = await resolverBodegaId()
  const solicitud = await prisma.solicitud.findUnique({
    where:   { id: solicitudId },
    include: {
      pdv:   { select: { id: true, nombre: true, tipo: true } },
      items: { select: { producto_id: true, cantidad: true } },
    },
  })
  if (!solicitud) throw noEncontrado('Solicitud')
  if (solicitud.estado !== 'PENDIENTE') throw conflicto('Solo se pueden despachar solicitudes pendientes')
  if (solicitud.pdv.tipo !== 'PUNTO_VENTA') throw new ErrorApp('El destino debe ser un punto de venta')

  // Solo se despachan los ítems con cantidad > 0 (el bodeguero puede poner 0 en
  // un producto que no tiene). Enviar MÁS de lo pedido sí se permite (bodega
  // suele redondear a caja completa); lo que no se permite es colar productos
  // que no estaban en el pedido — para eso existe el despacho ad-hoc.
  const pedidos = new Set(solicitud.items.map((i) => i.producto_id))
  const ajenos  = data.items.filter((i) => !pedidos.has(i.productoId))
  if (ajenos.length > 0) {
    throw new ErrorApp(
      `Estos productos no están en la solicitud #${solicitudId}: ${ajenos.map((i) => `#${i.productoId}`).join(', ')}`,
    )
  }

  const items = data.items.filter((i) => i.cantidad > 0)
  if (items.length === 0) throw new ErrorApp('Debes despachar al menos un producto (cantidad > 0)')

  const productos = await prisma.producto.findMany({
    where:  { id: { in: items.map((i) => i.productoId) } },
    select: { id: true, nombre: true },
  })
  const nombrePorId = new Map(productos.map((p) => [p.id, p.nombre]))

  // La nota del bodeguero se guarda limpia en la observación del despacho (el
  // vínculo con la solicitud ya es solicitud_id) y viaja en la notificación al
  // vendedor, para que sepa por qué recibió menos de lo pedido.
  const notas = data.notas?.trim() || null
  // ¿Se despachó menos de lo pedido en algún producto? (para avisar al vendedor)
  const pedidoPorId = new Map(solicitud.items.map((it) => [it.producto_id, it.cantidad]))
  const esParcial = items.some((i) => i.cantidad < (pedidoPorId.get(i.productoId) ?? 0))

  const { totalUnidades } = await prisma.$transaction(async (tx) => {
    const res = await ejecutarDespachoEnTx(tx, {
      bodegaId: BODEGA_PDV_ID, pdvDestinoId: solicitud.pdv.id, items, usuario,
      observacion: notas,
      solicitudId, nombrePorId,
      // Diferido: el stock sale de bodega pero NO entra al PDV hasta que el
      // vendedor confirme la recepción (así el turno/inventario del PDV nunca
      // refleja stock que el vendedor no verificó físicamente).
      creditarPDV: false,
    })
    await tx.solicitud.update({ where: { id: solicitudId }, data: { estado: 'DESPACHADA' } })
    return res
  })

  await notificarDespachoAlVendedor(solicitud.pdv.id, solicitud.pdv.nombre, totalUnidades, { nota: notas, parcial: esParcial, diferido: true })

  return { mensaje: 'Solicitud despachada — pendiente de que el vendedor confirme la recepción', destino: solicitud.pdv.nombre, items: items.length }
}

/**
 * Regulariza una "entrega fantasma": solicitud marcada DESPACHADA/CONFIRMADA que
 * NO tiene despacho enlazado, o sea que nunca movió stock. Ocurre con los pedidos
 * cerrados antes de la fusión A15 (el "despachar" de entonces solo cambiaba el
 * estado): el vendedor cree que recibió los insumos y su PDV quedó en cero.
 * Mueve el stock ahora y crea el despacho enlazado, dejando rastro en la
 * observación. Si la solicitud ya estaba CONFIRMADA, el despacho nace CONFIRMADO
 * (el acuse del vendedor ya existía).
 */
export async function regularizarSolicitudSinDespacho(
  solicitudId: number,
  data: DespacharSolicitudInput,
  usuario: { id: number; nombre: string },
) {
  const BODEGA_PDV_ID = await resolverBodegaId()
  const solicitud = await prisma.solicitud.findUnique({
    where:   { id: solicitudId },
    include: {
      pdv:       { select: { id: true, nombre: true, tipo: true } },
      items:     { select: { producto_id: true } },
      despachos: { select: { id: true } },
    },
  })
  if (!solicitud) throw noEncontrado('Solicitud')
  if (solicitud.estado !== 'DESPACHADA' && solicitud.estado !== 'CONFIRMADA') {
    throw conflicto('Solo se regularizan solicitudes ya marcadas como despachadas o confirmadas; una pendiente se despacha normalmente')
  }
  // Guarda contra el doble conteo: si ya hay despacho enlazado, el stock ya se movió.
  if (solicitud.despachos.length > 0) {
    throw conflicto('Esta solicitud ya tiene un despacho con movimiento de stock — regularizarla duplicaría el inventario')
  }
  if (solicitud.pdv.tipo !== 'PUNTO_VENTA') throw new ErrorApp('El destino debe ser un punto de venta')

  const pedidos = new Set(solicitud.items.map((i) => i.producto_id))
  const ajenos  = data.items.filter((i) => !pedidos.has(i.productoId))
  if (ajenos.length > 0) {
    throw new ErrorApp(
      `Estos productos no están en la solicitud #${solicitudId}: ${ajenos.map((i) => `#${i.productoId}`).join(', ')}`,
    )
  }

  const items = data.items.filter((i) => i.cantidad > 0)
  if (items.length === 0) throw new ErrorApp('Debes regularizar al menos un producto (cantidad > 0)')

  const productos = await prisma.producto.findMany({
    where:  { id: { in: items.map((i) => i.productoId) } },
    select: { id: true, nombre: true },
  })
  const nombrePorId = new Map(productos.map((p) => [p.id, p.nombre]))

  const notas = data.notas?.trim()
  const yaConfirmada = solicitud.estado === 'CONFIRMADA'

  const { totalUnidades } = await prisma.$transaction(async (tx) => {
    const res = await ejecutarDespachoEnTx(tx, {
      bodegaId: BODEGA_PDV_ID, pdvDestinoId: solicitud.pdv.id, items, usuario,
      observacion: `Regularización de solicitud #${solicitud.id} (entrega registrada sin movimiento de stock)` +
                   `${notas ? ` — ${notas}` : ''}`,
      solicitudId, nombrePorId,
    })
    if (yaConfirmada) {
      await tx.despacho.update({
        where: { lote_id: res.loteId },
        data:  {
          estado:                'CONFIRMADO',
          confirmado_por_id:     usuario.id,
          confirmado_por_nombre: usuario.nombre,
          confirmado_en:         new Date(),
        },
      })
    }
    return res
  })

  if (!yaConfirmada) {
    await notificarDespachoAlVendedor(solicitud.pdv.id, solicitud.pdv.nombre, totalUnidades, { nota: notas || null })
  }

  return {
    mensaje: 'Solicitud regularizada — el stock entró al punto de venta',
    destino: solicitud.pdv.nombre,
    items:   items.length,
  }
}

/**
 * Crea una notificación de "despacho recibido" para el/los vendedor(es) del PDV:
 * el que tiene turno abierto ahora y los asignados a ese punto de venta.
 * `opts.nota` (nota del bodeguero) y `opts.parcial` (envió menos de lo pedido)
 * se incluyen en el mensaje para que el vendedor sepa por qué recibió lo que recibió.
 */
async function notificarDespachoAlVendedor(
  pdvId: number,
  pdvNombre: string,
  totalUnidades: number,
  opts: { nota?: string | null; parcial?: boolean; diferido?: boolean } = {},
) {
  const ids = new Set<number>()
  const turno = await prisma.turnoCaja.findFirst({
    where:  { pdv_id: pdvId, estado: 'ABIERTO' },
    select: { usuario_id: true },
  })
  if (turno?.usuario_id) ids.add(turno.usuario_id)

  const asignados = await prisma.usuario.findMany({
    where:  { pdv_id: pdvId, activo: true, es_demo: false },
    select: { id: true },
  })
  for (const u of asignados) ids.add(u.id)

  if (ids.size === 0) return

  const mensaje =
    `Te enviaron un despacho a ${pdvNombre} (${totalUnidades} unidades)` +
    `${opts.parcial ? ' — despacho parcial: te enviaron menos de lo pedido' : ''}. ` +
    `${opts.nota ? `Nota del bodeguero: "${opts.nota}". ` : ''}` +
    `${opts.diferido
      ? 'Revisa que esté todo y confírmalo en Solicitudes para sumarlo a tu stock.'
      : 'Ya está sumado a tu stock — confirma si todo está bien.'}`

  await prisma.notificacion.createMany({
    // pdv_id: el aviso pertenece a la sucursal destino — solo se ve en la sesión
    // de ese PDV (un vendedor con turnos en dos PDV no ve aquí el del otro).
    data: [...ids].map((usuario_id) => ({
      usuario_id,
      pdv_id:  pdvId,
      titulo:  'Te llegó tu despacho',
      mensaje,
    })),
  })
}

/**
 * Acredita en el inventario del PDV el stock de un despacho DIFERIDO (que salió
 * de bodega pero aún no había entrado al punto de venta). Se llama al confirmar
 * la recepción — recién ahí el stock cuenta para el turno/cierre del vendedor.
 * Lee las cantidades del lote desde MovimientoInv (registrado al despachar).
 */
export async function acreditarDespachoEnPDV(
  tx: Prisma.TransactionClient,
  loteId: string,
  pdvDestinoId: number,
) {
  const movs = await tx.movimientoInv.findMany({
    where:  { lote_id: loteId },
    select: { producto_id: true, cantidad: true },
  })
  for (const m of movs) {
    await tx.inventario.upsert({
      where:  { pdv_id_producto_id: { pdv_id: pdvDestinoId, producto_id: m.producto_id } },
      update: { stock_actual: { increment: m.cantidad } },
      create: { pdv_id: pdvDestinoId, producto_id: m.producto_id, stock_actual: m.cantidad, stock_critico: 0 },
    })
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
  if (existe) throw new ErrorApp('Este producto ya está en el inventario de la bodega', 409)

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
  const inv = await prisma.inventario.findUnique({ where: { id: inventarioId } })
  if (!inv) throw noEncontrado('Ítem de inventario')
  if (inv.pdv_id !== BODEGA_PDV_ID) throw new ErrorApp('Solo se puede eliminar stock de la bodega central', 403)
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
    if (existente) throw new ErrorApp(`El código de barras ya está asignado a "${existente.nombre}"`, 409)
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
  if (cambios.length === 0) throw new ErrorApp('No hay cambios para guardar')

  // Cargar inventarios involucrados y validar que sean de la bodega central.
  const ids = cambios.map((c) => c.inventarioId)
  const inventarios = await prisma.inventario.findMany({
    where:   { id: { in: ids } },
    include: { producto: { select: { id: true, nombre: true } } },
  })
  const porId = new Map(inventarios.map((inv) => [inv.id, inv]))

  for (const c of cambios) {
    const inv = porId.get(c.inventarioId)
    if (!inv) throw new ErrorApp(`Ítem de inventario #${c.inventarioId} no encontrado`, 404)
    if (inv.pdv_id !== BODEGA_PDV_ID) throw new ErrorApp('Solo se puede editar stock de la bodega central', 403)
    const saldoNuevo = inv.stock_actual + (c.ingresos ?? 0) - (c.utilizadas ?? 0)
    if (saldoNuevo < 0) {
      throw new ErrorApp(`El stock de "${inv.producto.nombre}" no puede quedar negativo (saldo resultante ${saldoNuevo})`)
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

  // Estado de confirmación por lote (encabezados de despacho).
  const loteIds = [...grupos.keys()].filter((k) => !k.startsWith('solo-'))
  const headers = await prisma.despacho.findMany({ where: { lote_id: { in: loteIds } } })
  const headerPorLote = new Map(headers.map((h) => [h.lote_id, h]))

  return [...grupos.entries()].map(([loteId, items]) => {
    const primero = items[0]
    const header = headerPorLote.get(loteId)
    return {
      loteId,
      fecha:        primero.fecha.toISOString(),
      origen:       primero.pdv_origen?.nombre  ?? 'Bodega Central',
      destino:      primero.pdv_destino?.nombre ?? '—',
      cantidadItems: items.length,
      totalUnidades: items.reduce((s, m) => s + m.cantidad, 0),
      estado:        header?.estado ?? null,
      confirmadoPor: header?.confirmado_por_nombre ?? null,
      confirmadoEn:  header?.confirmado_en?.toISOString() ?? null,
      items: items.map((m) => ({
        id:       m.id,
        producto: m.producto.nombre,
        cantidad: m.cantidad,
      })),
    }
  }).sort((a, b) => b.fecha.localeCompare(a.fecha))
}

/**
 * Despachos ENVIADOS (aún sin confirmar) hacia un PDV — para que el vendedor
 * confirme la recepción. Incluye el detalle de productos de cada despacho.
 *
 * Incluye TAMBIÉN los despachos originados por una solicitud (`solicitudId` no
 * null). Antes se excluían para no mostrar el mismo envío dos veces, pero el
 * resultado era peor: el único acceso a la confirmación quedaba escondido dentro
 * de la tarjeta colapsada de Solicitudes, y como el stock de un despacho ligado
 * se acredita RECIÉN al confirmar (despacho diferido, ver `acreditarDespachoEnPDV`),
 * el vendedor se quedaba con el inventario en 0 sin saber por qué.
 *
 * Quien consuma esto debe confirmar por el camino correcto según `solicitudId`:
 * con solicitud → PATCH /solicitudes/:id/confirmar (acredita el stock);
 * sin solicitud → PATCH /bodega/despachos/:loteId/confirmar (el stock ya entró).
 */
export async function getDespachosPendientes(pdvId: number) {
  const headers = await prisma.despacho.findMany({
    where:   { pdv_destino_id: pdvId, estado: 'ENVIADO' },
    orderBy: { creado_en: 'desc' },
    take:    50,
  })
  if (headers.length === 0) return []

  const movimientos = await prisma.movimientoInv.findMany({
    where:   { lote_id: { in: headers.map((h) => h.lote_id) } },
    include: { producto: { select: { nombre: true } } },
  })
  const itemsPorLote = new Map<string, { productoId: number; producto: string; cantidad: number }[]>()
  for (const m of movimientos) {
    if (!m.lote_id) continue
    const arr = itemsPorLote.get(m.lote_id) ?? []
    arr.push({ productoId: m.producto_id, producto: m.producto.nombre, cantidad: m.cantidad })
    itemsPorLote.set(m.lote_id, arr)
  }

  return headers.map((h) => ({
    loteId:        h.lote_id,
    // null = despacho ad-hoc (stock ya acreditado); número = vino de esa solicitud
    // y el stock entra al PDV recién al confirmarla.
    solicitudId:   h.solicitud_id,
    fecha:         h.creado_en.toISOString(),
    enviadoPor:    h.usuario_envia_nombre,
    observacion:   h.observacion,
    cantidadItems: h.cantidad_items,
    totalUnidades: h.total_unidades,
    items:         itemsPorLote.get(h.lote_id) ?? [],
  }))
}

/**
 * El vendedor confirma la recepción de un despacho. Marca CONFIRMADO y avisa a
 * quien lo despachó (y a admin/supervisores). El stock no se toca: ya estaba
 * sumado al PDV desde el despacho.
 */
export async function confirmarDespacho(
  loteId: string,
  usuario: { id: number; nombre: string; rol: string; pdvId: number | null },
) {
  const despacho = await prisma.despacho.findUnique({ where: { lote_id: loteId } })
  if (!despacho) throw noEncontrado('Despacho')

  // Un despacho ligado a una solicitud se acusa confirmando LA SOLICITUD: ese es
  // el camino que acredita el stock en el PDV (despacho diferido). Confirmarlo
  // por aquí lo cerraría dejando la mercadería sin entrar al inventario.
  if (despacho.solicitud_id !== null) {
    throw new ErrorApp(
      `Este despacho corresponde a la solicitud #${despacho.solicitud_id}: confírmala desde Solicitudes para que el stock entre a tu punto`,
      409,
    )
  }

  const esAutorizador = usuario.rol === 'ADMIN' || usuario.rol === 'SUPERVISOR'
  if (!esAutorizador && usuario.pdvId !== despacho.pdv_destino_id) {
    throw new ErrorApp('Este despacho no es de tu punto de venta', 403)
  }
  if (despacho.estado === 'CONFIRMADO') {
    return { loteId, estado: 'CONFIRMADO' as const }
  }

  const pdv = await prisma.pDV.findUnique({ where: { id: despacho.pdv_destino_id }, select: { nombre: true } })

  await prisma.$transaction(async (tx) => {
    await tx.despacho.update({
      where: { lote_id: loteId },
      data:  {
        estado:                'CONFIRMADO',
        confirmado_por_id:     usuario.id,
        confirmado_por_nombre: usuario.nombre,
        confirmado_en:         new Date(),
      },
    })

    // Avisar al que despachó + a admin/supervisores activos.
    const destinatarios = new Set<number>()
    if (despacho.usuario_envia_id) destinatarios.add(despacho.usuario_envia_id)
    const autorizadores = await tx.usuario.findMany({
      where:  { activo: true, es_demo: false, rol: { nombre: { in: ['ADMIN', 'SUPERVISOR'] } } },
      select: { id: true },
    })
    for (const u of autorizadores) destinatarios.add(u.id)
    if (destinatarios.size > 0) {
      await tx.notificacion.createMany({
        data: [...destinatarios].map((usuario_id) => ({
          usuario_id,
          titulo:  'Despacho confirmado',
          mensaje: `${usuario.nombre} confirmó la recepción del despacho en ${pdv?.nombre ?? 'la sucursal'}.`,
        })),
      })
    }
  })

  return { loteId, estado: 'CONFIRMADO' as const }
}
