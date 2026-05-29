import bcrypt from 'bcryptjs'
import prisma from '../config/prisma'
import type { CrearUsuarioInput, EditarUsuarioInput, EstadoUsuarioInput } from '../validaciones/usuarios.schema'

function formatearUsuario(u: {
  id: number
  rut: string
  nombre: string
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
    include: {
      rol: { select: { nombre: true } },
      pdv: { select: { id: true, nombre: true } },
      turnos: {
        orderBy: { fecha_apertura: 'desc' },
        take: 1,
        select: {
          id: true,
          fecha_apertura: true,
          pdv: { select: { id: true, nombre: true } },
        },
      },
    },
    orderBy: [{ rol: { nombre: 'asc' } }, { nombre: 'asc' }],
  })
  return usuarios.map(formatearUsuario)
}

const limpiarRut = (rut: string) => rut.replace(/\./g, '').trim()

export async function crearUsuario(data: CrearUsuarioInput) {
  const rut = limpiarRut(data.rut)
  const existente = await prisma.usuario.findUnique({ where: { rut } })
  if (existente) throw new Error(`Ya existe un usuario con el RUT ${rut}`)

  const rolDb = await prisma.rol.findUnique({ where: { nombre: data.rol } })
  if (!rolDb) throw new Error(`Rol ${data.rol} no encontrado`)

  const hash = await bcrypt.hash(data.password, 10)

  const usuario = await prisma.usuario.create({
    data: {
      rut,
      nombre:        data.nombre,
      password_hash: hash,
      rol_id:        rolDb.id,
      pdv_id:        data.pdvId ?? null,
      pago_diario:   data.pagoDiario,
    },
    include: {
      rol:   { select: { nombre: true } },
      pdv:   { select: { id: true, nombre: true } },
      turnos: { orderBy: { fecha_apertura: 'desc' }, take: 1, select: { id: true, fecha_apertura: true } },
    },
  })

  return formatearUsuario(usuario)
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
    include: {
      rol:   { select: { nombre: true } },
      pdv:   { select: { id: true, nombre: true } },
      turnos: { orderBy: { fecha_apertura: 'desc' }, take: 1, select: { id: true, fecha_apertura: true } },
    },
  })

  return formatearUsuario(usuario)
}

export async function cambiarEstadoUsuario(id: number, data: EstadoUsuarioInput) {
  const usuario = await prisma.usuario.update({
    where: { id },
    data:  { activo: data.activo },
    include: {
      rol:   { select: { nombre: true } },
      pdv:   { select: { id: true, nombre: true } },
      turnos: { orderBy: { fecha_apertura: 'desc' }, take: 1, select: { id: true, fecha_apertura: true } },
    },
  })
  return formatearUsuario(usuario)
}

export async function eliminarUsuario(id: number, solicitanteId: number) {
  if (id === solicitanteId) throw new Error('No puedes eliminar tu propia cuenta')

  const usuario = await prisma.usuario.findUniqueOrThrow({
    where: { id },
    include: { rol: { select: { nombre: true } } },
  })

  if (usuario.rol.nombre === 'ADMIN') {
    const totalAdmins = await prisma.usuario.count({
      where: { rol: { nombre: 'ADMIN' }, activo: true },
    })
    if (totalAdmins <= 1) throw new Error('No se puede eliminar el único administrador activo del sistema')
  }

  await prisma.$transaction(async (tx) => {
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
