// Tipos e interfaces del módulo POS

// ─── Sesión y contexto del vendedor ─────────────────────────────────────────

export type TipoPDV = "BODEGA" | "PUNTO_VENTA";
export type EstadoTurno = "ABIERTO" | "CERRADO";
export type RolUsuario = "ADMIN" | "SUPERVISOR" | "VENDEDOR" | "BODEGUERO";

export interface UsuarioSesion {
  id: number;
  rut: string;
  nombre: string;
  rol: RolUsuario;
  esDemo: boolean;
}

export interface PDVActivo {
  id: number;
  nombre: string;
  tipo: TipoPDV;
  activo: boolean;
}

export interface TurnoActivo {
  id: number;
  pdvId: number;
  usuarioId: number;
  fechaApertura: string; // ISO string desde el backend
  saldoInicial: number;  // CLP entero
  estado: EstadoTurno;
}

export interface SesionPOS {
  usuario: UsuarioSesion | null;
  pdv: PDVActivo | null;
  turno: TurnoActivo | null;
  cargando: boolean;
  error: string | null;
}

// ─── Autenticación local ────────────────────────────────────────────────────

export interface CredencialesLogin {
  rut: string;
  password: string;
}

export interface EstadoAuth {
  autenticado: boolean;
  usuario: UsuarioSesion | null;
  pdv: PDVActivo | null;
  horaIngreso: string | null; // ISO string del momento en que inició sesión
  error: string | null;
}

// ─── Navegación ─────────────────────────────────────────────────────────────

// Páginas disponibles en el SideNav del vendedor
export type PaginaVendedor = "pos" | "solicitudes" | "inventario" | "historial" | "cierre-caja" | "registro-diario";

// ─── Apertura de turno ──────────────────────────────────────────────────────

// Pasos del wizard de apertura
export type PasoApertura = "pdv" | "saldo" | "inventario";

// Item de inventario para verificación inicial
export interface ItemInventarioInicial {
  productoId: number;
  nombre: string;
  categoria: string;
  inicio: number;    // Conteo al abrir turno (lo llena el vendedor)
  ingreso: number;   // Ingresos durante el turno (0 en apertura)
  verificado: boolean;
}

// ─── Productos y catálogo ───────────────────────────────────────────────────

export interface Categoria {
  id: number;
  nombre: string;
}

export interface Producto {
  id: number;
  categoriaId: number;
  nombre: string;
  precioVenta: number; // CLP entero
  activo: boolean;
}

// ─── Carrito de venta ───────────────────────────────────────────────────────

export interface ItemCarrito {
  producto: Producto;
  cantidad: number;
  subtotal: number; // precioVenta * cantidad
}

export interface EstadoCarrito {
  items: ItemCarrito[];
  total: number;
}

// ─── Ventas y movimientos de caja ───────────────────────────────────────────

export type MetodoPago = "efectivo" | "debito" | "credito" | "transferencia";

export interface ItemVentaLocal {
  productoId: number;
  nombre: string;
  categoria: string;
  cantidad: number;
  precioUnitario: number;
}

export interface VentaLocal {
  id: number;
  turnoId: number;
  vendedorNombre: string;
  items: ItemVentaLocal[];
  total: number;
  metodoPago: MetodoPago;
  horaVenta: string; // "HH:MM"
  folioSII?: number | null;
}

export interface MovimientoCaja {
  id: number;
  backendId?: number; // ID real en BD (undefined = solo local / apertura)
  tipo: "gasto" | "retiro" | "ingreso";
  descripcion: string;
  categoria: string;
  monto: number;
  hora: string; // "HH:MM"
}

// ─── Solicitudes de insumos ─────────────────────────────────────────────────

export type EstadoSolicitud = "PENDIENTE" | "DESPACHADA" | "CONFIRMADA";

export interface ItemSolicitud {
  id: number;
  producto: string;
  categoria: string;
  cantidad: number;
}

export interface Solicitud {
  id: number;
  pdvNombre: string;
  pdvId: number;
  solicitante: string;
  estado: EstadoSolicitud;
  notas: string | null;
  fecha: string;
  fechaCierre: string | null;
  items: ItemSolicitud[];
}
