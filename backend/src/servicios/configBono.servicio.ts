import prisma from '../config/prisma'
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
 */
export function tramosParaPdv(
  mapa: Map<number, TramoBonoItem[]>,
  pdvId: number,
  pdvNombre: string,
): TramoBonoItem[] {
  return mapa.get(pdvId) ?? TABLA_BONOS[pdvNombre] ?? []
}

// ─── CRUD para el panel admin ─────────────────────────────────────────────────

/** Lista la configuración de bonos agrupada por PDV (solo puntos de venta). */
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

  return pdvs.map((p) => ({
    pdvId:     p.id,
    pdvNombre: p.nombre,
    activo:    p.activo,
    tramos: p.config_bonos.map((t) => ({
      id:     t.id,
      umbral: t.umbral_venta,
      monto:  t.monto_bono,
      activo: t.activo,
    })),
  }))
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
  if (!pdv) throw new Error('Punto de venta no encontrado')

  // Rechazar umbrales duplicados (el @@unique lo haría, pero damos mejor mensaje).
  const umbrales = tramos.map((t) => t.umbral)
  if (new Set(umbrales).size !== umbrales.length) {
    throw new Error('No puede haber dos tramos con el mismo umbral de venta')
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
