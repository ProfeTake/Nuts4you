// ─── ReporteDiarioSucursal ───
// Formulario de registro diario por sucursal.
// Ventas de confitados se calculan automáticamente:
//   produccion       = utilizado (cocinadas) × factorConversion
//   paqVendidos      = saldoInicialPaquetes + produccion + ingresoDirectoPaquetes − saldoFinalPaquetes
// Diseño Mobile-First con secciones colapsables (Accordion).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useMenuNav } from "@/componentes/layout/BarraLateral";
import {
  ClipboardList,
  MapPin,
  Package,
  Candy,
  GlassWater,
  Banknote,
  Save,
  CalendarDays,
} from "lucide-react";

// shadcn/ui
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// Tipos y datos
import type {
  ClaveMezcla,
  ClaveLiquido,
  FilaInsumo,
  RegistroDiario,
  Sucursal,
} from "@/tipos/admin.tipos";
import {
  SUCURSALES,
  MEZCLAS_LABELS,
  LIQUIDOS_LABELS,
  COLUMNAS_MEZCLA,
  COLUMNAS_PAQUETES,
  FACTORES_CONVERSION,
  PAQUETE_POR_MEZCLA,
  crearRegistroVacio,
} from "@/datos/mock.admin.datos";
import { formatearCLP } from "@/lib/money";
import { apiGet, apiPost } from "@/lib/api";
import { useCajaStore } from "@/store/caja.store";

// ─── Helpers internos ───

function fechaHoy(): string {
  return new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ─── Sub-componente: input numérico reutilizable ───

function InputNumerico({
  id,
  value,
  onChange,
  placeholder = "0",
  readOnly = false,
}: {
  id?: string;
  value: number;
  onChange?: (v: number) => void;
  placeholder?: string;
  readOnly?: boolean;
}) {
  return (
    <Input
      id={id}
      type="number"
      min={0}
      inputMode="numeric"
      readOnly={readOnly}
      value={value || ""}
      placeholder={placeholder}
      className={readOnly ? "bg-muted font-semibold text-center" : "text-center"}
      onChange={(e) => onChange?.(Number(e.target.value) || 0)}
    />
  );
}

// ─── Componente principal ───

export function ReporteDiarioSucursal() {
  const { abrirMenu } = useMenuNav();
  const [registro, setRegistro] = useState<RegistroDiario>(crearRegistroVacio);

  const pdvId = useCajaStore((s) => s.turno?.pdvId);
  const fechaHoyISO = new Date().toISOString().split("T")[0];

  // Cargar registro existente del día al montar
  useEffect(() => {
    if (!pdvId) return;
    apiGet<{ data: { datos: RegistroDiario } }>(
      `/admin/registro-diario?pdvId=${pdvId}&fecha=${fechaHoyISO}`
    )
      .then((res) => setRegistro(res.data.datos))
      .catch(() => {}); // No hay registro previo — ok
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdvId]);

  const mutacionGuardar = useMutation({
    mutationFn: (datos: RegistroDiario) =>
      apiPost("/admin/registro-diario", { pdvId, fecha: fechaHoyISO, datos }),
    onSuccess: () =>
      toast.success(`Registro de ${registro.sucursal} guardado correctamente.`),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Error al guardar";
      toast.error(msg);
    },
  });

  // ── Sucursal ──

  const handleSucursal = useCallback((valor: Sucursal) => {
    setRegistro((prev) => ({
      ...crearRegistroVacio(),
      sucursal: valor,
      fecha: prev.fecha,
    }));
  }, []);

  // ── Insumos ──

  const actualizarInsumo = useCallback(
    (mezcla: ClaveMezcla, campo: keyof FilaInsumo, valor: number) => {
      setRegistro((prev) => ({
        ...prev,
        insumos: {
          ...prev.insumos,
          [mezcla]: {
            ...prev.insumos[mezcla],
            [campo]: valor,
          },
        },
      }));
    },
    []
  );

  // ── Cálculos automáticos de ventas por mezcla ──────────────────────────────
  //
  //   saldoActualMezcla = saldoInicial + ingreso - utilizado
  //   produccion        = utilizado × factorConversion
  //   paqVendidos       = saldoInicialPaquetes + produccion + ingresoDirectoPaquetes − saldoFinalPaquetes

  const saldosActualesMezcla = useMemo(() => {
    const claves = Object.keys(registro.insumos) as ClaveMezcla[];
    return Object.fromEntries(
      claves.map((k) => {
        const f = registro.insumos[k];
        return [k, f.saldoInicial + f.ingreso - f.utilizado];
      })
    ) as Record<ClaveMezcla, number>;
  }, [registro.insumos]);

  const produccionPorMezcla = useMemo(() => {
    const claves = Object.keys(registro.insumos) as ClaveMezcla[];
    return Object.fromEntries(
      claves.map((k) => [k, registro.insumos[k].utilizado * FACTORES_CONVERSION[k]])
    ) as Record<ClaveMezcla, number>;
  }, [registro.insumos]);

  const ventasCalculadas = useMemo(() => {
    const claves = Object.keys(registro.insumos) as ClaveMezcla[];
    return Object.fromEntries(
      claves.map((k) => {
        const f = registro.insumos[k];
        const paq = f.saldoInicialPaquetes + produccionPorMezcla[k] + f.ingresoDirectoPaquetes - f.saldoFinalPaquetes;
        return [k, Math.max(0, paq)];
      })
    ) as Record<ClaveMezcla, number>;
  }, [registro.insumos, produccionPorMezcla]);

  // ── Líquidos ──

  const actualizarLiquido = useCallback(
    (clave: ClaveLiquido, valor: number) => {
      setRegistro((prev) => ({
        ...prev,
        liquidos: { ...prev.liquidos, [clave]: valor },
      }));
    },
    []
  );

  // ── Caja ──

  const actualizarCaja = useCallback(
    (campo: "dineroInicio" | "dineroCierre" | "gastos", valor: number) => {
      setRegistro((prev) => ({
        ...prev,
        caja: { ...prev.caja, [campo]: valor },
      }));
    },
    []
  );

  const diferenciaCaja = useMemo(
    () =>
      registro.caja.dineroCierre -
      registro.caja.dineroInicio -
      registro.caja.gastos,
    [registro.caja]
  );

  // ── Guardar ──

  const guardarRegistro = useCallback(() => {
    if (!registro.sucursal) {
      toast.error("Selecciona una sucursal antes de guardar.");
      return;
    }
    if (!pdvId) {
      toast.error("No hay turno activo. Abre un turno primero.");
      return;
    }
    mutacionGuardar.mutate(registro);
  }, [registro, pdvId, mutacionGuardar]);

  // ─── Render ───

  return (
    <div className="flex h-full flex-col">
      {/* Header móvil */}
      <header className="flex items-center gap-3 border-b bg-background px-4 py-3 lg:hidden shrink-0">
        <button
          onClick={abrirMenu}
          aria-label="Abrir menú"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" x2="20" y1="12" y2="12" />
            <line x1="4" x2="20" y1="6" y2="6" />
            <line x1="4" x2="20" y1="18" y2="18" />
          </svg>
        </button>
        <button onClick={abrirMenu} className="text-base font-semibold text-foreground hover:text-primary transition-colors">
          Registro Diario
        </button>
      </header>

      {/* Área scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 pb-8">

          {/* ── Header desktop ── */}
          <div className="hidden lg:flex items-center gap-3">
            <ClipboardList className="size-6 text-primary" />
            <h1 className="text-xl font-semibold tracking-tight">
              Registro Diario por Sucursal
            </h1>
          </div>

          <Separator className="hidden lg:block" />

          {/* ── Sucursal + Fecha ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <MapPin className="size-4" />
                Sucursal y Fecha
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="sucursal-select">Punto de venta</Label>
                <Select
                  value={registro.sucursal || undefined}
                  onValueChange={(v) => handleSucursal(v as Sucursal)}
                >
                  <SelectTrigger id="sucursal-select" className="w-full">
                    <SelectValue placeholder="Selecciona una sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUCURSALES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="size-4" />
                <span className="first-letter:uppercase">{fechaHoy()}</span>
              </div>
            </CardContent>
          </Card>

          {/* ── Secciones colapsables ── */}
          <Accordion defaultValue={["insumos"]} className="space-y-2">

            {/* ─ 1. Control de Insumos + Paquetes ─ */}
            <AccordionItem value="insumos" className="rounded-xl ring-1 ring-foreground/10">
              <AccordionTrigger className="px-4">
                <span className="flex items-center gap-2">
                  <Package className="size-4 text-primary" />
                  Control de Insumos y Paquetes
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4">
                <div className="space-y-6">
                  {(Object.keys(MEZCLAS_LABELS) as ClaveMezcla[]).map((clave) => {
                    const f = registro.insumos[clave];
                    const saldoMezcla = saldosActualesMezcla[clave];
                    const produccion = produccionPorMezcla[clave];
                    const paqVendidos = ventasCalculadas[clave];
                    const paqLabel = PAQUETE_POR_MEZCLA[clave];

                    return (
                      <div key={clave} className="rounded-lg border border-border/60 p-3 space-y-3">
                        {/* Encabezado de mezcla */}
                        <p className="text-sm font-semibold text-foreground">
                          {MEZCLAS_LABELS[clave]}{" "}
                          <span className="font-mono text-muted-foreground">({clave})</span>
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            Factor: {FACTORES_CONVERSION[clave]} paq/mezcla
                          </span>
                        </p>

                        {/* Sub-sección: Mezclas */}
                        <div>
                          <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Mezclas (materia prima)
                          </p>
                          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                            {COLUMNAS_MEZCLA.map((col) => (
                              <div key={col.clave} className="space-y-1">
                                <Label
                                  htmlFor={`${clave}-${col.clave}`}
                                  className="text-xs text-muted-foreground"
                                >
                                  {col.label}
                                </Label>
                                <InputNumerico
                                  id={`${clave}-${col.clave}`}
                                  value={f[col.clave] as number}
                                  onChange={(v) => actualizarInsumo(clave, col.clave, v)}
                                />
                              </div>
                            ))}
                            {/* Saldo actual mezcla (readonly) */}
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">
                                Saldo Mezcla
                              </Label>
                              <InputNumerico value={saldoMezcla} readOnly />
                            </div>
                          </div>
                        </div>

                        <Separator />

                        {/* Sub-sección: Paquetes */}
                        <div>
                          <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Paquetes · {paqLabel}
                          </p>
                          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                            {COLUMNAS_PAQUETES.map((col) => (
                              <div key={col.clave} className="space-y-1">
                                <Label
                                  htmlFor={`${clave}-${col.clave}`}
                                  className="text-xs text-muted-foreground"
                                >
                                  {col.label}
                                </Label>
                                <InputNumerico
                                  id={`${clave}-${col.clave}`}
                                  value={f[col.clave] as number}
                                  onChange={(v) => actualizarInsumo(clave, col.clave, v)}
                                />
                              </div>
                            ))}
                            {/* Producción (readonly) */}
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">
                                Producción
                              </Label>
                              <InputNumerico value={produccion} readOnly />
                            </div>
                          </div>

                          {/* Ventas calculadas — resaltado */}
                          <div className="mt-2 flex items-center justify-between rounded-md bg-primary/5 px-3 py-2">
                            <span className="text-xs font-semibold text-muted-foreground">
                              Paq. vendidos ({paqLabel})
                            </span>
                            <span className="text-base font-bold tabular-nums text-primary">
                              {paqVendidos}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ─ 2. Resumen Ventas Confitados (calculadas, solo lectura) ─ */}
            <AccordionItem value="confitados" className="rounded-xl ring-1 ring-foreground/10">
              <AccordionTrigger className="px-4">
                <span className="flex items-center gap-2">
                  <Candy className="size-4 text-primary" />
                  Ventas Confitados
                  <Badge variant="secondary" className="ml-1 text-[10px]">Calculado</Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4">
                <p className="mb-3 text-xs text-muted-foreground">
                  Calculado automáticamente: Stock Inicial + Producción + Ing. Directo − Saldo Final
                </p>
                <div className="space-y-2">
                  {(Object.keys(MEZCLAS_LABELS) as ClaveMezcla[]).map((clave) => {
                    const paqLabel = PAQUETE_POR_MEZCLA[clave];
                    const paqVendidos = ventasCalculadas[clave];
                    const f = registro.insumos[clave];
                    const produccion = produccionPorMezcla[clave];

                    return (
                      <div key={clave} className="rounded-lg border bg-card px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold">
                              {MEZCLAS_LABELS[clave]}
                              <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                                {paqLabel}
                              </span>
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {f.saldoInicialPaquetes} + {produccion} + {f.ingresoDirectoPaquetes} − {f.saldoFinalPaquetes}
                            </p>
                          </div>
                          <span className="text-xl font-extrabold tabular-nums text-primary">
                            {paqVendidos}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ─ 3. Ventas Líquidos ─ */}
            <AccordionItem value="liquidos" className="rounded-xl ring-1 ring-foreground/10">
              <AccordionTrigger className="px-4">
                <span className="flex items-center gap-2">
                  <GlassWater className="size-4 text-primary" />
                  Ventas Líquidos
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                  {(Object.keys(LIQUIDOS_LABELS) as ClaveLiquido[]).map((clave) => (
                    <div key={clave} className="space-y-1">
                      <Label htmlFor={`liq-${clave}`} className="text-xs text-muted-foreground">
                        {LIQUIDOS_LABELS[clave]}
                      </Label>
                      <InputNumerico
                        id={`liq-${clave}`}
                        value={registro.liquidos[clave]}
                        onChange={(v) => actualizarLiquido(clave, v)}
                        placeholder="Unidades"
                      />
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ─ 4. Caja ─ */}
            <AccordionItem value="caja" className="rounded-xl ring-1 ring-foreground/10">
              <AccordionTrigger className="px-4">
                <span className="flex items-center gap-2">
                  <Banknote className="size-4 text-primary" />
                  Caja
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="caja-inicio" className="text-xs text-muted-foreground">
                        Dinero Inicio
                      </Label>
                      <Input
                        id="caja-inicio"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        placeholder="$0"
                        value={registro.caja.dineroInicio || ""}
                        onChange={(e) => actualizarCaja("dineroInicio", Number(e.target.value) || 0)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="caja-cierre" className="text-xs text-muted-foreground">
                        Dinero Cierre
                      </Label>
                      <Input
                        id="caja-cierre"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        placeholder="$0"
                        value={registro.caja.dineroCierre || ""}
                        onChange={(e) => actualizarCaja("dineroCierre", Number(e.target.value) || 0)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="caja-gastos" className="text-xs text-muted-foreground">
                        Gastos
                      </Label>
                      <Input
                        id="caja-gastos"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        placeholder="$0"
                        value={registro.caja.gastos || ""}
                        onChange={(e) => actualizarCaja("gastos", Number(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <Separator />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Diferencia</Label>
                      <p
                        className={`text-lg font-semibold ${
                          diferenciaCaja < 0
                            ? "text-red-500"
                            : diferenciaCaja > 0
                              ? "text-green-600"
                              : "text-foreground"
                        }`}
                      >
                        {formatearCLP(diferenciaCaja)}
                      </p>
                    </div>

                    {diferenciaCaja < 0 && <Badge variant="destructive">Faltante</Badge>}
                    {diferenciaCaja > 0 && (
                      <Badge className="bg-green-600/15 text-green-700 dark:bg-green-500/20 dark:text-green-400">
                        Sobrante
                      </Badge>
                    )}
                    {diferenciaCaja === 0 && <Badge variant="secondary">Cuadra</Badge>}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* ── Botón guardar ── */}
          <Button
            className="w-full lg:w-auto"
            size="lg"
            onClick={guardarRegistro}
            disabled={mutacionGuardar.isPending}
          >
            <Save className="size-4" data-icon="inline-start" />
            {mutacionGuardar.isPending ? "Guardando…" : "Guardar Registro"}
          </Button>
        </div>
      </div>
    </div>
  );
}
