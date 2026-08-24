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
export type PaginaVendedor = "pos" | "solicitudes" | "mis-cierres" | "inventario" | "historial" | "cierre-caja";

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
  /**
   * El movimiento lo creó otra persona (hoy: los retiros que registra el
   * admin/supervisor desde el panel). El vendedor lo ve en su cuadre pero no
   * puede editarlo ni borrarlo.
   */
  soloLectura?: boolean;
  /** Quién lo registró — se muestra junto a los retiros del admin. */
  realizadoPor?: string;
}

// ─── Solicitudes de insumos ─────────────────────────────────────────────────

export type EstadoSolicitud = "PENDIENTE" | "DESPACHADA" | "CONFIRMADA" | "RECHAZADA";

export interface ItemSolicitud {
  id: number;
  /** Producto pedido — el despacho se declara por producto, no por línea. */
  productoId: number;
  producto: string;
  categoria: string;
  cantidad: number;
}

/**
 * Despacho que movió stock para esta solicitud (A15). Como el bodeguero puede
 * enviar menos de lo pedido, `items` es lo que realmente salió de bodega,
 * mientras `Solicitud.items` conserva el pedido original.
 */
export interface DespachoSolicitud {
  loteId: string;
  fecha: string;
  enviadoPor: string | null;
  estado: string;
  observacion: string | null; // nota que dejó el bodeguero al despachar
  cantidadItems: number;
  totalUnidades: number;
  items: { productoId: number; producto: string; cantidad: number }[];
}

export interface Solicitud {
  id: number;
  pdvNombre: string;
  pdvId: number;
  solicitante: string;
  estado: EstadoSolicitud;
  notas: string | null;
  motivoRechazo: string | null;
  fecha: string;
  fechaCierre: string | null;
  items: ItemSolicitud[];
  despachos: DespachoSolicitud[];
}
