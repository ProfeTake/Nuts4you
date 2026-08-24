/**
 * Tests de tiempoChile — bordes de día/mes DST-aware (R4/A6).
 *
 * El bug que motiva A6: usar offset fijo -04:00 desfasa los bordes 1h en la mitad
 * del año (DST chileno), metiendo/sacando turnos del día o mes equivocado. Estos
 * tests fijan que los bordes correspondan a la medianoche calendario chilena real
 * en ambas estaciones, y que el offset NO sea fijo entre verano e invierno.
 * Ejecutar con: npm test
 */
import { describe, it, expect } from 'vitest'
import { rangoFechaChile, rangoMesChile, fechaHoyChile } from '../tiempoChile'

const dtf = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago', hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})
function partesSantiago(d: Date): Record<string, string> {
  return Object.fromEntries(dtf.formatToParts(d).map((p) => [p.type, p.value]))
}
const fechaDe = (p: Record<string, string>) => `${p.year}-${p.month}-${p.day}`

describe('rangoFechaChile — bordes de día en zona Chile', () => {
  it.each(['2026-01-15', '2026-06-15'])('inicio de %s es la medianoche chilena de ese día', (f) => {
    const p = partesSantiago(rangoFechaChile(f).inicio)
    expect(fechaDe(p)).toBe(f)
    expect(['00', '24']).toContain(p.hour) // Node/ICU puede emitir "24" a medianoche
    expect(p.minute).toBe('00')
    expect(p.second).toBe('00')
  })

  it.each(['2026-01-15', '2026-06-15'])('fin de %s es 23:59:59 chileno de ese día', (f) => {
    const p = partesSantiago(rangoFechaChile(f).fin)
    expect(fechaDe(p)).toBe(f)
    expect(p.hour).toBe('23')
    expect(p.minute).toBe('59')
    expect(p.second).toBe('59')
  })

  it('el offset NO es fijo: verano e invierno dan bordes UTC distintos (DST)', () => {
    const verano   = rangoFechaChile('2026-01-15').inicio.getUTCHours()
    const invierno = rangoFechaChile('2026-06-15').inicio.getUTCHours()
    // Con offset fijo ambos serían iguales; DST-aware difieren en 1h.
    expect(verano).not.toBe(invierno)
  })
})

describe('rangoMesChile — bordes de mes en zona Chile', () => {
  it('inicio es la medianoche chilena del día 1 del mes', () => {
    const p = partesSantiago(rangoMesChile('2026-06').inicio)
    expect(fechaDe(p)).toBe('2026-06-01')
    expect(['00', '24']).toContain(p.hour)
  })

  it('fin cae el último día del mes a las 23:59:59 chileno', () => {
    const { fin, diasMes } = rangoMesChile('2026-06')
    const p = partesSantiago(fin)
    expect(diasMes).toBe(30)
    expect(fechaDe(p)).toBe('2026-06-30')
    expect(p.hour).toBe('23')
  })
})

describe('fechaHoyChile', () => {
  it('devuelve formato YYYY-MM-DD', () => {
    expect(fechaHoyChile()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
