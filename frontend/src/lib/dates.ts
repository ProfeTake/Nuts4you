/**
 * Helpers de fecha para Chile.
 * Zona horaria: America/Santiago
 * Formato display: dd/MM/yyyy
 */
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

/** Formatea una fecha ISO a dd/MM/yyyy */
export function formatFecha(fechaISO: string): string {
  return format(parseISO(fechaISO), 'dd/MM/yyyy', { locale: es })
}

/** Formatea fecha + hora: dd/MM/yyyy HH:mm */
export function formatFechaHora(fechaISO: string): string {
  return format(parseISO(fechaISO), 'dd/MM/yyyy HH:mm', { locale: es })
}

/** Retorna la fecha actual en ISO (para enviar al backend en UTC) */
export function hoy(): string {
  return new Date().toISOString()
}

/** Formatea hora corta: HH:mm */
export function formatHora(fechaISO: string): string {
  return format(parseISO(fechaISO), 'HH:mm', { locale: es })
}
