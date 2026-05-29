/**
 * Utilidades para RUT chileno.
 * Formato almacenado: XXXXXXXX-D (sin puntos, con guión).
 * Ejemplo: 19590231-3
 */

/**
 * Autoformatea el RUT mientras el usuario escribe.
 * - Solo acepta dígitos y K (dígito verificador).
 * - Inserta automáticamente el guión antes del último carácter.
 * - El usuario no necesita escribir puntos ni guión.
 *
 * Ejemplos de flujo de escritura:
 *   "1"         → "1"
 *   "19"        → "1-9"
 *   "1959023"   → "195902-3"
 *   "19590231"  → "1959023-1"
 *   "195902313" → "19590231-3"  ← resultado final correcto
 *   "1959023K"  → "1959023-K"
 */
export function autoFormatRUT(valor: string): string {
  // Permitir solo dígitos y K
  const limpio = valor.replace(/[^0-9kK]/gi, '').toUpperCase();
  if (limpio.length <= 1) return limpio;
  // Último carácter = dígito verificador
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

/** Quita puntos del RUT para normalizar al formato de BD */
export function limpiarRUT(rut: string): string {
  return rut.replace(/\./g, '').trim();
}
