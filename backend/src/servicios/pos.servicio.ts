import prisma from '../config/prisma'
import type { AbrirTurnoInput, CerrarTurnoInput, RetiroInput, GastoInput } from '../validaciones/pos.schema'

// ─── Turno ───────────────────────────────────────────────────────────────────

export async function abrirTurno(data: AbrirTurnoInput, usuarioId: number) {
  // Verificar que el PDV no tenga ya un turno abierto
  const turnoActivo = await prisma.turnoCaja.findFirst({
    where: { pdv_id: data.pdvId, estado: 'ABIERTO' },
  })
  if (turnoActivo) {
    throw new Error(`El PDV ya tiene un turno abierto (Turno #${turnoActivo.id})`)
  }

  const turno = await prisma.turnoCaja.create({
    data: {
      pdv_id:        data.pdvId,
      usuario_id:    usuarioId,
      saldo_inicial: data.saldoInicial,
      estado:        'ABIERTO',
    },
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
  const turno = await prisma.turnoCaja.findUniqueOrThrow({
    where: { id: turnoId },
  })

  if (turno.usuario_id !== usuarioId && rol !== 'ADMIN' && rol !== 'SUPERVISOR') {
    throw new Error('No puedes cerrar un turno que no es tuyo')
  }
  if (turno.estado === 'CERRADO') {
    throw new Error('El turno ya está cerrado')
  }

  const totalDeclarado = data.ventaEfectivo + data.ventaTarjeta + data.ventaTransferencia

  await prisma.turnoCaja.update({
    where: { id: turnoId },
    data: {
      estado:              'CERRADO',
      fecha_cierre:        new Date(),
      efectivo_declarado:  data.efectivoContado,
      diferencia_caja:     data.diferenciaCaja,
      venta_efectivo:      data.ventaEfectivo,
      venta_tarjeta:       data.ventaTarjeta,
      venta_transferencia: data.ventaTransferencia,
      total_calculado:     data.totalCalculado,
    },
  })

  // Depósito pendiente con montos reales del cuadre
  await prisma.deposito.create({
    data: {
      turno_id:      turnoId,
      monto_teorico: data.totalCalculado,
      monto_real:    totalDeclarado,
      estado:        'PENDIENTE',
    },
  })

  // Persistir saldo final en Inventario → será el "inicio" del turno siguiente
  if (data.stockFinal.length > 0) {
    for (const item of data.stockFinal) {
      await prisma.inventario.upsert({
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
    }
  }

  return { mensaje: 'Turno cerrado correctamente', diferencia: data.diferenciaCaja }
}

export async function getTurnoActivo(pdvId: number) {
  const turno = await prisma.turnoCaja.findFirst({
    where: { pdv_id: pdvId, estado: 'ABIERTO' },
  })
  if (!turno) return null

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

export async function registrarRetiro(turnoId: number, data: RetiroInput, usuarioId: number) {
  const turno = await prisma.turnoCaja.findUniqueOrThrow({ where: { id: turnoId } })
  if (turno.estado !== 'ABIERTO') {
    throw new Error('No se puede registrar un retiro en un turno cerrado')
  }
  const retiro = await prisma.retiroTurno.create({
    data: {
      turno_id:    turnoId,
      usuario_id:  usuarioId,
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

export async function registrarGasto(turnoId: number, data: GastoInput) {
  const turno = await prisma.turnoCaja.findUniqueOrThrow({ where: { id: turnoId } })
  if (turno.estado !== 'ABIERTO') throw new Error('No se puede registrar un gasto en un turno cerrado')
  const gasto = await prisma.gastoTurno.create({
    data: { turno_id: turnoId, descripcion: data.descripcion, monto: data.monto },
  })
  return { id: gasto.id, descripcion: gasto.descripcion, monto: gasto.monto }
}

export async function getGastosTurno(turnoId: number) {
  const gastos = await prisma.gastoTurno.findMany({
    where: { turno_id: turnoId }, orderBy: { id: 'asc' },
  })
  return gastos.map((g) => ({ id: g.id, descripcion: g.descripcion, monto: g.monto }))
}

export async function eliminarGasto(gastoId: number, turnoId: number) {
  const gasto = await prisma.gastoTurno.findUniqueOrThrow({ where: { id: gastoId } })
  if (gasto.turno_id !== turnoId) throw new Error('Gasto no pertenece a este turno')
  await prisma.gastoTurno.delete({ where: { id: gastoId } })
  return { eliminado: gastoId }
}

export async function getRetirosTurno(turnoId: number) {
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

