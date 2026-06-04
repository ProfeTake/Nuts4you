// ─── Tipos para módulos de administración ───

/** Sucursales / Puntos de venta del negocio */
export type Sucursal = "Mall" | "Paseo" | "Open Plaza" | "Rengo" | "Baquedano";

// ─── Control de Insumos (mezclas) ───

/** Clave identificadora de cada mezcla */
export type ClaveMezcla = "MM" | "MA" | "MN" | "MPr";

/**
 * Fila de control por tipo de mezcla.
 *
 * Sección Mezclas (materia prima):
 *   saldoActualMezcla (readonly) = saldoInicial + ingreso - utilizado
 *
 * Sección Paquetes (producto terminado):
 *   produccion (readonly)   = utilizado × factorConversion
 *   paqVendidos (readonly)  = saldoInicialPaquetes + produccion + ingresoDirectoPaquetes − saldoFinalPaquetes
 */
export interface FilaInsumo {
  // ── Mezclas (materia prima) ──────────────────────────────────────────────
  saldoInicial: number;              // stock de mezcla al iniciar el turno
  ingreso: number;                   // mezclas recibidas de bodega en el turno
  utilizado: number;                 // mezclas procesadas/cocinadas en el turno

  // ── Paquetes (producto terminado) ────────────────────────────────────────
  saldoInicialPaquetes: number;      // paquetes en stock al iniciar el turno
  ingresoDirectoPaquetes: number;    // paquetes recibidos de bodega ya preparados
  saldoFinalPaquetes: number;        // conteo físico de paquetes al cerrar turno
}

export type ControlInsumos = Record<ClaveMezcla, FilaInsumo>;

// ─── Ventas Líquidos ───

export type ClaveLiquido = "aguas" | "bebidas" | "energeticas";

export type VentasLiquidos = Record<ClaveLiquido, number>;

// ─── Control de Caja ───

export interface ControlCaja {
  dineroInicio: number;
  dineroCierre: number;
  gastos: number;
  // diferencia se calcula: dineroCierre - dineroInicio - gastos
}

// ─── Registro Diario completo ───

export interface RegistroDiario {
  sucursal: Sucursal | "";
  fecha: string; // ISO date string
  insumos: ControlInsumos;
  liquidos: VentasLiquidos;
  caja: ControlCaja;
}

// ─── Páginas del panel de administración ───

export type PaginaAdmin =
  | "dashboard"
  | "sucursales"
  | "bodega"
  | "finanzas"
  | "personal"
  | "usuarios"
  | "facturas"
  | "cierre-preventivo";

// ─── Dashboard: ventas por sucursal (gráfico de barras) ───

export interface VentaMensualSucursal {
  sucursal: string;
  ventaTotal: number;
}

// ─── Dashboard: tarjetas de resumen ───

export interface ResumenDashboard {
  ventaTotalDia: number;
  pendienteDeposito: number;
  alertasBodega: number;
  itemsSinStock: string[];
}

// ─── Bodega Central ───

export type CategoriaBodega = "mezclas" | "liquidos";

export type EstadoStock =
  | "STOCK OK"
  | "POCO STOCK"
  | "SIN STOCK"
  | "SOBRESTOCK";

export interface ItemBodega {
  id: string;
  item: string;
  categoria: CategoriaBodega;
  saldoInicial: number;
  ingresos: number;
  utilizadas: number;
  saldoActual: number; // calculado: saldoInicial + ingresos - utilizadas
  stockMinimo: number;
  stockMaximo: number;
  estado: EstadoStock;
}

/** Entrega pendiente de bodega a una sucursal */
export interface EntregaSucursal {
  id: string;
  sucursal: Sucursal;
  item: string;
  cantidadSolicitada: number;
  cantidadEntregada: number;
  fecha: string;
  estado: "Pendiente" | "Parcial" | "Entregado";
}

// ─── PDV (punto de venta) ───

export interface PDVItem {
  id: number;
  nombre: string;
  tipo?: string;
}

// ─── Control de Sucursales ───

export interface MetricasMes {
  totalMes: number;
  promedioDiario: number;
  proyeccionMes: number;
  diasConVenta: number;
  diasMes: number;
  diasTranscurridos: number;
  categoriasMes: Record<string, number>;
  faltantesMes: number;
}

export interface ResumenSucursal {
  turnoId: number;
  estado: string;
  vendedor: string;
  ventasPorCategoria: Record<string, number>;
  totalVentas: number;
  ventaEfectivo: number;
  efectivoDeclarado: number;
  diferenciaCaja: number;
  saldoInicial: number;
  totalRetiros: number;
  metricas: MetricasMes;
}

// ─── Depósitos (Finanzas) ───

export type EstadoDeposito = "Depositado" | "Transferencia" | "No depositado";

export interface FilaDeposito {
  id: string;
  fechaVenta: string;
  sucursal: Sucursal;
  montoADepositar: number;
  montoDepositado: number;
  faltaDepositar: number;
  estado: EstadoDeposito;
}

// ─── Facturas de Proveedores ───

export interface ProveedorItem {
  id:           number;
  nombre:       string;
  rut:          string | null;
  contacto:     string | null;
  activo:       boolean;
  banco:        string | null;
  tipo_cuenta:  string | null;
  numero_cuenta: string | null;
}

export type EstadoFactura = "PENDIENTE" | "PAGADA" | "ANULADA";

export interface DetalleFacturaItem {
  id:             number;
  descripcion:    string;
  cantidad:       number;
  precioUnitario: number;
}

export interface FacturaProveedor {
  id:               number;
  proveedorId:      number;
  proveedorNombre:  string;
  numeroFactura:    string;
  fecha:            string;
  fechaVencimiento: string | null;
  montoTotal:       number;
  estado:           EstadoFactura;
  notas:            string | null;
  creadoEn:         string;
  items:            DetalleFacturaItem[];
}

export interface ResumenFacturasMes {
  mes:           string;
  totalFacturas: number;
  montoTotal:    number;
  pendiente:     number;
  pagada:        number;
}

// ─── Sueldos y Personal ───

export interface FilaPersonal {
  id: string;
  nombre: string;
  sucursal: Sucursal;
  diasTrabajados: number;
  promedioVentaDiario: number;
  pagoBase: number;
  bonos: number;
  descuentosFaltante: number;
  totalAPagar: number;
}

// ─── Cierre Preventivo ───

export interface ChecklistItem {
  label:   string;
  marcado: boolean;
}

export interface CierrePreventivo {
  id:            number;
  pdvId:         number;
  pdvNombre:     string;
  usuarioNombre: string;
  fecha:         string;
  montoRetiro:   number;
  checklist:     ChecklistItem[];
  notasVendedor: string | null;
  observaciones: string | null;
}
