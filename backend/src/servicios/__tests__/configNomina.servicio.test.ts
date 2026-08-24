/**
 * Tests del cálculo de sueldos, celda por celda de la planilla del cliente
 * ("Sueldos Feb 2026.xlsx", hoja PAGO TURNOS).
 *
 *   fila del turno   K{n} = I{n} + J{n} + 3.000 × E{n}
 *   cierre período   K162 = SUBTOTAL(K) + IF(H162 < -1000, H162, 0) + H163 - H164
 *
 * donde H162 = SUMA de todas las diferencias del período CON SIGNO. O sea: los
 * sobrantes compensan los faltantes, y solo se descuenta si el neto queda peor
 * que la tolerancia. Ejecutar con: npm test
 */
import { describe, it, expect } from 'vitest'
import {
  calcularDescuentoCaja, calcularMontoExtra, calcularTotalPago, pagoDiarioDe,
  PAGO_DIARIO_BASE_DEFECTO, TOLERANCIA_FALTANTE_DEFECTO, VALOR_EXTRA_DEFECTO,
} from '../configNomina.servicio'
import { calcularBono } from '../calculos.servicio'

const TOL = TOLERANCIA_FALTANTE_DEFECTO // 1.000, el valor del Excel

describe('calcularDescuentoCaja', () => {
  it('un faltante dentro de la tolerancia no se descuenta', () => {
    expect(calcularDescuentoCaja([-400], TOL)).toBe(0)
  })

  it('un faltante justo en el límite tampoco se descuenta (la regla es estricta)', () => {
    expect(calcularDescuentoCaja([-1000], TOL)).toBe(0)
  })

  it('pasado el límite se descuenta el neto completo, no solo el exceso', () => {
    expect(calcularDescuentoCaja([-1001], TOL)).toBe(1001)
    expect(calcularDescuentoCaja([-5000], TOL)).toBe(5000)
  })

  it('los sobrantes compensan los faltantes del período', () => {
    // −800 y +500 => neto −300, dentro de tolerancia. Antes se descontaban 800.
    expect(calcularDescuentoCaja([-800, 500], TOL)).toBe(0)
  })

  it('varios faltantes chicos que suman fuera de tolerancia sí se descuentan', () => {
    // Cada uno se perdonaría por separado, pero el neto es −2.100.
    expect(calcularDescuentoCaja([-700, -700, -700], TOL)).toBe(2100)
  })

  it('un período solo con sobrantes no genera descuento', () => {
    expect(calcularDescuentoCaja([300, 1200], TOL)).toBe(0)
  })

  it('sin turnos => 0', () => {
    expect(calcularDescuentoCaja([], TOL)).toBe(0)
  })

  it('con tolerancia 0 se descuenta cualquier faltante neto', () => {
    expect(calcularDescuentoCaja([-100], 0)).toBe(100)
    expect(calcularDescuentoCaja([0], 0)).toBe(0)
  })

  // Caso real de la planilla: en el período de Cugat Rengo el acumulado de
  // diferencias (celda H162) da −100 y el pago (K162) no lleva descuento, aunque
  // el período incluye turnos con faltantes individuales de −2.300 y −200.
  // Es exactamente lo que el sistema hacía mal: descontaba turno a turno.
  it('faltantes individuales grandes pero neto dentro de tolerancia => sin descuento', () => {
    const netoCero = [-2300, -200, -200, -100, 2800]
    expect(netoCero.reduce((s, d) => s + d, 0)).toBe(0)
    expect(calcularDescuentoCaja(netoCero, TOL)).toBe(0)
    // Turno a turno se le habrían descontado 2.800 al vendedor.
  })
})

describe('pagoDiarioDe', () => {
  const BASE = PAGO_DIARIO_BASE_DEFECTO // 28.000, la celda P13 del Excel

  it('sin override usa el valor global', () => {
    expect(pagoDiarioDe(null, BASE)).toBe(28000)
    expect(pagoDiarioDe(undefined, BASE)).toBe(28000)
  })

  it('con override manda el valor del vendedor', () => {
    expect(pagoDiarioDe(26000, BASE)).toBe(26000)
  })

  it('un override de 0 es un valor válido, no "sin override"', () => {
    expect(pagoDiarioDe(0, BASE)).toBe(0)
  })
})

describe('calcularMontoExtra (planilla, columna E × 3.000)', () => {
  const V = VALOR_EXTRA_DEFECTO // 3.000

  it('los cuatro valores de la validación del Excel dan montos exactos', () => {
    expect(calcularMontoExtra(0, V)).toBe(0)      // sin adicional
    expect(calcularMontoExtra(5, V)).toBe(1500)   // 0,5
    expect(calcularMontoExtra(10, V)).toBe(3000)  // 1
    expect(calcularMontoExtra(15, V)).toBe(4500)  // 1,5
  })

  it('redondea a peso entero si el valor unitario es impar', () => {
    expect(calcularMontoExtra(5, 3333)).toBe(1667) // 1666,5 → 1667
  })
})

// ─── La planilla completa ────────────────────────────────────────────────────
// Filas reales de "Sueldos Feb 2026.xlsx", sección Mall Patio (filas 5-9).
// Tramos de Mall: ≥400k→30.000 · >350k→19.000 · ≥300k→12.000 · ≥250k→6.000.
describe('fila de la planilla: K = pago diario + bono + 3.000 × extra', () => {
  const TRAMOS_MALL = [
    { umbral: 400_000, bono: 30_000 },
    { umbral: 350_000, bono: 19_000 },
    { umbral: 300_000, bono: 12_000 },
    { umbral: 250_000, bono:  6_000 },
  ]
  const PAGO_DIARIO = PAGO_DIARIO_BASE_DEFECTO
  const filaK = (venta: number, extraDecimas = 0) =>
    PAGO_DIARIO
    + calcularBono(TRAMOS_MALL, venta)
    + calcularMontoExtra(extraDecimas, VALOR_EXTRA_DEFECTO)

  it('1-Feb Alexandra: venta 136.900 no alcanza ningún tramo => K5 = 28.000', () => {
    expect(filaK(136_900)).toBe(28_000)
  })

  it('2-Feb Alexandra: venta 257.500 alcanza el tramo de 250k => K6 = 34.000', () => {
    expect(filaK(257_500)).toBe(34_000)
  })

  it('6-Feb Luisana: venta 325.600 alcanza el tramo de 300k => K10 = 40.000', () => {
    expect(filaK(325_600)).toBe(40_000)
  })

  it('un turno con adicional 0,5 suma 1.500 a la fila', () => {
    expect(filaK(257_500, 5)).toBe(35_500)
  })
})

describe('cierre de período (celda K162)', () => {
  it('suma las filas, descuenta el neto de caja y aplica adicional y cotizaciones', () => {
    // 3 turnos en Mall: 136.900 · 257.500 · 325.600 → K = 28.000 + 34.000 + 40.000
    const montoBase  = 3 * PAGO_DIARIO_BASE_DEFECTO // 84.000 (columna I)
    const montoBonos = 0 + 6_000 + 12_000           // 18.000 (columna J)
    const montoExtras = calcularMontoExtra(10, VALOR_EXTRA_DEFECTO) // un turno con extra 1

    const diferencias = [0, -400, 200] // neto −200: dentro de tolerancia
    const montoDescuentos = calcularDescuentoCaja(diferencias, TOL)
    expect(montoDescuentos).toBe(0)

    expect(calcularTotalPago({
      montoBase, montoBonos, montoExtras, montoDescuentos,
      montoAdicional: 5_000, montoCotizaciones: 10_000,
    })).toBe(84_000 + 18_000 + 3_000 - 0 + 5_000 - 10_000)
  })

  it('el descuento de caja resta y las cotizaciones pueden dejarlo en negativo', () => {
    expect(calcularTotalPago({
      montoBase: 28_000, montoBonos: 0, montoExtras: 0,
      montoDescuentos: calcularDescuentoCaja([-5_000], TOL), // 5.000
      montoCotizaciones: 30_000,
    })).toBe(-7_000)
  })

  it('sin adicional ni cotizaciones equivale al cálculo anterior a la fusión', () => {
    expect(calcularTotalPago({
      montoBase: 84_000, montoBonos: 18_000, montoExtras: 0, montoDescuentos: 2_100,
    })).toBe(99_900)
  })
})
