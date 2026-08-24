/**
 * Servicio de cálculos del negocio Nuts 4 You.
 *
 * Lógica pura sin dependencias de Express ni Prisma.
 * Todas las funciones reciben datos y retornan resultados.
 * Dinero siempre en CLP (enteros, sin decimales).
 */

// ─── Tabla de bonos por sucursal (FALLBACK) ──────────────────────────────────
// Fuente: archivo Excel "Sueldos Feb 2026.xlsx" — fórmulas verificadas.
// Estructura: umbrales ordenados de mayor a menor (primer match gana).
//
// La fuente de verdad es la tabla `ConfigBono` en BD (clave: pdv_id), editable
// desde el panel admin. Esta tabla en código se usa SOLO como fallback por
// nombre de PDV cuando un punto de venta aún no tiene tramos configurados
// (ej. recién creado); configBono.servicio.tramosParaPdv deja un warn en el
// log cada vez que eso ocurre, porque el fallback se rompe si renombran el PDV.

export interface TramoBonoItem {
  umbral: number  // venta mínima diaria en CLP para obtener este bono
  bono:   number  // monto del bono en CLP
}

// Fallback en código usado solo si la tabla `ConfigBono` aún no tiene tramos
// para un PDV (ej. recién creado). La fuente de verdad es la BD (ver P6).
export const TABLA_BONOS: Record<string, TramoBonoItem[]> = {
  'Mall Patio': [
    { umbral: 400_000, bono: 30_000 },
    { umbral: 350_000, bono: 19_000 },
    { umbral: 300_000, bono: 12_000 },
    { umbral: 250_000, bono:  6_000 },
  ],
  'Paseo Independencia': [
    { umbral: 350_000, bono: 25_000 },
    { umbral: 300_000, bono: 19_000 },
    { umbral: 250_000, bono: 13_000 },
    { umbral: 200_000, bono:  6_000 },
  ],
  'Open Plaza': [
    { umbral: 300_000, bono: 20_000 },
    { umbral: 250_000, bono: 13_000 },
    { umbral: 200_000, bono:  8_000 },
    { umbral: 160_000, bono:  4_000 },
  ],
  'Cugat Rengo': [
    { umbral: 180_000, bono: 12_000 },
    { umbral: 140_000, bono:  8_000 },
    { umbral: 100_000, bono:  4_000 },
  ],
  'Cugat Baquedano': [
    { umbral: 180_000, bono: 12_000 },
    { umbral: 140_000, bono:  8_000 },
    { umbral: 100_000, bono:  3_000 },
  ],
}

/**
 * Calcula el bono individual de un turno a partir de los tramos del PDV.
 * Lógica pura: recibe los tramos (desde BD o fallback) y la venta diaria.
 * @param tramos      - Tramos de bono del PDV; se evalúan de mayor a menor umbral
 * @param ventaDiaria - Total vendido en ese turno (CLP)
 * @returns Bono en CLP (0 si no alcanza ningún umbral o no hay tramos)
 */
export function calcularBono(tramos: TramoBonoItem[] | undefined, ventaDiaria: number): number {
  if (!tramos || tramos.length === 0) return 0
  // Ordenar de mayor a menor por seguridad (no depender del orden de la BD).
  for (const tramo of [...tramos].sort((a, b) => b.umbral - a.umbral)) {
    if (ventaDiaria >= tramo.umbral) return tramo.bono
  }
  return 0
}

// ─── Cuadre de caja ──────────────────────────────────────────────────────────
// Identidades tomadas de la planilla del cliente ("01 Mall Patio Feb 2026.xlsx",
// hoja de día, celdas P15/P21/P22/P24/P25/P26):
//
//   ventaEfectivo = totalVenta − tarjeta − transferencia          (P30)
//   esperadoCaja  = ventaEfectivo − gastos − retiros
//   diferencia    = efectivoContado − esperadoCaja                (P26)
//   aDepositar    = efectivoContado + retiros                     (P22)
//
// La CAJA CHICA queda fuera del cuadre: el vendedor cuenta y entrega solo el
// efectivo de ventas, y ese fondo se mantiene en el punto para el turno siguiente.

/**
 * Venta cobrada en efectivo: el total declarado menos lo que se cobró por medios
 * que no dejan billetes en la caja.
 */
export function calcularVentaEfectivo(
  totalVenta: number,
  ventaTarjeta: number,
  ventaTransferencia: number
): number {
  return totalVenta - ventaTarjeta - ventaTransferencia
}

/**
 * Efectivo que debería quedar físicamente en la caja al cierre: la venta en
 * efectivo menos lo que salió de esa caja durante el turno (gastos pagados en
 * efectivo y retiros hechos por admin/supervisor).
 */
export function calcularEsperadoCaja(
  ventaEfectivo: number,
  gastosTurno: number,
  retiros: number
): number {
  return ventaEfectivo - gastosTurno - retiros
}

/** Calcula la diferencia de caja (positivo = sobrante, negativo = faltante) */
export function calcularDiferencia(
  esperadoCaja: number,
  efectivoContado: number
): number {
  return efectivoContado - esperadoCaja
}

/**
 * Monto "A Depositar" del turno: el efectivo de ventas contado más lo que ya se
 * retiró del punto (ese dinero también debe llegar al banco). Los gastos NO se
 * restan: se pagaron con billetes que por eso ya no están en la caja contada.
 */
export function calcularADepositar(
  efectivoContado: number,
  retiros: number
): number {
  return efectivoContado + retiros
}

/** Calcula saldo actual de un producto: inicial + ingresos - utilizado */
export function calcularSaldoProducto(
  saldoInicial: number,
  ingresos: number,
  utilizado: number
): number {
  return saldoInicial + ingresos - utilizado
}

/** Calcula el total de una venta a partir de sus detalles */
export function calcularTotalVenta(
  detalles: Array<{ precioUnitario: number; cantidad: number }>
): number {
  return detalles.reduce((sum, d) => sum + d.precioUnitario * d.cantidad, 0)
}
