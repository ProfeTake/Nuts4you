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
  | "preparacion"
  | "gastos"
  | "finanzas"
  | "personal"
  | "usuarios"
  | "facturas"
  | "horarios"
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
  productoId: number;       // id del producto (para ordenar como el Turno Activo)
  item: string;
  categoria: CategoriaBodega;
  categoriaNombre?: string; // nombre real de la categoría (para regla de edición de precio)
  precioVenta?: number;     // precio de venta actual del producto (CLP)
  costo?: number;           // costo actual del producto (CLP) — editable solo por ADMIN
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

export interface TurnoHistorial {
  turnoId:            number;
  fecha:              string;
  vendedor:           string;
  vendedorId:         number | null;
  totalVentas:        number;
  ventaEfectivo:      number;
  ventaTarjeta:       number;
  ventaTransferencia: number;
  efectivoDeclarado:  number;
  diferenciaCaja:     number;
}

export interface VendedorOpcion {
  id:     number;
  nombre: string;
}

export interface FaltanteVendedor {
  turnoId:   number;
  fecha:     string;
  pdvNombre: string;
  faltante:  number;
}

// ─── Turnos abiertos ahora (panel de Sucursales) ───

export interface TurnoActivoDetalle {
  turnoId:         number;
  pdvId:           number;
  pdvNombre:       string;
  vendedor:        string;
  vendedorId:      number | null;
  /** Instante exacto de apertura (ISO) */
  fechaApertura:   string;
  /** Día calendario chileno de la apertura (YYYY-MM-DD) — sirve para pedir el reporte */
  diaApertura:     string;
  minutosAbierto:  number;
  /** Días completos que lleva abierto: > 0 = turno arrastrado sin cerrar */
  diasAbierto:     number;
  saldoInicial:    number;
  totalRetiros:    number;
  cantidadRetiros: number;
  totalGastos:     number;
  cantidadGastos:  number;
}

export interface PDVSinTurno {
  pdvId:        number;
  pdvNombre:    string;
  ultimoCierre: string | null;
}

export interface TurnosActivosResumen {
  turnos:       TurnoActivoDetalle[];
  totalPdvs:    number;
  pdvsSinTurno: PDVSinTurno[];
}

/** Pago hecho a un vendedor con el efectivo de un turno ("Pagar a vendedor"). */
export interface PagoDesdeCaja {
  id:            number;
  usuarioId:     number | null;
  vendedor:      string;
  turnosPagados: number;
  montoTotal:    number;
  creadoPor:     string | null;
  creadoEn:      string;
}

/** Un turno impago de un vendedor, valorizado (para el combo de "Pagar a vendedor"). */
export interface TurnoPorPagar {
  turnoId:        number;
  fecha:          string;
  pdvId:          number;
  pdvNombre:      string;
  venta:          number;
  bono:           number;
  /** "Adicional" del turno en décimas (planilla, col. E): 0 · 5 = 0,5 · 10 = 1 · 15 = 1,5. */
  extraDecimas:   number;
  /** El mismo adicional ya en CLP (extraDecimas × valorExtra / 10). */
  montoExtra:     number;
  diferenciaCaja: number;
}

/**
 * Total de pagar los primeros k turnos. Viene precalculado del backend: el
 * descuento por faltantes de caja se aplica sobre el NETO del conjunto y solo si
 * supera la tolerancia, así que no se puede sumar turno por turno en el cliente.
 */
export interface AcumuladoPago {
  cantidad:          number;
  montoBase:         number;
  montoBonos:        number;
  montoExtras:       number;
  montoDescuentos:   number;
  montoAdicional:    number;
  montoCotizaciones: number;
  netoCaja:          number;
  montoTotal:        number;
}

export interface VendedorPorPagar {
  usuarioId:        number;
  nombre:           string;
  pagoDiario:       number;
  turnosPendientes: number;
  turnos:           TurnoPorPagar[];
  acumulados:       AcumuladoPago[];
}

export interface PendientesDePago extends ConfigSueldosGlobal {
  vendedores: VendedorPorPagar[];
}

// ─── Configuración de sueldos (fusión Sueldos + Bonos) ───────────────────────

/**
 * Parámetros globales del cálculo, tabla `ConfigNomina` (fila única).
 * Corresponden a la planilla del cliente "Sueldos Feb 2026.xlsx":
 * P13 (pago por turno), el 3.000 de la columna "Adicional", H164 (cotizaciones)
 * y el −1.000 de la tolerancia en K162.
 */
export interface ConfigSueldosGlobal {
  pagoDiarioBase:      number;
  valorExtra:          number;
  cotizacionesDefault: number;
  toleranciaFaltante:  number;
}

/** Un tramo de bono: si la venta del turno llega al umbral, se paga el monto. */
export interface TramoBono {
  id?:     number;
  umbral:  number;
  monto:   number;
  activo?: boolean;
}

/**
 * De dónde salen los tramos que el cálculo está aplicando hoy:
 * - `configurado`    → filas guardadas en ConfigBono (el admin los editó).
 * - `planilla`       → fallback por nombre de sucursal con los valores del Excel;
 *                      se aplican igual, pero no están en la BD.
 * - `sin-configurar` → no hay tramos ni fallback: esa sucursal paga bono 0.
 */
export type OrigenTramos = "configurado" | "planilla" | "sin-configurar";

/** Tramos de bono de una sucursal (`GET /config-bonos`). */
export interface ConfigBonoPdv {
  pdvId:     number;
  pdvNombre: string;
  activo:    boolean;
  origen:    OrigenTramos;
  tramos:    TramoBono[];
}

export interface ResumenSucursal {
  turnoId:            number;
  usuarioId:          number | null;
  estado:             string;
  vendedor:           string;
  pagoDiario:         number;
  ventasPorCategoria: Record<string, number>;
  totalVentas:        number;
  ventaEfectivo:      number;
  ventaTarjeta:       number;
  ventaTransferencia: number;
  efectivoDeclarado:  number;
  // Efectivo de ventas a entregar = efectivo declarado − caja chica (saldo apertura)
  efectivoAEntregar:  number;
  diferenciaCaja:     number;
  saldoInicial:       number;
  totalRetiros:       number;
  totalGastos:        number;
  // Efectivo que debía quedar en caja = venta efectivo − gastos − retiros.
  // La diferencia del cuadre es efectivoDeclarado − esperadoCaja.
  esperadoCaja:       number;
  // ── A depositar del turno (planilla: P22 = ... − F29 "Pagado a Vendedor") ──
  // depositoBruto = efectivo a entregar + retiros; aDepositar ya viene neteado.
  depositoBruto:      number;
  pagoVendedorTotal:  number;
  aDepositar:         number;
  // El depósito ya se registró en Finanzas: no admite más pagos a vendedores.
  depositoBloqueado:  boolean;
  pagosVendedor:      PagoDesdeCaja[];
  // Recepción del dinero por admin/supervisor (2ª etapa del cierre)
  recepcionConfirmada: boolean;
  dineroRecibido:      number | null;
  recibidoPor:         string | null;
  fechaRecepcion:      string | null;
  diferenciaRecepcion: number | null;
  // Saldos finales declarados al cierre (snapshot por producto)
  saldosFinales:       { productoId: number; nombre: string; categoria: string; cantidad: number }[];
  // Detalle de ventas por producto declarado al cierre (unidades × precio)
  detalleVentas:       { productoId: number; nombre: string; categoria: string; cantidad: number; precioUnitario: number; subtotal: number }[];
  metricas:           MetricasMes;
}

// ─── Depósitos (Finanzas) ───

export type EstadoDeposito = "Depositado" | "Transferencia" | "No depositado";

export interface FilaDeposito {
  id: string;
  fechaVenta: string;
  sucursal: Sucursal;
  // Neto: montoBruto − pagoVendedor (lo que de verdad debe llegar al banco).
  montoADepositar: number;
  montoBruto?: number;
  pagoVendedor?: number;
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
  proveedorBanco:        string | null;
  proveedorTipoCuenta:   string | null;
  proveedorNumeroCuenta: string | null;
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
  // Presente solo en la respuesta de registro: el retiro declarado supera al
  // RetiroTurno registrado en el turno abierto del PDV (posible descuadre, H11/A10).
  alertaRetiro?: { montoDeclarado: number; retiroRegistrado: number } | null;
}
