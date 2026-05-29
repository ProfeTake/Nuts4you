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
// Claves = nombre exacto del PDV en la BD (ver seed.ts).

interface TramoBonoItem {
  umbral: number  // venta mínima diaria en CLP para obtener este bono
  bono:   number  // monto del bono en CLP
}

const TABLA_BONOS: Record<string, TramoBonoItem[]> = {
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
 * Calcula el bono individual de un turno.
 * @param pdvNombre  - Nombre del PDV tal como está en la BD
 * @param ventaDiaria - Total vendido en ese turno (CLP)
 * @returns Bono en CLP (0 si no alcanza ningún umbral o PDV sin tabla)
 */
export function calcularBono(pdvNombre: string, ventaDiaria: number): number {
  const tabla = TABLA_BONOS[pdvNombre]
  if (!tabla) return 0
  for (const tramo of tabla) {
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
