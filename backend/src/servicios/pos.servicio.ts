import { Prisma } from '@prisma/client'
import prisma from '../config/prisma'
import { noEncontrado, conflicto, accesoDenegado } from '../lib/errores'
import { fechaHoyChile, diaChileDe } from '../lib/tiempoChile'
import { confirmarPreparacionEnApertura } from './preparacion.servicio'
import {
  calcularADepositar,
  calcularDiferencia,
  calcularEsperadoCaja,
  calcularVentaEfectivo,
} from './calculos.servicio'
import type { AbrirTurnoInput, CerrarTurnoInput, RecepcionTurnoInput, RetiroInput, GastoInput } from '../validaciones/pos.schema'

/** Contexto mínimo del usuario autenticado que necesitan los servicios de POS. */
export interface UsuarioTurno {
  id:    number
  rol:   string
  pdvId: number | null
}

/**
 * Carga un turno y verifica que el usuario pueda operar sobre él:
 * ADMIN/SUPERVISOR acceden a cualquiera; el resto solo al turno que abrió
 * (dueño exacto). Antes bastaba con ser del mismo PDV, lo que filtraba
 * gastos/lecturas del turno de otro vendedor del punto (H12).
 */
async function getTurnoConAcceso(turnoId: number, usuario: UsuarioTurno) {
  const turno = await prisma.turnoCaja.findUnique({ where: { id: turnoId } })
  if (!turno) throw noEncontrado('Turno')

  const esAdmin = usuario.rol === 'ADMIN' || usuario.rol === 'SUPERVISOR'
  if (!esAdmin && turno.usuario_id !== usuario.id) {
    throw accesoDenegado('Solo puedes operar sobre tu propio turno')
  }
  return turno
}

// ─── Turno ───────────────────────────────────────────────────────────────────

export async function abrirTurno(data: AbrirTurnoInput, usuarioId: number) {
  // Verificar que el PDV no tenga ya un turno abierto
  const turnoActivo = await prisma.turnoCaja.findFirst({
    where: { pdv_id: data.pdvId, estado: 'ABIERTO' },
  })
  if (turnoActivo) {
    throw conflicto(`El PDV ya tiene un turno abierto (Turno #${turnoActivo.id})`)
  }

  // Apertura + confirmación de la preparación del día, en una sola transacción:
  // el ingreso que el admin dejó preparado para hoy se SUMA al stock del PDV
  // (stock = inicio + ingreso) y la preparación pasa a CONFIRMADA. Si no hay
  // preparación pendiente para hoy, el turno se abre igual (ingreso 0).
  const hoy = fechaHoyChile()
  const turno = await prisma.$transaction(async (tx) => {
    const creado = await tx.turnoCaja.create({
      data: {
        pdv_id:        data.pdvId,
        usuario_id:    usuarioId,
        saldo_inicial: data.saldoInicial,
        estado:        'ABIERTO',
      },
    })
    await confirmarPreparacionEnApertura(tx, data.pdvId, hoy)
    return creado
  })

  return {
    id:            turno.id,
    pdvId:         turno.pdv_id,
    usuarioId:     turno.usuario_id,
    fechaApertura: turno.fecha_apertura.toISOString(),
    saldoInicial:  turno.saldo_inicial,
    estado:        turno.estado as string,
  }
}

export async function cerrarTurno(turnoId: number, data: CerrarTurnoInput, usuarioId: number, rol: string) {
  const turno = await prisma.turnoCaja.findUnique({ where: { id: turnoId } })
  if (!turno) throw noEncontrado('Turno')

  if (turno.usuario_id !== usuarioId && rol !== 'ADMIN' && rol !== 'SUPERVISOR') {
    throw accesoDenegado('No puedes cerrar un turno que no es tuyo')
  }
  if (turno.estado === 'CERRADO') {
    throw conflicto('El turno ya está cerrado')
  }

  // ── Cuadre autoritativo del servidor ────────────────────────────────────────
  // El cliente declara los TOTALES DE VENTA (modelo stock-flow) y el efectivo que
  // contó, pero el CUADRE lo calcula el servidor con los gastos y retiros que
  // están en BD. Los retiros los registra el admin/supervisor desde el panel y no
  // siempre alcanzan a llegar al store del POS: cuando eso pasaba, el vendedor
  // declaraba un faltante fantasma del porte del retiro y quedaba persistido.
  //
  // Identidades tomadas de la planilla del cliente (ver calculos.servicio):
  //   ventaEfectivo = totalCalculado − tarjeta − transferencia
  //   esperadoCaja  = ventaEfectivo − gastos − retiros
  //   diferencia    = efectivoContado − esperadoCaja
  //
  // La CAJA CHICA (saldo de apertura) queda FUERA del cuadre por decisión del
  // negocio: el vendedor cuenta y entrega solo el efectivo de ventas, y ese fondo
  // se queda en el punto para el turno siguiente.
  const [gastosAgg, retirosAgg] = await Promise.all([
    prisma.gastoTurno.aggregate({ where: { turno_id: turnoId }, _sum: { monto: true } }),
    prisma.retiroTurno.aggregate({ where: { turno_id: turnoId }, _sum: { monto: true } }),
  ])
  const gastosBD  = gastosAgg._sum.monto ?? 0
  const retirosBD = retirosAgg._sum.monto ?? 0

  const ventaEfectivo = calcularVentaEfectivo(
    data.totalCalculado, data.ventaTarjeta, data.ventaTransferencia,
  )
  const esperadoCaja  = calcularEsperadoCaja(ventaEfectivo, gastosBD, retirosBD)
  const diferencia    = calcularDiferencia(esperadoCaja, data.efectivoContado)

  // Lo declarado por el cliente ya no se guarda, pero sí se compara: una
  // discrepancia significa que el POS estaba desincronizado (retiro registrado
  // después de que el vendedor abriera el cuadre, gasto encolado offline, etc.).
  // Se deja en el log en vez de rechazar el cierre, que es la operación crítica
  // del turno y no puede quedar bloqueada por un desfase de sincronización.
  if (data.diferenciaCaja !== diferencia || data.ventaEfectivo !== ventaEfectivo) {
    console.warn(
      `[coherencia] Turno #${turnoId}: cuadre declarado por el POS ` +
      `(ventaEfectivo ${data.ventaEfectivo}, diferencia ${data.diferenciaCaja}) ≠ ` +
      `cuadre del servidor (ventaEfectivo ${ventaEfectivo}, diferencia ${diferencia}); ` +
      `se persiste el del servidor. Gastos BD ${gastosBD}, retiros BD ${retirosBD}.`,
    )
  }

  // Un esperado negativo es físicamente imposible: de la caja salió más plata de
  // la que entró. No se puede validar al registrar el retiro (durante el turno el
  // servidor todavía no conoce la venta: es declarada al cierre), así que se
  // detecta acá. Casi siempre es un retiro cargado al turno equivocado o con un
  // cero de más, y sin este aviso el error se lee como un sobrante enorme.
  if (esperadoCaja < 0) {
    console.warn(
      `[coherencia] Turno #${turnoId}: esperado en caja NEGATIVO (${esperadoCaja}). ` +
      `Salieron ${gastosBD + retirosBD} entre gastos y retiros de una caja que recibió ` +
      `${ventaEfectivo} en ventas al contado. Revisar los retiros de este turno.`,
    )
  }

  // Datos para el snapshot de historial del cierre (C4): stock previo por
  // producto (saldo_anterior), nombre del producto y nombre de quien cierra.
  // Se leen antes de la transacción; los writes van dentro.
  const productoIds = data.stockFinal.map((s) => s.productoId)
  const [inventariosPrevios, productos, ejecutor] = await Promise.all([
    prisma.inventario.findMany({
      where:  { pdv_id: turno.pdv_id, producto_id: { in: productoIds } },
      select: { producto_id: true, stock_actual: true },
    }),
    prisma.producto.findMany({
      where:  { id: { in: productoIds } },
      select: { id: true, nombre: true },
    }),
    prisma.usuario.findUnique({ where: { id: usuarioId }, select: { nombre: true } }),
  ])
  const stockPrevioPorProducto = new Map(inventariosPrevios.map((i) => [i.producto_id, i.stock_actual]))
  const nombrePorProducto = new Map(productos.map((p) => [p.id, p.nombre]))

  // Lote del historial de inventario que escribe este cierre. Se genera ANTES de
  // la transacción para poder guardarlo en el turno: es el ancla que permite
  // reabrirlo después (cada fila del lote lleva el `saldo_anterior`).
  const loteCierre = crypto.randomUUID()

  // Todo el cierre (turno + depósito + stock final) en una sola transacción:
  // si algo falla, no queda un turno cerrado sin depósito ni stock a medias.
  await prisma.$transaction(async (tx) => {
    // updateMany con guardia de estado: si dos cierres llegan a la vez, solo
    // uno gana y el otro no crea un segundo depósito.
    const cerrado = await tx.turnoCaja.updateMany({
      where: { id: turnoId, estado: 'ABIERTO' },
      data: {
        estado:              'CERRADO',
        fecha_cierre:        new Date(),
        efectivo_declarado:  data.efectivoContado,
        // Cuadre calculado por el servidor (no el declarado por el POS).
        diferencia_caja:     diferencia,
        venta_efectivo:      ventaEfectivo,
        venta_tarjeta:       data.ventaTarjeta,
        venta_transferencia: data.ventaTransferencia,
        total_calculado:     data.totalCalculado,
        // Snapshot de los saldos finales declarados, para mostrarlos en el panel
        // de Sucursales (además de persistirse en Inventario más abajo).
        stock_final:         data.stockFinal,
        // Snapshot del detalle de ventas por producto (para el panel admin).
        venta_detalle:       data.ventaDetalle,
        cierre_lote_id:      loteCierre,
      },
    })
    if (cerrado.count === 0) throw conflicto('El turno ya está cerrado')

    // Depósito pendiente: SOLO el efectivo de VENTAS que debe llegar al banco.
    // = efectivo contado + retiros. La caja chica NO se resta porque el vendedor
    // nunca la contó: queda fuera del cuadre y se mantiene en el punto para el turno
    // siguiente (decisión del negocio). Tarjeta y transferencia YA están en el banco,
    // así que tampoco entran (C2). monto_real arranca en 0: nada depositado aún; el
    // admin declara el monto real al confirmar (C9).
    const efectivoADepositar = calcularADepositar(Math.max(0, data.efectivoContado), retirosBD)
    await tx.deposito.create({
      data: {
        turno_id:      turnoId,
        monto_teorico: efectivoADepositar,
        monto_real:    0,
        estado:        'PENDIENTE',
      },
    })

    // Detalle de ventas normalizado (espejo del snapshot JSON `venta_detalle`):
    // permite agregar por producto/período en SQL, algo imposible sobre el JSON.
    // Se borra e inserta para que un re-cierre no duplique líneas (el updateMany
    // de arriba ya impide cerrar dos veces, pero esto lo deja idempotente).
    await tx.ventaTurnoItem.deleteMany({ where: { turno_id: turnoId } })
    if (data.ventaDetalle.length > 0) {
      // Día del turno en zona Chile: un turno abierto a las 22:00 pertenece a ese
      // día chileno, no al día UTC siguiente.
      const diaTurno = new Date(`${diaChileDe(turno.fecha_apertura)}T00:00:00.000Z`)
      await tx.ventaTurnoItem.createMany({
        data: data.ventaDetalle.map((v) => ({
          turno_id:        turnoId,
          producto_id:     v.productoId,
          cantidad:        v.cantidad,
          precio_unitario: v.precioUnitario,
          fecha:           diaTurno,
        })),
      })
    }

    // Trazabilidad del cierre (C4): registrar en HistorialInventario el delta
    // por producto conciliado, agrupado en un lote, igual que "Guardar" de
    // bodega. Sin esto la operación de stock más frecuente (cada cierre) era
    // invisible en la pestaña Historial. Solo se registran cambios reales.
    const fechaCierre = new Date()

    // Persistir saldo final en Inventario → será el "inicio" del turno siguiente.
    // Las filas de HistorialInventario se acumulan y se insertan en UN solo
    // createMany al final (en vez de un create por producto): menos round-trips
    // dentro de la transacción, para no exceder el timeout con muchos productos.
    const historialRows: {
      lote_id: string; producto_id: number; nombre: string; saldo_anterior: number
      ingresos: number; utilizadas: number; saldo_nuevo: number
      usuario_id: number; usuario_nombre: string | null; creado_en: Date
    }[] = []
    for (const item of data.stockFinal) {
      await tx.inventario.upsert({
        where: {
          pdv_id_producto_id: { pdv_id: turno.pdv_id, producto_id: item.productoId },
        },
        update: { stock_actual: item.cantidad },
        create: {
          pdv_id:       turno.pdv_id,
          producto_id:  item.productoId,
          stock_actual: item.cantidad,
          stock_critico: 0,
        },
      })

      const saldoAnterior = stockPrevioPorProducto.get(item.productoId) ?? 0
      if (saldoAnterior === item.cantidad) continue
      const delta = item.cantidad - saldoAnterior
      historialRows.push({
        lote_id:        loteCierre,
        producto_id:    item.productoId,
        nombre:         nombrePorProducto.get(item.productoId) ?? `Producto #${item.productoId}`,
        saldo_anterior: saldoAnterior,
        ingresos:       delta > 0 ? delta : 0,
        utilizadas:     delta < 0 ? -delta : 0,
        saldo_nuevo:    item.cantidad,
        usuario_id:     usuarioId,
        usuario_nombre: ejecutor?.nombre ?? null,
        creado_en:      fechaCierre,
      })
    }
    if (historialRows.length > 0) {
      await tx.historialInventario.createMany({ data: historialRows })
    }
  }, {
    // El cierre escribe turno + depósito + detalle + stock por producto: con muchos
    // productos y una conexión lenta puede pasar los 5s por defecto de Prisma y
    // abortar la transacción (P2028). 20s da margen sin dejarla colgada.
    timeout: 20_000,
  })

  // Se devuelve el cuadre del servidor para que el POS pueda mostrar el número
  // definitivo aunque el suyo estuviera desactualizado.
  return {
    mensaje:       'Turno cerrado correctamente',
    diferencia,
    ventaEfectivo,
    esperadoCaja,
    totalGastos:   gastosBD,
    totalRetiros:  retirosBD,
  }
}

/**
 * 2ª etapa del cierre: el admin/supervisor cuenta el efectivo recibido en mano
 * del vendedor y da término al turno. El turno debe estar ya CERRADO por el
 * vendedor. Registra dinero_recibido, quién lo recibió y cuándo, sin alterar
 * el cuadre declarado por el vendedor (efectivo_declarado / diferencia_caja).
 */
export async function confirmarRecepcionTurno(
  turnoId: number,
  data: RecepcionTurnoInput,
  usuario: UsuarioTurno,
) {
  const turno = await prisma.turnoCaja.findUnique({ where: { id: turnoId } })
  if (!turno) throw noEncontrado('Turno')

  if (turno.estado !== 'CERRADO') {
    throw conflicto('El turno aún no ha sido cerrado por el vendedor')
  }
  if (turno.recepcion_confirmada) {
    throw conflicto('La recepción de este turno ya fue confirmada')
  }

  // Nombre snapshot del admin/supervisor que recibe (para mostrar aunque luego
  // se elimine el usuario), sin agregar una segunda FK a Usuario.
  const receptor = await prisma.usuario.findUnique({
    where:  { id: usuario.id },
    select: { nombre: true },
  })

  await prisma.turnoCaja.update({
    where: { id: turnoId },
    data: {
      dinero_recibido:      data.dineroRecibido,
      recepcion_confirmada: true,
      recibido_por:         usuario.id,
      recibido_por_nombre:  receptor?.nombre ?? null,
      fecha_recepcion:      new Date(),
    },
  })

  // Diferencia de recepción: lo recibido en mano vs lo que el vendedor declaró
  // entregar. Informativo/auditoría (no altera el cuadre del vendedor).
  const diferenciaRecepcion = data.dineroRecibido - (turno.efectivo_declarado ?? 0)

  return {
    mensaje:            'Turno finalizado: recepción confirmada',
    dineroRecibido:     data.dineroRecibido,
    diferenciaRecepcion,
  }
}

/**
 * Cierre administrativo (ADMIN/SUPERVISOR): cierra un turno que quedó ABIERTO sin
 * que el vendedor cuadrara (se fue sin cerrar, quedó huérfano, bug, etc.). No hay
 * datos declarados, así que se cierra en $0 y se auto-finaliza la 2ª etapa (no hay
 * dinero que recibir). El stock del PDV NO se toca (queda como esté en Inventario).
 * Queda marcado en `recibido_por_nombre` como cierre administrativo para no
 * confundirlo con un cuadre real del vendedor.
 */
export async function cerrarTurnoAdministrativo(turnoId: number, usuario: { id: number; nombre: string }) {
  const turno = await prisma.turnoCaja.findUnique({ where: { id: turnoId }, select: { estado: true } })
  if (!turno) throw noEncontrado('Turno')
  if (turno.estado !== 'ABIERTO') throw conflicto('El turno ya está cerrado')

  const cerrado = await prisma.turnoCaja.updateMany({
    where: { id: turnoId, estado: 'ABIERTO' }, // guarda de carrera: solo si sigue ABIERTO
    data: {
      estado:               'CERRADO',
      fecha_cierre:         new Date(),
      efectivo_declarado:   0,
      diferencia_caja:      0,
      venta_efectivo:       0,
      venta_tarjeta:        0,
      venta_transferencia:  0,
      total_calculado:      0,
      stock_final:          undefined,
      venta_detalle:        undefined,
      // Auto-finaliza la recepción: no hay dinero declarado que recibir.
      recepcion_confirmada: true,
      dinero_recibido:      0,
      recibido_por:         usuario.id,
      recibido_por_nombre:  `Cierre administrativo — ${usuario.nombre}`,
      fecha_recepcion:      new Date(),
    },
  })
  if (cerrado.count === 0) throw conflicto('El turno ya está cerrado')

  return { mensaje: 'Turno cerrado administrativamente' }
}

/**
 * Reabre un turno CERRADO para corregir un cuadre mal declarado (ADMIN).
 *
 * Deshace, en una sola transacción, todo lo que escribió `cerrarTurno`:
 *   1. devuelve el inventario del PDV al `saldo_anterior` del lote del cierre;
 *   2. borra esas filas de HistorialInventario (el cierre "no ocurrió");
 *   3. borra el depósito generado y las líneas de VentaTurnoItem;
 *   4. limpia los campos del cuadre y de la recepción, y vuelve a ABIERTO.
 *
 * Los GASTOS y RETIROS del turno NO se tocan: son movimientos reales del punto,
 * independientes del cuadre. Si el error estaba ahí (un retiro con un cero de
 * más), se corrige aparte una vez reabierto el turno.
 *
 * Candados: el turno no puede estar ya pagado en una nómina (sería plata que ya
 * salió), su depósito no puede estar confirmado, y el PDV no puede tener otro
 * turno abierto (dos turnos ABIERTO en el mismo punto rompen todo el POS).
 */
export async function reabrirTurno(turnoId: number, usuario: { id: number; nombre: string }) {
  const turno = await prisma.turnoCaja.findUnique({
    where:   { id: turnoId },
    include: { depositos: true, pdv: { select: { nombre: true } } },
  })
  if (!turno) throw noEncontrado('Turno')
  if (turno.estado !== 'CERRADO') throw conflicto('El turno no está cerrado')

  if (turno.pago_id !== null) {
    throw conflicto(
      'Este turno ya fue pagado en una nómina: anula primero el pago en Personal → Pagos y vuelve a intentarlo',
    )
  }

  const depositoUsado = turno.depositos.find((d) => d.estado !== 'PENDIENTE' || d.monto_real > 0)
  if (depositoUsado) {
    throw conflicto(
      'El depósito de este turno ya fue registrado en Finanzas: revierte el depósito antes de reabrir el turno',
    )
  }

  // Reabrir borra el depósito del turno, y con él el descuento de un pago que ya
  // se le entregó al vendedor con esta caja ("Pagar a vendedor"). Esa plata ya
  // salió: hay que anular el pago primero para que sus turnos vuelvan a quedar
  // pendientes, si no el monto se perdería del "a depositar".
  if (turno.depositos.some((d) => d.pago_vendedor > 0)) {
    throw conflicto(
      'Con el efectivo de este turno se le pagó a un vendedor: anula ese pago en Personal → Pagos antes de reabrirlo',
    )
  }

  const otroAbierto = await prisma.turnoCaja.findFirst({
    where:  { pdv_id: turno.pdv_id, estado: 'ABIERTO' },
    select: { id: true },
  })
  if (otroAbierto) {
    throw conflicto(
      `${turno.pdv.nombre} ya tiene el turno #${otroAbierto.id} abierto: ciérralo antes de reabrir este`,
    )
  }

  // Filas del historial que escribió el cierre. Los turnos cerrados ANTES de que
  // existiera `cierre_lote_id` no tienen ancla; en ese caso no se toca el
  // inventario (se avisa) en vez de adivinar qué filas revertir.
  const filasCierre = turno.cierre_lote_id
    ? await prisma.historialInventario.findMany({ where: { lote_id: turno.cierre_lote_id } })
    : []
  const stockRestaurable = turno.cierre_lote_id !== null

  await prisma.$transaction(async (tx) => {
    // Guarda de carrera: solo revierte si sigue CERRADO.
    const reabierto = await tx.turnoCaja.updateMany({
      where: { id: turnoId, estado: 'CERRADO' },
      data: {
        estado:               'ABIERTO',
        fecha_cierre:         null,
        efectivo_declarado:   null,
        diferencia_caja:      null,
        venta_efectivo:       null,
        venta_tarjeta:        null,
        venta_transferencia:  null,
        total_calculado:      null,
        stock_final:          Prisma.DbNull,
        venta_detalle:        Prisma.DbNull,
        cierre_lote_id:       null,
        // La recepción del dinero también se deshace: se confirmó contra un
        // cuadre que ya no existe y hay que volver a contarla al recerrar.
        recepcion_confirmada: false,
        dinero_recibido:      null,
        recibido_por:         null,
        recibido_por_nombre:  null,
        fecha_recepcion:      null,
      },
    })
    if (reabierto.count === 0) throw conflicto('El turno ya fue reabierto por otra persona')

    // Devolver el stock al valor previo al cierre.
    for (const fila of filasCierre) {
      if (fila.producto_id === null) continue
      await tx.inventario.updateMany({
        where: { pdv_id: turno.pdv_id, producto_id: fila.producto_id },
        data:  { stock_actual: fila.saldo_anterior },
      })
    }
    if (turno.cierre_lote_id) {
      await tx.historialInventario.deleteMany({ where: { lote_id: turno.cierre_lote_id } })
    }

    await tx.deposito.deleteMany({ where: { turno_id: turnoId } })
    await tx.ventaTurnoItem.deleteMany({ where: { turno_id: turnoId } })
  }, { timeout: 20_000 })

  console.warn(
    `[reapertura] Turno #${turnoId} (${turno.pdv.nombre}) reabierto por ${usuario.nombre} (#${usuario.id}). ` +
    `Cuadre anterior: efectivo ${turno.efectivo_declarado}, diferencia ${turno.diferencia_caja}, ` +
    `venta ${turno.total_calculado}. Productos restaurados: ${filasCierre.length}.`,
  )

  return {
    mensaje:            'Turno reabierto: el vendedor puede volver a cuadrar la caja',
    productosRestaurados: filasCierre.length,
    stockRestaurable,
  }
}

/**
 * Historial de turnos cerrados del propio usuario (C15/A36): la vendedora puede
 * auditar sus diferencias de caja — el mismo dato que el admin ve en Seguimiento
 * y que afecta su nómina — sin acceder a datos de otros vendedores (scope: solo
 * turnos donde usuario_id = ella).
 */
export async function getMisTurnos(usuarioId: number, limite = 30) {
  const turnos = await prisma.turnoCaja.findMany({
    where:   { usuario_id: usuarioId, estado: 'CERRADO' },
    include: { pdv: { select: { nombre: true } } },
    orderBy: { fecha_apertura: 'desc' },
    take:    Math.min(Math.max(limite, 1), 100),
  })

  return turnos.map((t) => ({
    id:                  t.id,
    pdvNombre:           t.pdv.nombre,
    fechaApertura:       t.fecha_apertura.toISOString(),
    fechaCierre:         t.fecha_cierre?.toISOString() ?? null,
    totalCalculado:      t.total_calculado ?? 0,
    ventaEfectivo:       t.venta_efectivo ?? 0,
    ventaTarjeta:        t.venta_tarjeta ?? 0,
    ventaTransferencia:  t.venta_transferencia ?? 0,
    efectivoDeclarado:   t.efectivo_declarado ?? 0,
    diferenciaCaja:      t.diferencia_caja ?? 0,
    recepcionConfirmada: t.recepcion_confirmada,
    dineroRecibido:      t.dinero_recibido,
  }))
}

export async function getTurnoActivo(pdvId: number, usuario: UsuarioTurno) {
  const turno = await prisma.turnoCaja.findFirst({
    where: { pdv_id: pdvId, estado: 'ABIERTO' },
  })
  if (!turno) return null

  // Scope P6: ADMIN/SUPERVISOR ven cualquier PDV; el resto solo el turno propio
  // o el de su PDV (evita filtrar id/usuario/saldo inicial de turnos ajenos).
  const esAdmin = usuario.rol === 'ADMIN' || usuario.rol === 'SUPERVISOR'
  if (!esAdmin && turno.usuario_id !== usuario.id && turno.pdv_id !== usuario.pdvId) {
    throw accesoDenegado('El turno no pertenece a tu punto de venta')
  }

  return {
    id:            turno.id,
    pdvId:         turno.pdv_id,
    usuarioId:     turno.usuario_id,
    fechaApertura: turno.fecha_apertura.toISOString(),
    saldoInicial:  turno.saldo_inicial,
    estado:        turno.estado as string,
  }
}

// ─── Retiros ─────────────────────────────────────────────────────────────────

export async function registrarRetiro(turnoId: number, data: RetiroInput, usuario: UsuarioTurno) {
  const turno = await getTurnoConAcceso(turnoId, usuario)
  if (turno.estado !== 'ABIERTO') {
    throw conflicto('No se puede registrar un retiro en un turno cerrado')
  }
  const retiro = await prisma.retiroTurno.create({
    data: {
      turno_id:    turnoId,
      usuario_id:  usuario.id,
      monto:       data.monto,
      descripcion: data.descripcion,
    },
  })
  return {
    id:          retiro.id,
    monto:       retiro.monto,
    descripcion: retiro.descripcion ?? null,
    fechaHora:   retiro.fecha_hora.toISOString(),
  }
}

// ─── Gastos ──────────────────────────────────────────────────────────────────

export async function registrarGasto(turnoId: number, data: GastoInput, usuario: UsuarioTurno) {
  const turno = await getTurnoConAcceso(turnoId, usuario)
  if (turno.estado !== 'ABIERTO') throw conflicto('No se puede registrar un gasto en un turno cerrado')
  const gasto = await prisma.gastoTurno.create({
    data: { turno_id: turnoId, descripcion: data.descripcion, monto: data.monto },
  })
  return { id: gasto.id, descripcion: gasto.descripcion, monto: gasto.monto }
}

export async function getGastosTurno(turnoId: number, usuario: UsuarioTurno) {
  await getTurnoConAcceso(turnoId, usuario)
  const gastos = await prisma.gastoTurno.findMany({
    where: { turno_id: turnoId }, orderBy: { id: 'asc' },
  })
  return gastos.map((g) => ({ id: g.id, descripcion: g.descripcion, monto: g.monto }))
}

export async function eliminarGasto(gastoId: number, turnoId: number) {
  const gasto = await prisma.gastoTurno.findUnique({ where: { id: gastoId } })
  if (!gasto) throw noEncontrado('Gasto')
  if (gasto.turno_id !== turnoId) throw accesoDenegado('El gasto no pertenece a este turno')
  await prisma.gastoTurno.delete({ where: { id: gastoId } })
  return { eliminado: gastoId }
}

/**
 * Retiros del turno. El vendedor dueño del turno también los lee: se los hace el
 * admin/supervisor durante su visita y tienen que aparecer en su cuadre, si no
 * cuenta menos efectivo del esperado y declara un faltante que no existe.
 */
/**
 * Elimina un retiro mal registrado (ADMIN). Solo con el turno ABIERTO: si ya se
 * cuadró, el retiro está incorporado a la diferencia persistida y borrarlo la
 * dejaría mintiendo — en ese caso hay que reabrir el turno primero.
 */
export async function eliminarRetiro(retiroId: number, turnoId: number) {
  const retiro = await prisma.retiroTurno.findUnique({
    where:   { id: retiroId },
    include: { turno: { select: { id: true, estado: true } } },
  })
  if (!retiro) throw noEncontrado('Retiro')
  if (retiro.turno_id !== turnoId) throw accesoDenegado('El retiro no pertenece a este turno')
  if (retiro.turno.estado !== 'ABIERTO') {
    throw conflicto('El turno ya está cerrado: reábrelo antes de corregir sus retiros')
  }

  await prisma.retiroTurno.delete({ where: { id: retiroId } })
  return { eliminado: retiroId, monto: retiro.monto }
}

export async function getRetirosTurno(turnoId: number, usuario: UsuarioTurno) {
  await getTurnoConAcceso(turnoId, usuario)
  const retiros = await prisma.retiroTurno.findMany({
    where:   { turno_id: turnoId },
    include: { usuario: { select: { nombre: true } } },
    orderBy: { fecha_hora: 'asc' },
  })
  return retiros.map((r) => ({
    id:           r.id,
    monto:        r.monto,
    descripcion:  r.descripcion ?? null,
    realizadoPor: r.usuario?.nombre ?? 'Usuario eliminado',
    fechaHora:    r.fecha_hora.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
  }))
}
