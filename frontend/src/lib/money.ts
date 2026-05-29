/**
 * Helpers para formateo de dinero CLP.
 * Chile no usa decimales — todo en pesos enteros.
 */

/** Formatea un monto CLP con separador de miles y signo $ */
export function formatearCLP(monto: number): string {
  return `$${monto.toLocaleString('es-CL')}`
}

/** Parsea un string CLP ("$1.500") a número entero */
export function parseCLP(texto: string): number {
  const limpio = texto.replace(/[$.\s]/g, '')
  const valor = parseInt(limpio, 10)
  return isNaN(valor) ? 0 : valor
}
