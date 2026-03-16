// ─── Tipos para módulos de administración ───

/** Sucursales / Puntos de venta del negocio */
export type Sucursal = "Mall" | "Paseo" | "Open Plaza" | "Rengo" | "Baquedano";

// ─── Control de Insumos (mezclas) ───

/** Clave identificadora de cada mezcla */
export type ClaveMezcla = "MM" | "MA" | "MN" | "MPr";

export interface FilaInsumo {
  saldoInicial: number;
  ingreso: number;
  utilizado: number;
  // saldoActual se calcula: saldoInicial + ingreso - utilizado
}

export type ControlInsumos = Record<ClaveMezcla, FilaInsumo>;

// ─── Ventas Confitados ───

export type ClaveConfitado = "mani" | "almendras" | "nueces" | "promos";

/** Cantidad de paquetes vendidos por producto */
export type VentasConfitados = Record<ClaveConfitado, number>;

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
  confitados: VentasConfitados;
  liquidos: VentasLiquidos;
  caja: ControlCaja;
}
