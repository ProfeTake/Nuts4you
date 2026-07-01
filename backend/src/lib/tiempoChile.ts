/**
 * Helpers de tiempo para la zona horaria de Chile (America/Santiago).
 *
 * Chile alterna entre UTC-4 (horario de verano, oct–mar) y UTC-3 (invierno, abr–sep).
 * Usar un offset fijo de -04:00 desfasa los rangos de fecha 1 hora durante el invierno
 * chileno, incluyendo o excluyendo turnos erróneamente en los reportes.
 *
 * Estos helpers calculan el offset real para cada instante usando la API `Intl`
 * (sin dependencias externas), de modo que los rangos de fecha siempre quedan
 * alineados al día calendario chileno.
 */

const CHILE_TZ = 'America/Santiago'

/**
 * Offset en minutos que la hora local de Chile está adelantada respecto a UTC,
 * para el instante UTC dado. Ej: en verano (UTC-4) devuelve -240.
 */
function offsetChileMinutos(fechaUtc: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: CHILE_TZ,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const partes = Object.fromEntries(
    dtf.formatToParts(fechaUtc).map((p) => [p.type, p.value]),
  ) as Record<string, string>
  // Hora 24 puede venir como "24" a medianoche en algunos entornos → normalizar a 0.
  const hora = partes.hour === '24' ? 0 : Number(partes.hour)
  const comoUtc = Date.UTC(
    Number(partes.year), Number(partes.month) - 1, Number(partes.day),
    hora, Number(partes.minute), Number(partes.second),
  )
  return (comoUtc - fechaUtc.getTime()) / 60_000
}

/**
 * Convierte una hora de pared en Chile (`YYYY-MM-DDTHH:mm:ss.SSS`, sin offset)
 * al instante UTC correspondiente, respetando el DST vigente esa fecha.
 */
function deHoraChileAUtc(fechaLocalSinZona: string): Date {
  // Interpretamos los componentes como si fueran UTC para obtener un instante base.
  const base = new Date(`${fechaLocalSinZona}Z`).getTime()
  // Primera aproximación del offset, luego se refina (cubre los bordes de DST).
  const offset1 = offsetChileMinutos(new Date(base))
  const utc1 = base - offset1 * 60_000
  const offset2 = offsetChileMinutos(new Date(utc1))
  return new Date(base - offset2 * 60_000)
}

/** Rango UTC [00:00:00, 23:59:59.999] del día calendario chileno `fecha` (YYYY-MM-DD). */
export function rangoFechaChile(fecha: string): { inicio: Date; fin: Date } {
  return {
    inicio: deHoraChileAUtc(`${fecha}T00:00:00.000`),
    fin:    deHoraChileAUtc(`${fecha}T23:59:59.999`),
  }
}

/** Rango UTC del mes calendario chileno `mes` (YYYY-MM) + metadatos de días. */
export function rangoMesChile(mes: string): {
  inicio: Date; fin: Date; diasMes: number; diasTranscurridos: number
} {
  const [anio, mesNum] = mes.split('-').map(Number)
  const diasMes = new Date(anio, mesNum, 0).getDate()
  const inicio = deHoraChileAUtc(`${mes}-01T00:00:00.000`)
  const fin    = deHoraChileAUtc(`${mes}-${String(diasMes).padStart(2, '0')}T23:59:59.999`)

  const hoyChile  = fechaHoyChile()
  const mesActual = hoyChile.slice(0, 7)
  const diaActual = Number(hoyChile.slice(8, 10))
  const diasTranscurridos = mesActual === mes ? diaActual : diasMes

  return { inicio, fin, diasMes, diasTranscurridos }
}

/** Fecha de hoy en Chile como `YYYY-MM-DD`. */
export function fechaHoyChile(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CHILE_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/** Fecha chilena `n` días antes de hoy, como `YYYY-MM-DD`. */
export function fechaHaceNDiasChile(n: number): string {
  const hoy = new Date(`${fechaHoyChile()}T12:00:00Z`)
  hoy.setUTCDate(hoy.getUTCDate() - n)
  return hoy.toISOString().slice(0, 10)
}
