// Datos mock de prueba para el POS
// TODO: Reemplazar con llamadas reales a la API (Fase 3)

import type {
  Categoria,
  Producto,
  ItemInventarioInicial,
} from "@/tipos/pos.tipos";

// ─── Categorías reales del negocio ───────────────────────────────────────────

export const categoriasMock: Categoria[] = [
  { id: 1, nombre: "Mezclas" },
  { id: 2, nombre: "Paquetes" },
  { id: 3, nombre: "Promos" },
  { id: 4, nombre: "Líquidos" },
];

// ─── Catálogo real de productos ──────────────────────────────────────────────

export const productosMock: Producto[] = [
  // Mezclas (materia prima — no tienen precio de venta directo)
  { id: 1,  categoriaId: 1, nombre: "Mezcla Maní",          precioVenta:    0, activo: true },
  { id: 2,  categoriaId: 1, nombre: "Mezcla Almendras",      precioVenta:    0, activo: true },
  { id: 3,  categoriaId: 1, nombre: "Mezcla Nueces",         precioVenta:    0, activo: true },
  { id: 4,  categoriaId: 1, nombre: "Mezcla Promo",          precioVenta:    0, activo: true },
  { id: 5,  categoriaId: 1, nombre: "Mezcla Helado",       precioVenta:    0, activo: true },
  // Paquetes
  { id: 6,  categoriaId: 2, nombre: "Paquetes Maní",         precioVenta:  800, activo: true },
  { id: 7,  categoriaId: 2, nombre: "Paquetes Almendras",    precioVenta: 1000, activo: true },
  { id: 8,  categoriaId: 2, nombre: "Paquetes Nueces",       precioVenta: 1000, activo: true },
  // Promos (pp)
  { id: 9,  categoriaId: 3, nombre: "Paquetes Promo",        precioVenta: 1500, activo: true },
  // Líquidos
  { id: 10, categoriaId: 4, nombre: "Agua Mineral Con Gas",  precioVenta:  800, activo: true },
  { id: 11, categoriaId: 4, nombre: "Agua Mineral Sin Gas",  precioVenta:  800, activo: true },
  { id: 12, categoriaId: 4, nombre: "Energéticas",           precioVenta: 1500, activo: true },
  { id: 13, categoriaId: 4, nombre: "Bebidas",               precioVenta: 1500, activo: true },
  { id: 14, categoriaId: 4, nombre: "Jugos Kapo",            precioVenta:  500, activo: true },
  // Helados
  { id: 15, categoriaId: 3, nombre: "Helados",               precioVenta: 1000, activo: true },
];

// ─── Inventario inicial mock (stock esperado al abrir turno) ─────────────────

export const inventarioInicialMock: ItemInventarioInicial[] = [
  // Mezclas
  { productoId: 1,  nombre: "Mezcla Maní",         categoria: "Mezclas",  inicio: 0, ingreso: 0, verificado: false },
  { productoId: 2,  nombre: "Mezcla Almendras",     categoria: "Mezclas",  inicio: 0, ingreso: 0, verificado: false },
  { productoId: 3,  nombre: "Mezcla Nueces",        categoria: "Mezclas",  inicio: 0, ingreso: 0, verificado: false },
  { productoId: 4,  nombre: "Mezcla Promo",         categoria: "Mezclas",  inicio: 0, ingreso: 0, verificado: false },
  { productoId: 5,  nombre: "Mezcla Helado",      categoria: "Mezclas",  inicio: 0, ingreso: 0, verificado: false },
  // Paquetes
  { productoId: 6,  nombre: "Paquetes Maní",        categoria: "Paquetes", inicio: 0, ingreso: 0, verificado: false },
  { productoId: 7,  nombre: "Paquetes Almendras",   categoria: "Paquetes", inicio: 0, ingreso: 0, verificado: false },
  { productoId: 8,  nombre: "Paquetes Nueces",      categoria: "Paquetes", inicio: 0, ingreso: 0, verificado: false },
  // Promos
  { productoId: 9,  nombre: "Promos",               categoria: "Promos",   inicio: 0, ingreso: 0, verificado: false },
  // Líquidos
  { productoId: 10, nombre: "Agua Mineral Con Gas", categoria: "Líquidos", inicio: 0, ingreso: 0, verificado: false },
  { productoId: 11, nombre: "Agua Mineral Sin Gas", categoria: "Líquidos", inicio: 0, ingreso: 0, verificado: false },
  { productoId: 12, nombre: "Energéticas",          categoria: "Líquidos", inicio: 0, ingreso: 0, verificado: false },
  { productoId: 13, nombre: "Bebidas",              categoria: "Líquidos", inicio: 0, ingreso: 0, verificado: false },
  { productoId: 14, nombre: "Jugos Kapo",           categoria: "Líquidos", inicio: 0, ingreso: 0, verificado: false },
  // Helados
  { productoId: 15, nombre: "Helados",              categoria: "Promos",   inicio: 0, ingreso: 0, verificado: false },
];
