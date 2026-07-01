// Includes de Prisma compartidos entre usuarios.servicio.ts y rrhh.servicio.ts
// para evitar declarar el mismo include de `Usuario` en múltiples lugares (OPT-09).

export const usuarioIncludeBasico = {
  pdv: { select: { id: true, nombre: true } },
  turnos: {
    orderBy: { fecha_apertura: 'desc' as const },
    take: 1,
    select: { id: true, fecha_apertura: true },
  },
}

// Incluye además el rol y el PDV del último turno trabajado (para mostrar el PDV
// real de un vendedor rotativo, que puede diferir del PDV asignado en el perfil).
export const usuarioIncludeConUltimoPdv = {
  rol: { select: { nombre: true } },
  pdv: { select: { id: true, nombre: true } },
  turnos: {
    orderBy: { fecha_apertura: 'desc' as const },
    take: 1,
    select: {
      id: true,
      fecha_apertura: true,
      pdv: { select: { id: true, nombre: true } },
    },
  },
}
