// ─── Datos mock y constantes para módulos de administración ───

import type {
  ClaveMezcla,
  ClaveConfitado,
  ClaveLiquido,
  ControlInsumos,
  FilaInsumo,
  RegistroDiario,
  Sucursal,
  VentasConfitados,
  VentasLiquidos,
  ControlCaja,
} from "@/tipos/admin.tipos";

// ─── Sucursales disponibles ───

export const SUCURSALES: Sucursal[] = [
  "Mall",
  "Paseo",
  "Open Plaza",
  "Rengo",
  "Baquedano",
];

// ─── Labels legibles para cada sección ───

export const MEZCLAS_LABELS: Record<ClaveMezcla, string> = {
  MM: "Mezcla Maní",
  MA: "Mezcla Almendra",
  MN: "Mezcla Nuez",
  MPr: "Mezcla Promo",
};

export const CONFITADOS_LABELS: Record<ClaveConfitado, string> = {
  mani: "Maní",
  almendras: "Almendras",
  nueces: "Nueces",
  promos: "Promos",
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
};

const insumosVacios: ControlInsumos = {
  MM: { ...filaInsumoVacia },
  MA: { ...filaInsumoVacia },
  MN: { ...filaInsumoVacia },
  MPr: { ...filaInsumoVacia },
};

const confitadosVacios: VentasConfitados = {
  mani: 0,
  almendras: 0,
  nueces: 0,
  promos: 0,
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
    confitados: { ...confitadosVacios },
    liquidos: { ...liquidosVacios },
    caja: { ...cajaVacia },
  };
}

// ─── Columnas de insumos (para iterar en la UI) ───

export const COLUMNAS_INSUMO: { clave: keyof FilaInsumo; label: string }[] = [
  { clave: "saldoInicial", label: "Saldo Inicial" },
  { clave: "ingreso", label: "Ingreso" },
  { clave: "utilizado", label: "Utilizado" },
];
