import prisma from '../config/prisma'
import { ErrorApp, noEncontrado } from '../lib/errores'
import { TABLA_BONOS, type TramoBonoItem } from './calculos.servicio'

// ─── Lectura para cálculo de nómina ──────────────────────────────────────────

/** Mapa pdv_id → tramos de bono activos (desde BD), ordenados de mayor a menor. */
export async function getTramosBonoActivosPorPdv(): Promise<Map<number, TramoBonoItem[]>> {
  const filas = await prisma.configBono.findMany({
    where:   { activo: true },
    orderBy: { umbral_venta: 'desc' },
  })
  const mapa = new Map<number, TramoBonoItem[]>()
  for (const f of filas) {
    const arr = mapa.get(f.pdv_id) ?? []
    arr.push({ umbral: f.umbral_venta, bono: f.monto_bono })
    mapa.set(f.pdv_id, arr)
  }
  return mapa
}

/**
 * Tramos a usar para un PDV: los de BD si existen, si no el fallback por nombre
 * (TABLA_BONOS). Evita que un PDV sin configuración rompa el cálculo.
 *
 * ⚠️ El fallback depende del nombre EXACTO del PDV: si el admin lo renombra y
 * no tiene tramos en ConfigBono, el bono sería 0. Por eso se deja rastro en el
 * log cada vez que un PDV cae al fallback o queda sin tramos.
 */
export function tramosParaPdv(
  mapa: Map<number, TramoBonoItem[]>,
  pdvId: number,
  pdvNombre: string,
): TramoBonoItem[] {
  const deBD = mapa.get(pdvId)
  if (deBD) return deBD

  const fallback = TABLA_BONOS[pdvNombre]
  if (fallback) {
    console.warn(
      `[bonos] PDV #${pdvId} "${pdvNombre}" sin tramos en ConfigBono: usando fallback por nombre. ` +
      `Configura sus tramos en el panel de bonos para no depender del nombre.`,
    )
    return fallback
  }

  console.warn(
    `[bonos] PDV #${pdvId} "${pdvNombre}" sin tramos en ConfigBono ni fallback por nombre: bono = 0. ` +
    `Configura sus tramos en el panel de bonos.`,
  )
  return []
}

// ─── CRUD para el panel admin ─────────────────────────────────────────────────

/**
 * Lista la configuración de bonos agrupada por PDV (solo puntos de venta).
 *
 * Cuando un PDV no tiene filas en ConfigBono devuelve los tramos del fallback
 * (TABLA_BONOS, los de la planilla del cliente) con `origen: 'planilla'`, porque
 * son los que el cálculo está usando de verdad — ver tramosParaPdv(). Mostrar la
 * lista vacía hacía creer al admin que ese punto no pagaba bonos mientras el
 * sistema sí los pagaba. Guardar desde el panel los materializa en la BD.
 */
export async function getConfigBonos() {
  const pdvs = await prisma.pDV.findMany({
    where:   { tipo: 'PUNTO_VENTA' },
    select:  {
      id: true, nombre: true, activo: true,
      config_bonos: {
        orderBy: { umbral_venta: 'desc' },
        select: { id: true, umbral_venta: true, monto_bono: true, activo: true },
      },
    },
    orderBy: { nombre: 'asc' },
  })

  return pdvs.map((p) => {
    if (p.config_bonos.length > 0) {
      return {
        pdvId:     p.id,
        pdvNombre: p.nombre,
        activo:    p.activo,
        origen:    'configurado' as const,
        tramos: p.config_bonos.map((t) => ({
          id:     t.id,
          umbral: t.umbral_venta,
          monto:  t.monto_bono,
          activo: t.activo,
        })),
      }
    }

    const fallback = TABLA_BONOS[p.nombre] ?? []
    return {
      pdvId:     p.id,
      pdvNombre: p.nombre,
      activo:    p.activo,
      // 'planilla' = viene del fallback por nombre; 'sin-configurar' = bono 0.
      origen:    fallback.length > 0 ? ('planilla' as const) : ('sin-configurar' as const),
      tramos: [...fallback]
        .sort((a, b) => b.umbral - a.umbral)
        .map((t) => ({ id: undefined, umbral: t.umbral, monto: t.bono, activo: true })),
    }
  })
}

/**
 * Reemplaza todos los tramos de un PDV por el set recibido (operación idempotente
 * desde la UI: el admin edita la lista completa y guarda).
 */
export async function guardarTramosPdv(
  pdvId: number,
  tramos: Array<{ umbral: number; monto: number }>,
) {
  const pdv = await prisma.pDV.findUnique({ where: { id: pdvId } })
  if (!pdv) throw noEncontrado('Punto de venta')

  // Rechazar umbrales duplicados (el @@unique lo haría, pero damos mejor mensaje).
  const umbrales = tramos.map((t) => t.umbral)
  if (new Set(umbrales).size !== umbrales.length) {
    throw new ErrorApp('No puede haber dos tramos con el mismo umbral de venta')
  }

  await prisma.$transaction(async (tx) => {
    await tx.configBono.deleteMany({ where: { pdv_id: pdvId } })
    if (tramos.length > 0) {
      await tx.configBono.createMany({
        data: tramos.map((t) => ({
          pdv_id:       pdvId,
          umbral_venta: t.umbral,
          monto_bono:   t.monto,
        })),
      })
    }
  })

  return getConfigBonos()
}
