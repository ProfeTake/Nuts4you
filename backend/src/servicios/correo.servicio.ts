// ─── Servicio de correo electrónico ──────────────────────────────────────────
// Usa nodemailer con configuración SMTP desde variables de entorno.
// Si SMTP_HOST no está configurado, las funciones retornan sin error.
//
// Variables de entorno requeridas para activar el correo:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM

import nodemailer from 'nodemailer'
import entorno from '../config/entorno'

function crearTransporter() {
  const { smtpHost, smtpPort, smtpUser, smtpPass } = entorno
  if (!smtpHost) return null
  return nodemailer.createTransport({
    host:   smtpHost,
    port:   smtpPort ?? 587,
    secure: (smtpPort ?? 587) === 465,
    auth:   smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
  })
}

export async function enviarCorreoHorario(
  destinatario: { nombre: string; correo?: string | null },
  mes:          string,
  mensajeHtml:  string,
): Promise<void> {
  if (!destinatario.correo) return
  const transporter = crearTransporter()
  if (!transporter) return // SMTP no configurado → silencio

  const from = entorno.smtpFrom ?? `"Nuts 4 You" <${entorno.smtpUser}>`
  const mesLabel = new Date(`${mes}-15`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })

  await transporter.sendMail({
    from,
    to:      `"${destinatario.nombre}" <${destinatario.correo}>`,
    subject: `📅 Tu horario de ${mesLabel} — Nuts 4 You`,
    html:    mensajeHtml,
  })
}
