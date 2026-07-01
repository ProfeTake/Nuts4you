import bcrypt from 'bcryptjs'
import prisma from '../config/prisma'
import type { CrearUsuarioInput, EditarUsuarioInput, EstadoUsuarioInput } from '../validaciones/usuarios.schema'
import { enviarCredencialesUsuario } from './correo.servicio'
import { usuarioIncludeConUltimoPdv } from './shared/usuario.query'

function formatearUsuario(u: {
  id: number
  rut: string
  nombre: string
  email: string | null
  activo: boolean
  pago_diario: number
  rol: { nombre: string }
  pdv: { id: number; nombre: string } | null
  turnos: { id: number; fecha_apertura: Date; pdv?: { id: number; nombre: string } | null }[]
}) {
  // PDV mostrado: PDV del último turno trabajado (no el del perfil, que es null para vendedores rotativos)
  const pdvUltimoTurno = u.turnos[0]?.pdv ?? null
  return {
    id:           u.id,
    rut:          u.rut,
    nombre:       u.nombre,
    email:        u.email,
    rol:          u.rol.nombre,
    pdvId:        pdvUltimoTurno?.id ?? u.pdv?.id ?? null,
    pdvNombre:    pdvUltimoTurno?.nombre ?? u.pdv?.nombre ?? null,
    activo:       u.activo,
    pagoDiario:   u.pago_diario,
    ultimoTurno:  u.turnos[0]?.fecha_apertura.toISOString() ?? null,
  }
}

export async function getUsuarios() {
  const usuarios = await prisma.usuario.findMany({
    include: usuarioIncludeConUltimoPdv,
    orderBy: [{ rol: { nombre: 'asc' } }, { nombre: 'asc' }],
  })
  return usuarios.map(formatearUsuario)
}

const limpiarRut = (rut: string) => rut.replace(/\./g, '').trim()

export async function crearUsuario(data: CrearUsuarioInput) {
  const rut = limpiarRut(data.rut)
  const existente = await prisma.usuario.findUnique({ where: { rut } })
  if (existente) throw new Error(`Ya existe un usuario con el RUT ${rut}`)

  const email = data.email.trim().toLowerCase()
  const emailEnUso = await prisma.usuario.findUnique({ where: { email } })
  if (emailEnUso) throw new Error(`El correo ${email} ya está en uso por otro usuario`)

  const rolDb = await prisma.rol.findUnique({ where: { nombre: data.rol } })
  if (!rolDb) throw new Error(`Rol ${data.rol} no encontrado`)

  const hash = await bcrypt.hash(data.password, 10)

  const usuario = await prisma.usuario.create({
    data: {
      rut,
      nombre:        data.nombre,
      email,
      password_hash: hash,
      rol_id:        rolDb.id,
      pdv_id:        data.pdvId ?? null,
      pago_diario:   data.pagoDiario,
    },
    include: usuarioIncludeConUltimoPdv,
  })

  // Envía las credenciales por correo (RUT + contraseña en texto, única vez).
  // No bloquea la creación: si SMTP no está configurado o falla, se informa en la respuesta.
  const correoEnviado = await enviarCredencialesUsuario(
    { nombre: usuario.nombre, correo: email },
    rut,
    data.password,
  )

  return { ...formatearUsuario(usuario), correoEnviado }
}

export async function editarUsuario(id: number, data: EditarUsuarioInput) {
  const updateData: Record<string, unknown> = {}

  if (data.rut) {
    const rut = limpiarRut(data.rut)
    const existente = await prisma.usuario.findUnique({ where: { rut } })
    if (existente && existente.id !== id) throw new Error(`El RUT ${rut} ya está en uso por otro usuario`)
    updateData.rut = rut
  }
  if (data.nombre)   updateData.nombre    = data.nombre
  if (data.email) {
    const email = data.email.trim().toLowerCase()
    const emailEnUso = await prisma.usuario.findUnique({ where: { email } })
    if (emailEnUso && emailEnUso.id !== id) throw new Error(`El correo ${email} ya está en uso por otro usuario`)
    updateData.email = email
  }
  if (data.password) updateData.password_hash = await bcrypt.hash(data.password, 10)
  if (data.pdvId !== undefined) updateData.pdv_id = data.pdvId
  if (data.pagoDiario !== undefined) updateData.pago_diario = data.pagoDiario
  if (data.rol) {
    const rolDb = await prisma.rol.findUnique({ where: { nombre: data.rol } })
    if (!rolDb) throw new Error(`Rol ${data.rol} no encontrado`)
    updateData.rol_id = rolDb.id
  }

  const usuario = await prisma.usuario.update({
    where: { id },
    data:  updateData,
    include: usuarioIncludeConUltimoPdv,
  })

  return formatearUsuario(usuario)
}

export async function cambiarEstadoUsuario(id: number, data: EstadoUsuarioInput) {
  const usuario = await prisma.usuario.update({
    where: { id },
    data:  { activo: data.activo },
    include: usuarioIncludeConUltimoPdv,
  })
  return formatearUsuario(usuario)
}

export async function eliminarUsuario(id: number, solicitanteId: number) {
  if (id === solicitanteId) throw new Error('No puedes eliminar tu propia cuenta')

  const usuario = await prisma.usuario.findUniqueOrThrow({
    where: { id },
    include: { rol: { select: { nombre: true } } },
  })

  await prisma.$transaction(async (tx) => {
    // El conteo de admins va dentro de la transacción para evitar una race condition:
    // dos eliminaciones simultáneas no deben poder dejar al sistema sin administrador.
    if (usuario.rol.nombre === 'ADMIN') {
      const totalAdmins = await tx.usuario.count({
        where: { rol: { nombre: 'ADMIN' }, activo: true },
      })
      if (totalAdmins <= 1) throw new Error('No se puede eliminar el único administrador activo del sistema')
    }

    // Desvincula el usuario de los registros históricos (se conservan)
    await tx.turnoCaja.updateMany({
      where: { usuario_id: id },
      data:  { usuario_id: null },
    })
    await tx.retiroTurno.updateMany({
      where: { usuario_id: id },
      data:  { usuario_id: null },
    })
    await tx.solicitud.updateMany({
      where: { usuario_id: id },
      data:  { usuario_id: null },
    })

    // Elimina datos de planificación (no son histórico financiero)
    await tx.turnoPlaneado.deleteMany({ where: { usuario_id: id } })

    // Elimina el usuario
    await tx.usuario.delete({ where: { id } })
  })

  return { eliminado: id, nombre: usuario.nombre }
}
