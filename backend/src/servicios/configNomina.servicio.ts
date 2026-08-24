import prisma from '../config/prisma'
import { ErrorApp } from '../lib/errores'

/**
 * Parámetros globales del cálculo de sueldos (tabla `ConfigNomina`, fila única).
 *
 * Replican el cierre de período de la planilla del cliente ("Sueldos Feb
 * 2026.xlsx", hoja PAGO TURNOS), donde cada fila es un turno:
 *
 *   K{n}  = I{n} + J{n} + 3.000 × E{n}
 *           ↑pago diario (P13)  ↑bono (tramos ConfigBono)  ↑"Adicional"/Extra
 *
 *   K162 = SUBTOTAL(K5:K159) + IF(H162 < -1000, H162, 0) + H163 - H164
 *                               ↑descuento de caja        ↑adicional ↑cotizaciones
 *
 * donde H162 es la SUMA de todas las diferencias de caja del período (con signo:
 * los sobrantes compensan los faltantes). O sea: al vendedor se le descuenta solo
 * si el neto del período queda peor que −$1.000; descuadres menores se perdonan.
 *
 * `pago_diario_base` (P13) y `valor_extra` (el 3.000) son globales; el
 * "Adicional" y las "Cotizaciones" se cargan al liquidar y quedan congelados en
 * cada PagoPersonal, porque cambian de período a período.
 */

/** Valores por defecto si aún no se configuró nada (los del Excel del cliente). */
export const TOLERANCIA_FALTANTE_DEFECTO = 1000
export const PAGO_DIARIO_BASE_DEFECTO    = 28000
export const VALOR_EXTRA_DEFECTO         = 3000
export const COTIZACIONES_DEFECTO        = 0

/** Fila única de configuración: se usa id = 1 para no depender de un findFirst. */
const ID_CONFIG = 1

/** Config de sueldos vigente, con todos los parámetros del cálculo. */
export interface ConfigSueldos {
  pagoDiarioBase:      number
  valorExtra:          number
  cotizacionesDefault: number
  toleranciaFaltante:  number
}

const CONFIG_DEFECTO: ConfigSueldos = {
  pagoDiarioBase:      PAGO_DIARIO_BASE_DEFECTO,
  valorExtra:          VALOR_EXTRA_DEFECTO,
  cotizacionesDefault: COTIZACIONES_DEFECTO,
  toleranciaFaltante:  TOLERANCIA_FALTANTE_DEFECTO,
}

/**
 * Toda la config de sueldos en una sola query. Es la que deben usar los
 * servicios de pago: pedir solo la tolerancia dejaba el pago diario y el valor
 * del extra sin resolver.
 */
export async function getConfigSueldos(): Promise<ConfigSueldos> {
  const config = await prisma.configNomina.findUnique({ where: { id: ID_CONFIG } })
  if (!config) return CONFIG_DEFECTO
  return {
    pagoDiarioBase:      config.pago_diario_base,
    valorExtra:          config.valor_extra,
    cotizacionesDefault: config.cotizaciones_default,
    toleranciaFaltante:  config.tolerancia_faltante,
  }
}

/** Tolerancia de caja vigente en CLP (siempre ≥ 0). */
export async function getToleranciaFaltante(): Promise<number> {
  return (await getConfigSueldos()).toleranciaFaltante
}

/**
 * Pago por turno de un vendedor: su override si lo tiene, o el valor global.
 *
 * `Usuario.pago_diario` es nullable a propósito — null significa "el que diga la
 * config", así que cambiar P13 en el panel afecta a todos los que no tienen un
 * trato distinto. Nunca leer `usuario.pago_diario` directo.
 *
 * @param override - `Usuario.pago_diario` (null = sin trato particular)
 * @param base     - `ConfigSueldos.pagoDiarioBase` (planilla, celda P13)
 */
export function pagoDiarioDe(override: number | null | undefined, base: number): number {
  return override ?? base
}

/**
 * Monto en CLP del "Adicional"/Extra de un turno (planilla, columna E).
 *
 * El extra se guarda en décimas (5 = 0,5) para mantener todo en enteros; los
 * valores que usa el cliente (0 · 0,5 · 1 · 1,5) con $3.000 la unidad dan montos
 * exactos (0 · 1.500 · 3.000 · 4.500), así que el redondeo nunca actúa en la
 * práctica: está por si alguien configura un valor_extra impar.
 *
 * @param extraDecimas - `TurnoCaja.extra_decimas`
 * @param valorExtra   - `ConfigSueldos.valorExtra` (el 3.000 de la planilla)
 */
export function calcularMontoExtra(extraDecimas: number, valorExtra: number): number {
  return Math.round((extraDecimas * valorExtra) / 10)
}

/**
 * Descuento por descuadre de caja de un período, con la regla del Excel.
 *
 * @param diferencias - Diferencias de caja de los turnos del período CON SIGNO
 *                      (positivo = sobrante, negativo = faltante).
 * @param tolerancia  - Umbral en CLP; ver getConfigSueldos().
 * @returns Monto a descontar en CLP (0 si el neto está dentro de la tolerancia).
 */
export function calcularDescuentoCaja(diferencias: number[], tolerancia: number): number {
  const neto = diferencias.reduce((suma, d) => suma + d, 0)
  return neto < -tolerancia ? -neto : 0
}

/**
 * Total a pagar de un período, con los 6 términos de la planilla (celda K162).
 *
 * Se centraliza acá para que los tres consumidores (nómina informativa, pago por
 * rango y pago desde caja) no puedan divergir en el orden de los signos.
 */
export function calcularTotalPago(p: {
  montoBase:          number
  montoBonos:         number
  montoExtras:        number
  montoDescuentos:    number
  montoAdicional?:    number
  montoCotizaciones?: number
}): number {
  return (
    p.montoBase + p.montoBonos + p.montoExtras
    - p.montoDescuentos
    + (p.montoAdicional ?? 0)
    - (p.montoCotizaciones ?? 0)
  )
}

// ─── CRUD para el panel admin ─────────────────────────────────────────────────

export async function getConfigNomina(): Promise<ConfigSueldos> {
  return getConfigSueldos()
}

/** Topes de cordura: evitan que un cero de más se convierta en un sueldo absurdo. */
const TOPES: Record<keyof ConfigSueldos, { max: number; etiqueta: string }> = {
  pagoDiarioBase:      { max: 1_000_000, etiqueta: 'El pago diario base' },
  valorExtra:          { max:   100_000, etiqueta: 'El valor del adicional' },
  cotizacionesDefault: { max:   500_000, etiqueta: 'Las cotizaciones' },
  toleranciaFaltante:  { max:   100_000, etiqueta: 'La tolerancia de caja' },
}

export async function guardarConfigNomina(input: Partial<ConfigSueldos>): Promise<ConfigSueldos> {
  const actual = await getConfigSueldos()
  const nueva: ConfigSueldos = { ...actual, ...input }

  for (const clave of Object.keys(TOPES) as (keyof ConfigSueldos)[]) {
    const valor = nueva[clave]
    const { max, etiqueta } = TOPES[clave]
    if (!Number.isInteger(valor) || valor < 0) {
      throw new ErrorApp(`${etiqueta} debe ser un monto en pesos mayor o igual a 0`)
    }
    if (valor > max) {
      throw new ErrorApp(`${etiqueta} no puede superar $${max.toLocaleString('es-CL')}`)
    }
  }

  const fila = {
    pago_diario_base:     nueva.pagoDiarioBase,
    valor_extra:          nueva.valorExtra,
    cotizaciones_default: nueva.cotizacionesDefault,
    tolerancia_faltante:  nueva.toleranciaFaltante,
  }
  await prisma.configNomina.upsert({
    where:  { id: ID_CONFIG },
    update: fila,
    create: { id: ID_CONFIG, ...fila },
  })
  return nueva
}
