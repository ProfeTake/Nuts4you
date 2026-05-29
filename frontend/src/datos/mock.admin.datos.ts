// ─── Datos mock y constantes para módulos de administración ───

import type {
  ClaveMezcla,
  ClaveLiquido,
  ControlInsumos,
  FilaInsumo,
  RegistroDiario,
  Sucursal,
  VentasLiquidos,
  ControlCaja,
  VentaMensualSucursal,
  ResumenDashboard,
} from "@/tipos/admin.tipos";

// ─── Sucursales disponibles ───

export const SUCURSALES: Sucursal[] = [
  "Mall",
  "Paseo",
  "Open Plaza",
  "Rengo",
  "Baquedano",
];

/** Mapeo clave frontend → id de PDV en la base de datos (según seed.ts) */
export const PDV_IDS: Record<Sucursal, number> = {
  Mall:          2,
  Paseo:         3,
  "Open Plaza":  4,
  Rengo:         5,
  Baquedano:     6,
};

// ─── Labels legibles para cada sección ───

export const MEZCLAS_LABELS: Record<ClaveMezcla, string> = {
  MM: "Mezcla Maní",
  MA: "Mezcla Almendra",
  MN: "Mezcla Nuez",
  MPr: "Mezcla Promo",
};

/** Paquetes generados por cada unidad de mezcla procesada (cocinada) */
export const FACTORES_CONVERSION: Record<ClaveMezcla, number> = {
  MM: 19,
  MA: 20,
  MN: 20,
  MPr: 10,
};

/** Sigla del paquete correspondiente a cada mezcla */
export const PAQUETE_POR_MEZCLA: Record<ClaveMezcla, string> = {
  MM: "pm",
  MA: "pa",
  MN: "pn",
  MPr: "Pr",
};

export const LIQUIDOS_LABELS: Record<ClaveLiquido, string> = {
  aguas: "Aguas",
  bebidas: "Bebidas",
  energeticas: "Energéticas",
};

// ─── Estado vacío por defecto ───

const filaInsumoVacia: FilaInsumo = {
  saldoInicial: 0,
  ingreso: 0,
  utilizado: 0,
  saldoInicialPaquetes: 0,
  ingresoDirectoPaquetes: 0,
  saldoFinalPaquetes: 0,
};

const insumosVacios: ControlInsumos = {
  MM: { ...filaInsumoVacia },
  MA: { ...filaInsumoVacia },
  MN: { ...filaInsumoVacia },
  MPr: { ...filaInsumoVacia },
};

const liquidosVacios: VentasLiquidos = {
  aguas: 0,
  bebidas: 0,
  energeticas: 0,
};

const cajaVacia: ControlCaja = {
  dineroInicio: 0,
  dineroCierre: 0,
  gastos: 0,
};

/** Genera un registro diario con todos los valores en 0 */
export function crearRegistroVacio(): RegistroDiario {
  return {
    sucursal: "",
    fecha: new Date().toISOString().split("T")[0],
    insumos: {
      MM: { ...insumosVacios.MM },
      MA: { ...insumosVacios.MA },
      MN: { ...insumosVacios.MN },
      MPr: { ...insumosVacios.MPr },
    },
    liquidos: { ...liquidosVacios },
    caja: { ...cajaVacia },
  };
}

// ─── Columnas editables de insumos (para iterar en la UI) ───

export const COLUMNAS_MEZCLA: { clave: keyof FilaInsumo; label: string }[] = [
  { clave: "saldoInicial", label: "Saldo Inicial" },
  { clave: "ingreso",      label: "Ingreso" },
  { clave: "utilizado",    label: "Cocinadas" },
];

export const COLUMNAS_PAQUETES: { clave: keyof FilaInsumo; label: string }[] = [
  { clave: "saldoInicialPaquetes",   label: "Inicio" },
  { clave: "ingresoDirectoPaquetes", label: "Ing. Directo" },
  { clave: "saldoFinalPaquetes",     label: "Saldo Final" },
];

// ─── Mock data para AdminDashboard ───

/** Ventas mensuales por sucursal (gráfico de barras) */
export const VENTAS_MENSUALES_SUCURSAL: VentaMensualSucursal[] = [
  { sucursal: "Mall Patio", ventaTotal: 2_850_000 },
  { sucursal: "Paseo", ventaTotal: 1_920_000 },
  { sucursal: "Open Plaza", ventaTotal: 3_150_000 },
  { sucursal: "Cugat Rengo", ventaTotal: 1_480_000 },
  { sucursal: "Cugat Baquedano", ventaTotal: 2_340_000 },
];

/** Resumen global del día para tarjetas del dashboard */
export const RESUMEN_DASHBOARD: ResumenDashboard = {
  ventaTotalDia: 1_245_800,
  pendienteDeposito: 387_500,
  alertasBodega: 3,
  itemsSinStock: ["Mezcla Almendra", "Energéticas", "Barquillos"],
};

/** Datos de los últimos 7 días para mini-tendencia */
export const VENTAS_ULTIMOS_7_DIAS: { dia: string; monto: number }[] = [
  { dia: "Lun", monto: 980_000 },
  { dia: "Mar", monto: 1_120_000 },
  { dia: "Mié", monto: 870_000 },
  { dia: "Jue", monto: 1_340_000 },
  { dia: "Vie", monto: 1_560_000 },
  { dia: "Sáb", monto: 1_890_000 },
  { dia: "Dom", monto: 1_245_800 },
];
