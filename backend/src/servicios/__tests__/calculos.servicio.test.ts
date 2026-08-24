/**
 * Tests unitarios de la lógica financiera pura (calculos.servicio).
 *
 * Formaliza los 15 casos validados ad-hoc en la auditoría técnica de julio 2026
 * (tramos reales del seed: bonos de Mall Patio) para tener regresión continua.
 * Ejecutar con: npm test
 */
import { describe, it, expect } from 'vitest'
import {
  TABLA_BONOS,
  calcularBono,
  calcularADepositar,
  calcularDiferencia,
  calcularEsperadoCaja,
  calcularVentaEfectivo,
  calcularSaldoProducto,
  calcularTotalVenta,
  type TramoBonoItem,
} from '../calculos.servicio'

const tramosMall = TABLA_BONOS['Mall Patio']

// Los tramos del fallback DEBEN ser los de la planilla del cliente: son los que
// se aplican cuando ConfigBono está vacía (ver tramosParaPdv), así que si alguien
// los toca sin tocar el Excel el sistema paga distinto que la planilla y nadie
// se entera. Valores de "Sueldos Feb 2026.xlsx" (fórmulas J5 / J98 / J129).
describe('TABLA_BONOS calza con la planilla del cliente', () => {
  const ESPERADO: Record<string, Array<[number, number]>> = {
    'Mall Patio':          [[400_000, 30_000], [350_000, 19_000], [300_000, 12_000], [250_000, 6_000]],
    'Paseo Independencia': [[350_000, 25_000], [300_000, 19_000], [250_000, 13_000], [200_000, 6_000]],
    'Open Plaza':          [[300_000, 20_000], [250_000, 13_000], [200_000, 8_000],  [160_000, 4_000]],
    'Cugat Rengo':         [[180_000, 12_000], [140_000, 8_000],  [100_000, 4_000]],
    'Cugat Baquedano':     [[180_000, 12_000], [140_000, 8_000],  [100_000, 3_000]],
  }

  it('están las 5 sucursales, sin sobras', () => {
    expect(Object.keys(TABLA_BONOS).sort()).toEqual(Object.keys(ESPERADO).sort())
  })

  for (const [sucursal, tramos] of Object.entries(ESPERADO)) {
    it(`${sucursal}: ${tramos.length} tramos exactos`, () => {
      expect(TABLA_BONOS[sucursal]!.map((t) => [t.umbral, t.bono])).toEqual(tramos)
    })
  }

  // El tramo bajo es lo único que distingue a las dos Cugat en la planilla:
  // Rengo paga 4.000 y Baquedano 3.000. Es fácil de "corregir" por error.
  it('el tramo de 100k distingue Cugat Rengo (4.000) de Cugat Baquedano (3.000)', () => {
    expect(calcularBono(TABLA_BONOS['Cugat Rengo'], 100_000)).toBe(4_000)
    expect(calcularBono(TABLA_BONOS['Cugat Baquedano'], 100_000)).toBe(3_000)
  })
})

describe('calcularBono (tramos de Mall Patio)', () => {
  it('venta 420.000 alcanza el tramo máximo => 30.000', () => {
    expect(calcularBono(tramosMall, 420_000)).toBe(30_000)
  })

  it('venta 360.000 cae en el tramo 350k => 19.000', () => {
    expect(calcularBono(tramosMall, 360_000)).toBe(19_000)
  })

  it('venta 300.000 exacta toma su tramo => 12.000', () => {
    expect(calcularBono(tramosMall, 300_000)).toBe(12_000)
  })

  it('venta 250.000 exacta (umbral inclusive) => 6.000', () => {
    expect(calcularBono(tramosMall, 250_000)).toBe(6_000)
  })

  it('venta 249.000 no llega a ningún umbral => 0', () => {
    expect(calcularBono(tramosMall, 249_000)).toBe(0)
  })

  it('tramos en orden invertido dan el mismo resultado (se ordenan internamente)', () => {
    const invertidos: TramoBonoItem[] = [...tramosMall].reverse()
    expect(calcularBono(invertidos, 420_000)).toBe(30_000)
  })

  it('sin tramos configurados => 0', () => {
    expect(calcularBono([], 999_999)).toBe(0)
    expect(calcularBono(undefined, 999_999)).toBe(0)
  })

  it('venta 0 => 0', () => {
    expect(calcularBono(tramosMall, 0)).toBe(0)
  })
})

describe('calcularADepositar', () => {
  it('efectivo contado 150.000 + retiros 5.000 => 155.000', () => {
    expect(calcularADepositar(150_000, 5_000)).toBe(155_000)
  })

  it('sin retiros deposita todo el efectivo contado', () => {
    expect(calcularADepositar(182_000, 0)).toBe(182_000)
  })
})

describe('calcularDiferencia', () => {
  it('sobrante: contado 105.000 vs esperado 100.000 => +5.000', () => {
    expect(calcularDiferencia(100_000, 105_000)).toBe(5_000)
  })

  it('faltante: contado 95.000 vs esperado 100.000 => -5.000', () => {
    expect(calcularDiferencia(100_000, 95_000)).toBe(-5_000)
  })

  it('caja cuadrada => 0', () => {
    expect(calcularDiferencia(100_000, 100_000)).toBe(0)
  })
})

// ─── Cuadre completo contra la planilla del cliente ──────────────────────────
// Cada caso reproduce una fila real del Excel para garantizar que el sistema
// llegue al mismo número que el negocio calcula a mano.

describe('cuadre de caja (fórmulas del Excel)', () => {
  /** Encadena las cuatro funciones tal como lo hace el cierre de turno. */
  const cuadrar = (d: {
    totalVenta: number; tarjeta: number; transferencia: number
    gastos: number; retiros: number; efectivoContado: number
  }) => {
    const ventaEfectivo = calcularVentaEfectivo(d.totalVenta, d.tarjeta, d.transferencia)
    const esperadoCaja  = calcularEsperadoCaja(ventaEfectivo, d.gastos, d.retiros)
    return {
      ventaEfectivo,
      esperadoCaja,
      diferencia:  calcularDiferencia(esperadoCaja, d.efectivoContado),
      aDepositar:  calcularADepositar(d.efectivoContado, d.retiros),
    }
  }

  // "01 Mall Patio Feb 2026.xlsx", hoja 02: venta 257.500, gastos 15.300
  // (tarjeta), retiros 170.000, entregado 71.800 => diferencia -400, a depositar
  // 241.800 (celdas P26 y P22 de la planilla).
  it('Mall Patio día 02: faltante de 400 y depósito de 241.800', () => {
    const r = cuadrar({
      totalVenta: 257_500, tarjeta: 15_300, transferencia: 0,
      gastos: 0, retiros: 170_000, efectivoContado: 71_800,
    })
    expect(r.diferencia).toBe(-400)
    expect(r.aDepositar).toBe(241_800)
  })

  // Caso que motivó el arreglo: el POS reportaba un faltante de 182.300 porque
  // los retiros del admin no entraban al cálculo. Con ellos incluidos da +1.200,
  // igual que la planilla.
  it('turno con retiro del admin: sobrante de 1.200, no faltante de 182.300', () => {
    const r = cuadrar({
      totalVenta: 248_800, tarjeta: 12_000, transferencia: 1_500,
      gastos: 0, retiros: 183_500, efectivoContado: 53_000,
    })
    expect(r.ventaEfectivo).toBe(235_300)
    expect(r.esperadoCaja).toBe(51_800)
    expect(r.diferencia).toBe(1_200)
    expect(r.aDepositar).toBe(236_500)
  })

  // El mismo turno con el gasto de aseo registrado como gasto en vez de retiro:
  // la diferencia no cambia (la plata salió igual de la caja).
  it('da lo mismo registrar la salida como gasto o como retiro', () => {
    const r = cuadrar({
      totalVenta: 248_800, tarjeta: 12_000, transferencia: 1_500,
      gastos: 3_500, retiros: 180_000, efectivoContado: 53_000,
    })
    expect(r.diferencia).toBe(1_200)
  })

  it('sin gastos ni retiros el esperado es la venta en efectivo', () => {
    const r = cuadrar({
      totalVenta: 200_000, tarjeta: 20_000, transferencia: 0,
      gastos: 0, retiros: 0, efectivoContado: 180_000,
    })
    expect(r.esperadoCaja).toBe(180_000)
    expect(r.diferencia).toBe(0)
  })
})

describe('calcularSaldoProducto', () => {
  it('inicial 100 + ingresos 50 - utilizado 30 => 120', () => {
    expect(calcularSaldoProducto(100, 50, 30)).toBe(120)
  })
})

describe('calcularTotalVenta', () => {
  it('suma precio × cantidad de los detalles => 5.400', () => {
    const detalles = [
      { precioUnitario: 1_200, cantidad: 2 }, // 2.400
      { precioUnitario: 1_000, cantidad: 3 }, // 3.000
    ]
    expect(calcularTotalVenta(detalles)).toBe(5_400)
  })

  it('sin detalles => 0', () => {
    expect(calcularTotalVenta([])).toBe(0)
  })
})
