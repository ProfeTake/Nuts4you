/**
 * Servicio de cálculos del negocio Nuts 4 You.
 *
 * Lógica pura sin dependencias de Express ni Prisma.
 * Todas las funciones reciben datos y retornan resultados.
 * Dinero siempre en CLP (enteros, sin decimales).
 */

// ─── Tabla de bonos por sucursal ─────────────────────────────────────────────
// Fuente: archivo Excel "Sueldos Feb 2026.xlsx" — fórmulas verificadas.
// Estructura: umbrales ordenados de mayor a menor (primer match gana).
//
// ⚠️ ADVERTENCIA: Las claves son los nombres EXACTOS del PDV en la BD (ver seed.ts).
// Si un admin renombra un PDV desde la UI, calcularBono() devolverá 0 silenciosamente
// para todos los turnos de ese PDV. No hay vínculo por ID.
// TODO P6: migrar a tabla `ConfigBono` en BD usando pdv_id como clave (umbral_venta,
// monto_bono, activo) para que el admin edite umbrales sin tocar código.

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

/** Calcula el monto "A Depositar" del turno */
export function calcularADepositar(
  efectivoDeclarado: number,
  gastosTurno: number,
  retiros: number
): number {
  return efectivoDeclarado - gastosTurno - retiros
}

/** Calcula la diferencia de caja (sobrante/faltante) */
export function calcularDiferencia(
  ventaEfectivoTeorica: number,
  efectivoDeclarado: number
): number {
  // Positivo = sobrante, Negativo = faltante
  return efectivoDeclarado - ventaEfectivoTeorica
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
