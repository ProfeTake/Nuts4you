// Datos mock de prueba para el POS

import type {
  Categoria,
  Producto,
  ItemInventarioInicial,
  UsuarioSesion,
  PDVActivo,
} from "@/tipos/pos.tipos";

// ─── Credenciales de acceso mock ─────────────────────────────────────────────
// Contraseña en texto plano — sólo para mock local
// TODO: Reemplazar con autenticación JWT desde el backend

export interface CredencialMock {
  rut: string;          // Con formato: XX.XXX.XXX-X
  passwordHash: string; // Plain text mock
  usuario: UsuarioSesion;
  pdv: PDVActivo;
}

export const credencialesMock: CredencialMock[] = [
  {
    rut: "12.345.678-9",
    passwordHash: "1234",
    usuario: { id: 1, rut: "12.345.678-9", nombre: "Carlos Muñoz",  rol: "VENDEDOR" },
    pdv:     { id: 1, nombre: "Local Mall Plaza",  tipo: "LOCAL" },
  },
  {
    rut: "98.765.432-1",
    passwordHash: "1234",
    usuario: { id: 2, rut: "98.765.432-1", nombre: "Ana Torres",    rol: "VENDEDOR" },
    pdv:     { id: 2, nombre: "Kiosko Central",    tipo: "LOCAL" },
  },
  {
    rut: "11.111.111-1",
    passwordHash: "admin",
    usuario: { id: 3, rut: "11.111.111-1", nombre: "Martín Reyes",  rol: "ADMIN" },
    pdv:     { id: 1, nombre: "Local Mall Plaza",  tipo: "LOCAL" },
  },
];


export const categoriasMock: Categoria[] = [
  { id: 1, nombre: "Confitados" },
  { id: 2, nombre: "Líquidos" },
  { id: 3, nombre: "Frutos Secos" },
];

export const productosMock: Producto[] = [
  {
    id: 1,
    categoriaId: 1,
    nombre: "Maní Confitado",
    precioVenta: 1500,
    activo: true,
  },
  {
    id: 2,
    categoriaId: 1,
    nombre: "Almendras Confitadas",
    precioVenta: 3500,
    activo: true,
  },
  {
    id: 3,
    categoriaId: 3,
    nombre: "Mix Frutos Secos",
    precioVenta: 4000,
    activo: true,
  },
  {
    id: 4,
    categoriaId: 2,
    nombre: "Agua Mineral 600ml",
    precioVenta: 800,
    activo: true,
  },
  {
    id: 5,
    categoriaId: 2,
    nombre: "Jugo Natural 500ml",
    precioVenta: 1200,
    activo: true,
  },
  {
    id: 6,
    categoriaId: 1,
    nombre: "Maní Promo 2x1",
    precioVenta: 2000,
    activo: true,
  },
  {
    id: 7,
    categoriaId: 3,
    nombre: "Castañas de Cajú",
    precioVenta: 5000,
    activo: true,
  },
  {
    id: 8,
    categoriaId: 2,
    nombre: "Bebida Cola 350ml",
    precioVenta: 900,
    activo: true,
  },
];

// ─── Inventario inicial mock (stock esperado al abrir turno) ────────────────

export const inventarioInicialMock: ItemInventarioInicial[] = [
  // Granel (medidas)
  { productoId: 1,  nombre: "M de Maní",        categoria: "Granel",   inicio: 0, ingreso: 0, verificado: false },
  { productoId: 2,  nombre: "M de Almendras",   categoria: "Granel",   inicio: 0, ingreso: 0, verificado: false },
  { productoId: 3,  nombre: "M de Nueces",      categoria: "Granel",   inicio: 0, ingreso: 0, verificado: false },
  { productoId: 4,  nombre: "M de Promo",       categoria: "Granel",   inicio: 0, ingreso: 0, verificado: false },
  // Paquetes
  { productoId: 5,  nombre: "Paq de Maní",      categoria: "Paquetes", inicio: 0, ingreso: 0, verificado: false },
  { productoId: 6,  nombre: "Paq de Almendras", categoria: "Paquetes", inicio: 0, ingreso: 0, verificado: false },
  { productoId: 7,  nombre: "Paq de Nueces",    categoria: "Paquetes", inicio: 0, ingreso: 0, verificado: false },
  { productoId: 8,  nombre: "Paq de Promo",     categoria: "Paquetes", inicio: 0, ingreso: 0, verificado: false },
  // Bebidas
  { productoId: 9,  nombre: "Agua Con Gas",     categoria: "Bebidas",  inicio: 0, ingreso: 0, verificado: false },
  { productoId: 10, nombre: "Agua Sin Gas",     categoria: "Bebidas",  inicio: 0, ingreso: 0, verificado: false },
  { productoId: 11, nombre: "Energéticas",      categoria: "Bebidas",  inicio: 0, ingreso: 0, verificado: false },
  { productoId: 12, nombre: "Bebidas",          categoria: "Bebidas",  inicio: 0, ingreso: 0, verificado: false },
  { productoId: 13, nombre: "Kapo",             categoria: "Bebidas",  inicio: 0, ingreso: 0, verificado: false },
];
