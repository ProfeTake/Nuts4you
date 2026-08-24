/**
 * Backfill único: copia el snapshot JSON `TurnoCaja.venta_detalle` de los turnos ya
 * cerrados a la tabla normalizada `VentaTurnoItem`.
 *
 * Los cierres anteriores a esa tabla solo tienen el JSON, así que cualquier reporte
 * por producto/período los dejaría fuera. Los cierres nuevos escriben ambas cosas en
 * la misma transacción (ver pos.servicio.cerrarTurno).
 *
 * Es idempotente: reemplaza las líneas del turno que procesa, así que se puede
 * correr de nuevo sin duplicar. No modifica el JSON ni ningún otro dato.
 *
 * Uso (una vez, después de aplicar la migración):
 *   npx ts-node scripts/backfill-venta-items.ts          # aplica
 *   npx ts-node scripts/backfill-venta-items.ts --dry    # solo informa
 */
import prisma from '../src/config/prisma'
import { diaChileDe } from '../src/lib/tiempoChile'

interface LineaJson { productoId: number; cantidad: number; precioUnitario: number }

const soloInforma = process.argv.includes('--dry')

async function main() {
  // El filtro por JSON no nulo se hace en código: los filtros JSON de Prisma
  // (DbNull/JsonNull) complican más de lo que ayudan para un backfill puntual.
  const turnos = await prisma.turnoCaja.findMany({
    where:   { estado: 'CERRADO' },
    select:  { id: true, fecha_apertura: true, venta_detalle: true, pdv: { select: { nombre: true } } },
    orderBy: { id: 'asc' },
  })

  // Los productos borrados romperían la FK: se saltan esas líneas avisando.
  const productos = new Set((await prisma.producto.findMany({ select: { id: true } })).map((p) => p.id))

  let insertadas = 0
  let saltadas   = 0

  for (const t of turnos) {
    const lineas = (Array.isArray(t.venta_detalle) ? t.venta_detalle : []) as unknown as LineaJson[]
    const validas = lineas.filter((l) => {
      const ok = l && typeof l.productoId === 'number' && productos.has(l.productoId) && l.cantidad > 0
      if (!ok) saltadas++
      return ok
    })
    if (validas.length === 0) {
      console.log(`Turno #${t.id} (${t.pdv.nombre}): sin líneas válidas en el JSON`)
      continue
    }

    // Una línea por producto: si el JSON trae el mismo producto repetido, se suma.
    const porProducto = new Map<number, { cantidad: number; precio: number }>()
    for (const l of validas) {
      const acc = porProducto.get(l.productoId)
      if (acc) acc.cantidad += l.cantidad
      else porProducto.set(l.productoId, { cantidad: l.cantidad, precio: l.precioUnitario ?? 0 })
    }

    const fecha = new Date(`${diaChileDe(t.fecha_apertura)}T00:00:00.000Z`)
    console.log(
      `Turno #${t.id} (${t.pdv.nombre}, ${diaChileDe(t.fecha_apertura)}): ${porProducto.size} línea(s)` +
      `${soloInforma ? ' — dry run, no se escribe' : ''}`,
    )
    if (soloInforma) { insertadas += porProducto.size; continue }

    await prisma.$transaction(async (tx) => {
      await tx.ventaTurnoItem.deleteMany({ where: { turno_id: t.id } })
      await tx.ventaTurnoItem.createMany({
        data: [...porProducto].map(([producto_id, v]) => ({
          turno_id: t.id, producto_id, cantidad: v.cantidad, precio_unitario: v.precio, fecha,
        })),
      })
    })
    insertadas += porProducto.size
  }

  const total = await prisma.ventaTurnoItem.count()
  console.log(
    `\n${soloInforma ? 'Se insertarían' : 'Insertadas'} ${insertadas} línea(s) de ${turnos.length} turno(s) cerrado(s).` +
    `${saltadas > 0 ? ` ${saltadas} línea(s) saltada(s) (producto inexistente o cantidad 0).` : ''}` +
    `\nTotal en VentaTurnoItem: ${total}`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('Falló el backfill:', e); process.exit(1) })
