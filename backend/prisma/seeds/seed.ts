import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // ─── Roles ───────────────────────────────────────────────────────────────────
  const roles = ['ADMIN', 'SUPERVISOR', 'BODEGUERO', 'VENDEDOR']
  for (const nombre of roles) {
    await prisma.rol.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    })
  }
  console.log('✓ Roles:', roles.join(', '))

  // ─── Sucursales (PDV) ─────────────────────────────────────────────────────────
  const sucursalesData = [
    { nombre: 'Bodega Central',        tipo: 'BODEGA'      as const },
    { nombre: 'Mall Patio',            tipo: 'PUNTO_VENTA' as const },
    { nombre: 'Paseo Independencia',   tipo: 'PUNTO_VENTA' as const },
    { nombre: 'Open Plaza',            tipo: 'PUNTO_VENTA' as const },
    { nombre: 'Cugat Rengo',           tipo: 'PUNTO_VENTA' as const },
    { nombre: 'Cugat Baquedano',       tipo: 'PUNTO_VENTA' as const },
  ]
  // Usamos el nombre como clave natural (no asumimos que el id autoincremental
  // coincida con el índice del array, lo cual rompería un re-seed sobre una BD
  // con IDs distintos). PDV no tiene @@unique en nombre, así que buscamos primero.
  const sucursales: Array<{ id: number; nombre: string }> = []
  for (const s of sucursalesData) {
    const existente = await prisma.pDV.findFirst({ where: { nombre: s.nombre } })
    const pdv = existente
      ? await prisma.pDV.update({ where: { id: existente.id }, data: { tipo: s.tipo } })
      : await prisma.pDV.create({ data: { nombre: s.nombre, tipo: s.tipo } })
    sucursales.push(pdv)
  }
  console.log('✓ Sucursales:', sucursalesData.map((s) => s.nombre).join(', '))

  // ─── Configuración de bonos por sucursal (P6) ────────────────────────────────
  // Fuente: "Sueldos Feb 2026.xlsx". Idempotente: limpia y recrea por PDV.
  const bonosPorSucursal: Record<string, Array<{ umbral: number; monto: number }>> = {
    'Mall Patio':          [{ umbral: 400000, monto: 30000 }, { umbral: 350000, monto: 19000 }, { umbral: 300000, monto: 12000 }, { umbral: 250000, monto: 6000 }],
    'Paseo Independencia': [{ umbral: 350000, monto: 25000 }, { umbral: 300000, monto: 19000 }, { umbral: 250000, monto: 13000 }, { umbral: 200000, monto: 6000 }],
    'Open Plaza':          [{ umbral: 300000, monto: 20000 }, { umbral: 250000, monto: 13000 }, { umbral: 200000, monto: 8000 }, { umbral: 160000, monto: 4000 }],
    'Cugat Rengo':         [{ umbral: 180000, monto: 12000 }, { umbral: 140000, monto: 8000 }, { umbral: 100000, monto: 4000 }],
    'Cugat Baquedano':     [{ umbral: 180000, monto: 12000 }, { umbral: 140000, monto: 8000 }, { umbral: 100000, monto: 3000 }],
  }
  for (const pdv of sucursales) {
    const tramos = bonosPorSucursal[pdv.nombre]
    if (!tramos) continue
    await prisma.configBono.deleteMany({ where: { pdv_id: pdv.id } })
    await prisma.configBono.createMany({
      data: tramos.map((t) => ({ pdv_id: pdv.id, umbral_venta: t.umbral, monto_bono: t.monto })),
    })
  }
  console.log('✓ Config de bonos sembrada para', Object.keys(bonosPorSucursal).length, 'sucursales')

  // ─── Categorías ───────────────────────────────────────────────────────────────
  const categoriaNames = ['Mezclas', 'Paquetes', 'Promos', 'Líquidos', 'Helados', 'Otros']
  for (const nombre of categoriaNames) {
    await prisma.categoria.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    })
  }
  console.log('✓ Categorías:', categoriaNames.join(', '))

  // ─── Productos ───────────────────────────────────────────────────────────────
  const catMezclas  = await prisma.categoria.findUniqueOrThrow({ where: { nombre: 'Mezclas' } })
  const catPaquetes = await prisma.categoria.findUniqueOrThrow({ where: { nombre: 'Paquetes' } })
  const catPromos   = await prisma.categoria.findUniqueOrThrow({ where: { nombre: 'Promos' } })
  const catLiquidos = await prisma.categoria.findUniqueOrThrow({ where: { nombre: 'Líquidos' } })
  const catHelados  = await prisma.categoria.findUniqueOrThrow({ where: { nombre: 'Helados' } })

  const productosData = [
    // Mezclas (materia prima)
    { nombre: 'Mezcla Maní',          categoriaId: catMezclas.id,  precioVenta:    0, costo: 600  },
    { nombre: 'Mezcla Almendras',      categoriaId: catMezclas.id,  precioVenta:    0, costo: 1200 },
    { nombre: 'Mezcla Nueces',         categoriaId: catMezclas.id,  precioVenta:    0, costo: 1500 },
    { nombre: 'Mezcla Promo',          categoriaId: catMezclas.id,  precioVenta:    0, costo: 900  },
    { nombre: 'Mezcla Helado',         categoriaId: catMezclas.id,  precioVenta:    0, costo: 1000 },
    // Paquetes
    { nombre: 'Paquetes Maní',         categoriaId: catPaquetes.id, precioVenta:  800, costo: 350  },
    { nombre: 'Paquetes Almendras',    categoriaId: catPaquetes.id, precioVenta: 1000, costo: 450  },
    { nombre: 'Paquetes Nueces',       categoriaId: catPaquetes.id, precioVenta: 1000, costo: 450  },
    // Promos
    { nombre: 'Paquetes Promo',        categoriaId: catPromos.id,   precioVenta: 1500, costo: 700  },
    // Líquidos
    { nombre: 'Agua Mineral Con Gas',  categoriaId: catLiquidos.id, precioVenta:  800, costo: 400  },
    { nombre: 'Agua Mineral Sin Gas',  categoriaId: catLiquidos.id, precioVenta:  800, costo: 400  },
    { nombre: 'Energéticas',           categoriaId: catLiquidos.id, precioVenta: 1500, costo: 900  },
    { nombre: 'Bebidas',               categoriaId: catLiquidos.id, precioVenta: 1500, costo: 700  },
    { nombre: 'Jugos Kapo',            categoriaId: catLiquidos.id, precioVenta:  500, costo: 200  },
    // Helados
    { nombre: 'Helados',               categoriaId: catHelados.id,  precioVenta: 1000, costo: 500  },
  ]
  for (const p of productosData) {
    await prisma.producto.upsert({
      where: { id: productosData.indexOf(p) + 1 },
      update: { nombre: p.nombre, precio_venta: p.precioVenta, costo: p.costo },
      create: {
        nombre: p.nombre,
        categoria_id: p.categoriaId,
        precio_venta: p.precioVenta,
        costo: p.costo,
      },
    })
  }
  console.log('✓ Productos:', productosData.length)

  // ─── Inventario inicial Bodega Central ───────────────────────────────────────
  const bodegaCentral = sucursales.find((s) => s.nombre === 'Bodega Central')!
  const todosProductos = await prisma.producto.findMany()
  for (const prod of todosProductos) {
    await prisma.inventario.upsert({
      where: { pdv_id_producto_id: { pdv_id: bodegaCentral.id, producto_id: prod.id } },
      update: {}, // preservar stock existente al re-seedear
      create: { pdv_id: bodegaCentral.id, producto_id: prod.id, stock_actual: 0, stock_critico: 0 },
    })
  }
  console.log(`✓ Inventario Bodega Central: ${todosProductos.length} productos inicializados`)

  // ─── Usuarios ─────────────────────────────────────────────────────────────────
  const rolAdmin      = await prisma.rol.findUniqueOrThrow({ where: { nombre: 'ADMIN' } })
  const rolSupervisor = await prisma.rol.findUniqueOrThrow({ where: { nombre: 'SUPERVISOR' } })
  const rolVendedor   = await prisma.rol.findUniqueOrThrow({ where: { nombre: 'VENDEDOR' } })

  const mallPatio = sucursales.find((s) => s.nombre === 'Mall Patio')!

  const usuariosData: Array<{
    rut: string; nombre: string; password: string; rolId: number; pdvId: number | null; pagoDiario: number
  }> = [
    // ── Administración ──
    {
      rut: '11111111-1', nombre: 'Martín Reyes', password: 'admin',
      rolId: rolAdmin.id, pdvId: mallPatio.id, pagoDiario: 0,
    },
    {
      rut: '22222222-2', nombre: 'Sthefany Reyes', password: '1234',
      rolId: rolSupervisor.id, pdvId: null, pagoDiario: 0,
    },

    // ── Vendedoras que rotan entre sucursales ──
    // RUTs provisionales — actualizar desde Gestión de Usuarios con el RUT real
    {
      rut: '11111111-2', nombre: 'Alexandra', password: '1234',
      rolId: rolVendedor.id, pdvId: null, pagoDiario: 28000,
    },
    {
      rut: '11111111-3', nombre: 'María', password: '1234',
      rolId: rolVendedor.id, pdvId: null, pagoDiario: 28000,
    },
    {
      rut: '11111111-4', nombre: 'Luisana', password: '1234',
      rolId: rolVendedor.id, pdvId: null, pagoDiario: 28000,
    },
    {
      rut: '11111111-5', nombre: 'Anaís', password: '1234',
      rolId: rolVendedor.id, pdvId: null, pagoDiario: 28000,
    },

    // ── Vendedoras adicionales (también rotan) ──
    {
      rut: '11111111-6', nombre: 'Ingrid', password: '1234',
      rolId: rolVendedor.id, pdvId: null, pagoDiario: 28000,
    },
    {
      rut: '11111111-7', nombre: 'María Elena', password: '1234',
      rolId: rolVendedor.id, pdvId: null, pagoDiario: 28000,
    },
    {
      rut: '11111111-8', nombre: 'Denisse', password: '1234',
      rolId: rolVendedor.id, pdvId: null, pagoDiario: 28000,
    },
  ]
  for (const u of usuariosData) {
    const hash = await bcrypt.hash(u.password, 10)
    await prisma.usuario.upsert({
      where:  { rut: u.rut },
      update: { nombre: u.nombre, password_hash: hash, pdv_id: u.pdvId, pago_diario: u.pagoDiario },
      create: {
        rut:           u.rut,
        nombre:        u.nombre,
        password_hash: hash,
        rol_id:        u.rolId,
        pdv_id:        u.pdvId,
        pago_diario:   u.pagoDiario,
      },
    })
  }
  console.log('✓ Usuarios:', usuariosData.map((u) => u.nombre).join(', '))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
