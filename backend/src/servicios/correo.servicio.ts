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
    // Timeouts explícitos: evitan que un SMTP que no responde bloquee el endpoint
    // de publicación de horarios durante el timeout TCP por defecto (varios minutos).
    connectionTimeout: 5_000,
    greetingTimeout:   5_000,
    socketTimeout:     10_000,
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

/**
 * Envía a un nuevo usuario sus credenciales de acceso (RUT + contraseña).
 * @returns true si el correo se envió, false si SMTP no está configurado o falló.
 */
export async function enviarCredencialesUsuario(
  destinatario: { nombre: string; correo: string },
  rut:          string,
  password:     string,
): Promise<boolean> {
  const transporter = crearTransporter()
  if (!transporter) return false // SMTP no configurado

  const from = entorno.smtpFrom ?? `"Nuts 4 You" <${entorno.smtpUser}>`
  const appUrl = entorno.frontendUrl || ''

  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
      <h2 style="color:#111827">Bienvenido/a a Nuts 4 You</h2>
      <p>Hola <strong>${destinatario.nombre}</strong>, se ha creado tu cuenta para acceder al sistema.</p>
      <p>Estas son tus credenciales de acceso:</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr>
          <td style="padding:8px 16px;background:#f3f4f6;font-weight:600;border:1px solid #e5e7eb">Usuario (RUT)</td>
          <td style="padding:8px 16px;border:1px solid #e5e7eb;font-family:monospace">${rut}</td>
        </tr>
        <tr>
          <td style="padding:8px 16px;background:#f3f4f6;font-weight:600;border:1px solid #e5e7eb">Contraseña</td>
          <td style="padding:8px 16px;border:1px solid #e5e7eb;font-family:monospace">${password}</td>
        </tr>
      </table>
      ${appUrl ? `<p><a href="${appUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Ingresar al sistema</a></p>` : ''}
      <p style="color:#6b7280;font-size:13px">Por seguridad, te recomendamos cambiar tu contraseña después del primer ingreso.</p>
    </div>
  `

  try {
    await transporter.sendMail({
      from,
      to:      `"${destinatario.nombre}" <${destinatario.correo}>`,
      subject: '🔑 Tus credenciales de acceso — Nuts 4 You',
      html,
    })
    return true
  } catch {
    return false
  }
}
