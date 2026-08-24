import { z } from 'zod'

// ─── Turno ───────────────────────────────────────────────────────────────────

export const abrirTurnoSchema = z.object({
  pdvId:        z.number().int().positive(),
  saldoInicial: z.number().int().min(0),
  inventarioInicial: z.array(z.object({
    productoId: z.number().int().positive(),
    inicio:     z.number().int().min(0),
    ingreso:    z.number().int().min(0),
  })).optional().default([]),
})

export const cerrarTurnoSchema = z.object({
  efectivoContado:    z.number().int().min(0),
  ventaEfectivo:      z.number().int().min(0).default(0),
  ventaTarjeta:       z.number().int().min(0).default(0),
  ventaTransferencia: z.number().int().min(0).default(0),
  totalCalculado:     z.number().int().min(0).default(0),
  diferenciaCaja:     z.number().int().default(0),
  stockFinal: z.array(z.object({
    productoId: z.number().int().positive(),
    cantidad:   z.number().int().min(0),
  })).optional().default([]),
  // Detalle de ventas por producto (unidades vendidas × precio snapshot).
  // Solo para el panel admin de Cierre de turno; el vendedor no ve montos.
  ventaDetalle: z.array(z.object({
    productoId:     z.number().int().positive(),
    cantidad:       z.number().int().min(0),
    precioUnitario: z.number().int().min(0),
  })).optional().default([]),
})

// ─── Recepción del dinero (2ª etapa del cierre: admin/supervisor) ─────────────
// El admin/supervisor cuenta el efectivo recibido en mano del vendedor y da
// término al turno. Solo aplica a turnos ya cerrados por el vendedor.

export const recepcionTurnoSchema = z.object({
  dineroRecibido: z.number().int().min(0),
})

// ─── Retiro de dinero del punto ───────────────────────────────────────────────

export const retiroSchema = z.object({
  monto:       z.number().int().positive(),
  descripcion: z.string().max(100).optional(),
})

// ─── Gasto de turno ──────────────────────────────────────────────────────────

export const gastoSchema = z.object({
  descripcion: z.string().min(1).max(200),
  monto:       z.number().int().positive(),
})

export type AbrirTurnoInput     = z.infer<typeof abrirTurnoSchema>
export type CerrarTurnoInput    = z.infer<typeof cerrarTurnoSchema>
export type RecepcionTurnoInput = z.infer<typeof recepcionTurnoSchema>
export type RetiroInput         = z.infer<typeof retiroSchema>
export type GastoInput          = z.infer<typeof gastoSchema>
