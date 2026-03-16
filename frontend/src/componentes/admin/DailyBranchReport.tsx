// ─── DailyBranchReport ───
// Formulario de registro diario por sucursal.
// Diseño Mobile-First con secciones colapsables (Accordion).
// Sin integración backend — datos en estado local.

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
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
  ClaveConfitado,
  ClaveLiquido,
  FilaInsumo,
  RegistroDiario,
  Sucursal,
} from "@/tipos/admin.tipos";
import {
  SUCURSALES,
  MEZCLAS_LABELS,
  CONFITADOS_LABELS,
  LIQUIDOS_LABELS,
  COLUMNAS_INSUMO,
  crearRegistroVacio,
} from "@/datos/mock.admin.datos";
import { formatearCLP } from "@/hooks/useCarrito";

// ─── Helpers internos ───

/** Formatea la fecha actual en formato legible chileno */
function fechaHoy(): string {
  return new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ─── Componente principal ───

export function DailyBranchReport() {
  const [registro, setRegistro] = useState<RegistroDiario>(crearRegistroVacio);

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

  /** Saldo actual calculado por mezcla */
  const saldosActuales = useMemo(() => {
    const claves = Object.keys(registro.insumos) as ClaveMezcla[];
    return Object.fromEntries(
      claves.map((k) => {
        const f = registro.insumos[k];
        return [k, f.saldoInicial + f.ingreso - f.utilizado];
      })
    ) as Record<ClaveMezcla, number>;
  }, [registro.insumos]);

  // ── Confitados ──

  const actualizarConfitado = useCallback(
    (clave: ClaveConfitado, valor: number) => {
      setRegistro((prev) => ({
        ...prev,
        confitados: { ...prev.confitados, [clave]: valor },
      }));
    },
    []
  );

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
    // Simulación de guardado
    console.info("[DailyBranchReport] Registro guardado:", registro);
    toast.success(
      `Registro de ${registro.sucursal} guardado correctamente.`
    );
  }, [registro]);

  // ─── Render ───

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <ClipboardList className="size-6 text-primary" />
        <h1 className="text-xl font-semibold tracking-tight">
          Registro Diario por Sucursal
        </h1>
      </div>

      <Separator />

      {/* ── Sucursal + Fecha ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <MapPin className="size-4" />
            Sucursal y Fecha
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Select sucursal */}
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
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fecha (solo lectura) */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4" />
            <span className="first-letter:uppercase">{fechaHoy()}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Secciones colapsables ── */}
      <Accordion defaultValue={["insumos"]} className="space-y-2">
        {/* ─ 1. Control de Insumos ─ */}
        <AccordionItem value="insumos" className="rounded-xl ring-1 ring-foreground/10">
          <AccordionTrigger className="px-4">
            <span className="flex items-center gap-2">
              <Package className="size-4 text-primary" />
              Control de Insumos
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            <div className="space-y-5">
              {(Object.keys(MEZCLAS_LABELS) as ClaveMezcla[]).map((clave) => (
                <div key={clave}>
                  <p className="mb-2 text-sm font-medium text-foreground">
                    {MEZCLAS_LABELS[clave]}{" "}
                    <span className="text-muted-foreground">({clave})</span>
                  </p>

                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {/* Columnas editables */}
                    {COLUMNAS_INSUMO.map((col) => (
                      <div key={col.clave} className="space-y-1">
                        <Label
                          htmlFor={`${clave}-${col.clave}`}
                          className="text-xs text-muted-foreground"
                        >
                          {col.label}
                        </Label>
                        <Input
                          id={`${clave}-${col.clave}`}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={registro.insumos[clave][col.clave] || ""}
                          onChange={(e) =>
                            actualizarInsumo(
                              clave,
                              col.clave,
                              Number(e.target.value) || 0
                            )
                          }
                        />
                      </div>
                    ))}

                    {/* Saldo Actual (calculado, readonly) */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Saldo Actual
                      </Label>
                      <Input
                        type="number"
                        readOnly
                        value={saldosActuales[clave]}
                        className="bg-muted font-medium"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ─ 2. Ventas Confitados ─ */}
        <AccordionItem value="confitados" className="rounded-xl ring-1 ring-foreground/10">
          <AccordionTrigger className="px-4">
            <span className="flex items-center gap-2">
              <Candy className="size-4 text-primary" />
              Ventas Confitados
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {(Object.keys(CONFITADOS_LABELS) as ClaveConfitado[]).map(
                (clave) => (
                  <div key={clave} className="space-y-1">
                    <Label
                      htmlFor={`conf-${clave}`}
                      className="text-xs text-muted-foreground"
                    >
                      {CONFITADOS_LABELS[clave]}
                    </Label>
                    <Input
                      id={`conf-${clave}`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="Paquetes"
                      value={registro.confitados[clave] || ""}
                      onChange={(e) =>
                        actualizarConfitado(
                          clave,
                          Number(e.target.value) || 0
                        )
                      }
                    />
                  </div>
                )
              )}
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
              {(Object.keys(LIQUIDOS_LABELS) as ClaveLiquido[]).map(
                (clave) => (
                  <div key={clave} className="space-y-1">
                    <Label
                      htmlFor={`liq-${clave}`}
                      className="text-xs text-muted-foreground"
                    >
                      {LIQUIDOS_LABELS[clave]}
                    </Label>
                    <Input
                      id={`liq-${clave}`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="Unidades"
                      value={registro.liquidos[clave] || ""}
                      onChange={(e) =>
                        actualizarLiquido(
                          clave,
                          Number(e.target.value) || 0
                        )
                      }
                    />
                  </div>
                )
              )}
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
                {/* Dinero Inicio */}
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
                    onChange={(e) =>
                      actualizarCaja("dineroInicio", Number(e.target.value) || 0)
                    }
                  />
                </div>

                {/* Dinero Cierre */}
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
                    onChange={(e) =>
                      actualizarCaja("dineroCierre", Number(e.target.value) || 0)
                    }
                  />
                </div>

                {/* Gastos */}
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
                    onChange={(e) =>
                      actualizarCaja("gastos", Number(e.target.value) || 0)
                    }
                  />
                </div>
              </div>

              {/* Diferencia (readonly + badge) */}
              <Separator />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Diferencia
                  </Label>
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

                {diferenciaCaja < 0 && (
                  <Badge variant="destructive">Faltante</Badge>
                )}
                {diferenciaCaja > 0 && (
                  <Badge className="bg-green-600/15 text-green-700 dark:bg-green-500/20 dark:text-green-400">
                    Sobrante
                  </Badge>
                )}
                {diferenciaCaja === 0 && (
                  <Badge variant="secondary">Cuadra</Badge>
                )}
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
      >
        <Save className="size-4" data-icon="inline-start" />
        Guardar Registro
      </Button>
    </div>
  );
}
