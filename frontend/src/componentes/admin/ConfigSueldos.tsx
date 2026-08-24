// ─── ConfigSueldos ────────────────────────────────────────────────────────────
// Configuración completa del cálculo de sueldos, en un solo lugar (fusión de
// Sueldos + Bonos). Reemplaza al antiguo panel "Bonos", que solo editaba tramos.
//
// Refleja la planilla del cliente ("Sueldos Feb 2026.xlsx", hoja PAGO TURNOS):
//   fila del turno   K = pago diario (P13) + bono (tramos por sucursal) + 3.000 × horas extra
//   cierre período   K162 = Σ filas + IF(neto < −1000; neto; 0) + ajuste − cotizaciones
//
// Nombres en la UI: la columna E del Excel se llama "Adicional" y la celda H163
// también; como son cosas distintas (una por turno, otra por período) acá se
// llaman "horas extra" y "ajuste" respectivamente, para que no se confundan.
//
// Acá se editan los parámetros GLOBALES (pago diario, valor de la hora extra,
// cotizaciones sugeridas, tolerancia) y los TRAMOS por sucursal. El "ajuste" y
// las "cotizaciones" concretas de cada período se cargan al liquidar, en
// PagosPeriodo, porque cambian mes a mes.

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gift, Plus, Trash2, Save, Loader2, Info, SlidersHorizontal } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatearCLP } from "@/lib/money";
import { apiGet, api } from "@/lib/api";
import type { ConfigSueldosGlobal, ConfigBonoPdv, TramoBono } from "@/tipos/admin.tipos";

/**
 * Refresca todo lo que depende de estos parámetros. La config alimenta la nómina
 * informativa, el preview de liquidación, el historial y el pago desde caja: sin
 * esto los montos en pantalla quedaban calculados con los valores viejos.
 */
function useInvalidarCalculos() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [
      ["config-nomina"], ["config-bonos"],
      ["rrhh", "nomina"], ["rrhh", "pagos"], ["rrhh", "pagos-resumen"],
      ["admin", "pagos-pendientes"],
    ]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

export function ConfigSueldos() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 px-3 py-2.5 text-xs text-blue-700 dark:text-blue-400">
        <Info className="size-4 mt-0.5 shrink-0" />
        <span>
          Cada turno cerrado se paga como <strong>pago diario + bono + horas extra</strong>.
          El bono depende de la venta de ese día y de la sucursal donde se trabajó (gana el
          umbral más alto alcanzado). Al final del período se descuentan los faltantes de caja
          y las cotizaciones. Los cambios de acá afectan a todas las liquidaciones que aún no
          se han generado.
        </span>
      </div>

      <ParametrosGlobales />
      <TramosPorSucursal />
    </div>
  );
}

// ─── Parámetros globales (ConfigNomina) ───────────────────────────────────────

/** Campos editables, en el orden en que se muestran. */
const CAMPOS: Array<{
  clave: keyof ConfigSueldosGlobal;
  etiqueta: string;
  ayuda: string;
  placeholder: string;
}> = [
  {
    clave: "pagoDiarioBase",
    etiqueta: "Pago por turno (CLP)",
    ayuda: "Lo que gana un vendedor por cada turno trabajado. Se puede sobrescribir por persona en la pestaña Personal.",
    placeholder: "28000",
  },
  {
    clave: "valorExtra",
    etiqueta: "Valor de la hora extra (CLP)",
    ayuda: "Cuánto se paga por una hora extra. Un turno con 0,5 suma la mitad.",
    placeholder: "3000",
  },
  {
    clave: "cotizacionesDefault",
    etiqueta: "Cotizaciones sugeridas (CLP)",
    ayuda: "Prellena el campo de cotizaciones al liquidar. Se puede cambiar en cada pago.",
    placeholder: "0",
  },
  {
    clave: "toleranciaFaltante",
    etiqueta: "Tolerancia de caja (CLP)",
    ayuda: "Se suman todas las diferencias del período (los sobrantes compensan). Solo si el neto queda peor que este monto se descuenta, y se descuenta completo.",
    placeholder: "1000",
  },
];

function ParametrosGlobales() {
  const invalidar = useInvalidarCalculos();
  // null = el admin todavía no escribió nada; se muestra lo guardado. Derivado en
  // el render en vez de sincronizado con un efecto, para que un refetch de fondo
  // no pise lo que está tipeando (mismo patrón que los tramos, más abajo).
  const [edicion, setEdicion] = useState<Partial<Record<keyof ConfigSueldosGlobal, string>>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["config-nomina"],
    queryFn:  () => apiGet<{ data: ConfigSueldosGlobal }>("/config-nomina").then((r) => r.data),
  });

  const valorDe = (clave: keyof ConfigSueldosGlobal): string =>
    edicion[clave] ?? (data ? String(data[clave]) : "");

  const numeroDe = (clave: keyof ConfigSueldosGlobal) => Number(valorDe(clave)) || 0;

  const sinCambios = !data || CAMPOS.every((c) => numeroDe(c.clave) === data[c.clave]);

  const mutGuardar = useMutation({
    mutationFn: (payload: ConfigSueldosGlobal) =>
      api("/config-nomina", { method: "PUT", body: payload }),
    onSuccess: () => {
      toast.success("Parámetros de sueldo guardados");
      setEdicion({}); // vuelve a seguir los valores del servidor
      invalidar();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al guardar"),
  });

  const guardar = () =>
    mutGuardar.mutate(
      Object.fromEntries(CAMPOS.map((c) => [c.clave, numeroDe(c.clave)])) as unknown as ConfigSueldosGlobal,
    );

  const tolerancia = Math.max(0, numeroDe("toleranciaFaltante"));

  return (
    <Card>
      <CardContent className="px-4 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Parámetros generales</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {CAMPOS.map((campo) => (
            <div key={campo.clave} className="space-y-1.5">
              <Label className="text-xs font-medium">{campo.etiqueta}</Label>
              <Input
                type="number" min={0} inputMode="numeric"
                value={isLoading ? "" : valorDe(campo.clave)}
                disabled={isLoading}
                onChange={(e) =>
                  setEdicion((prev) => ({ ...prev, [campo.clave]: e.target.value.replace(/\D/g, "") }))
                }
                placeholder={campo.placeholder}
                className="text-right tabular-nums"
              />
              <p className="text-[11px] text-muted-foreground leading-snug">{campo.ayuda}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={guardar} disabled={isLoading || mutGuardar.isPending || sinCambios}>
            {mutGuardar.isPending
              ? <Loader2 className="size-4 mr-1 animate-spin" />
              : <Save className="size-4 mr-1" />}
            Guardar parámetros
          </Button>
        </div>

        {!isLoading && (
          <div className="border-t pt-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Vista previa:</p>
            <p>
              Un turno sin bono ni horas extra paga {formatearCLP(numeroDe("pagoDiarioBase"))};
              con 0,5 horas extra paga {formatearCLP(numeroDe("pagoDiarioBase") + Math.round(numeroDe("valorExtra") / 2))}.
            </p>
            <p>Neto de caja del período −{formatearCLP(tolerancia)} o mejor → no se descuenta nada.</p>
            <p>Neto de caja −{formatearCLP(tolerancia + 500)} → se descuentan {formatearCLP(tolerancia + 500)}.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Tramos de bono por sucursal (ConfigBono) ─────────────────────────────────

function TramosPorSucursal() {
  const invalidar = useInvalidarCalculos();
  // null = todavía no eligió: se muestra el primer PDV. Derivado en vez de
  // asignado desde un efecto, que provocaba un render extra en cada carga.
  const [pdvElegido, setPdvElegido] = useState<number | null>(null);

  const { data: config = [], isLoading } = useQuery({
    queryKey: ["config-bonos"],
    queryFn:  () => apiGet<{ data: ConfigBonoPdv[] }>("/config-bonos").then((r) => r.data),
  });

  const pdvSeleccionado = pdvElegido ?? config[0]?.pdvId ?? null;

  const pdvActual = useMemo(
    () => config.find((c) => c.pdvId === pdvSeleccionado) ?? null,
    [config, pdvSeleccionado],
  );

  // Tramos en edición. Se guarda a QUÉ PDV pertenecen para poder derivarlos en el
  // render: si el admin cambia de sucursal (o llegan datos nuevos del servidor),
  // la edición deja de aplicar sola y se muestran los tramos del PDV actual. Antes
  // esto se sincronizaba con un useEffect + setState, que renderizaba dos veces y
  // pisaba lo que el admin estuviera escribiendo al refrescar la query.
  const [edicion, setEdicion] = useState<{ pdvId: number; tramos: TramoBono[] } | null>(null);
  // Memoizado porque deriva un array nuevo: sin esto cambia de identidad en cada
  // render y arrastra a los useMemo que dependen de él.
  //
  // El `pdvActual !== null` NO es redundante: mientras carga la query no hay PDV,
  // y comparar `edicion?.pdvId === pdvActual?.pdvId` daba `undefined === undefined`
  // → true → se leía `edicion!.tramos` sobre null y el panel completo reventaba.
  const tramos: TramoBono[] = useMemo(
    () => (pdvActual !== null && edicion?.pdvId === pdvActual.pdvId
      ? edicion.tramos
      : (pdvActual?.tramos.map((t) => ({ umbral: t.umbral, monto: t.monto })) ?? [])),
    [edicion, pdvActual],
  );

  const setTramos = (actualizar: (previos: TramoBono[]) => TramoBono[]) => {
    if (!pdvActual) return;
    setEdicion({ pdvId: pdvActual.pdvId, tramos: actualizar(tramos) });
  };

  const mutGuardar = useMutation({
    mutationFn: (payload: { pdvId: number; tramos: TramoBono[] }) =>
      api(`/config-bonos/${payload.pdvId}`, {
        method: "PUT",
        body: { tramos: payload.tramos.map((t) => ({ umbral: t.umbral, monto: t.monto })) },
      }),
    onSuccess: () => {
      toast.success("Tramos de bono guardados");
      setEdicion(null); // ya está en el servidor: vuelve a seguir esos datos
      invalidar();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al guardar"),
  });

  const actualizarTramo = (i: number, campo: "umbral" | "monto", valor: number) =>
    setTramos((prev) => prev.map((t, idx) => (idx === i ? { ...t, [campo]: valor } : t)));

  const agregarTramo = () => setTramos((prev) => [...prev, { umbral: 0, monto: 0 }]);
  const eliminarTramo = (i: number) => setTramos((prev) => prev.filter((_, idx) => idx !== i));

  const hayDuplicados = useMemo(() => {
    const us = tramos.map((t) => t.umbral);
    return new Set(us).size !== us.length;
  }, [tramos]);

  const guardar = () => {
    if (pdvSeleccionado === null) return;
    if (hayDuplicados) { toast.error("Hay umbrales duplicados"); return; }
    mutGuardar.mutate({ pdvId: pdvSeleccionado, tramos });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando tramos de bono…
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="px-4 py-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Gift className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Tramos de bono por sucursal</h3>
          </div>
          <Select
            value={pdvSeleccionado !== null ? String(pdvSeleccionado) : undefined}
            onValueChange={(v) => setPdvElegido(Number(v))}
          >
            <SelectTrigger className="h-9 w-full sm:w-56">
              {/* Base UI muestra el value crudo si no se le pasa la etiqueta como
                  children: sin esto el combo decía "4" en vez de "Open Plaza". */}
              <SelectValue placeholder="Selecciona una sucursal">
                {pdvActual?.pdvNombre}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {config.map((c) => (
                <SelectItem key={c.pdvId} value={String(c.pdvId)}>{c.pdvNombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {pdvActual && (
          <>
            {/* Los tramos del fallback se aplican en el cálculo aunque no estén en
                la BD: se avisa para que el admin sepa que lo que ve es lo vigente
                y que guardando los deja fijos (y editables). */}
            {pdvActual.origen === "planilla" && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <Info className="size-4 shrink-0 mt-0.5" />
                <span>
                  Estos son los tramos de la planilla del cliente, que hoy se aplican por
                  defecto pero <b>no están guardados</b>. Púlsalos con "Guardar tramos" para
                  fijarlos y poder editarlos.
                </span>
              </div>
            )}
            {pdvActual.origen === "sin-configurar" && tramos.length === 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                <Info className="size-4 shrink-0 mt-0.5" />
                <span>
                  {pdvActual.pdvNombre} no tiene tramos: los turnos de esa sucursal pagan
                  bono $0. Agrega al menos uno.
                </span>
              </div>
            )}

            {tramos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Sin tramos configurados para {pdvActual.pdvNombre}. Agrega uno para empezar.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground px-1">
                  <span>Venta diaria desde (CLP)</span>
                  <span>Bono (CLP)</span>
                  <span></span>
                </div>
                {tramos.map((t, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <Input
                      type="number" min={0} inputMode="numeric"
                      value={t.umbral || ""}
                      onChange={(e) => actualizarTramo(i, "umbral", Number(e.target.value) || 0)}
                      placeholder="250000"
                      className="text-right tabular-nums"
                    />
                    <Input
                      type="number" min={0} inputMode="numeric"
                      value={t.monto || ""}
                      onChange={(e) => actualizarTramo(i, "monto", Number(e.target.value) || 0)}
                      placeholder="6000"
                      className="text-right tabular-nums"
                    />
                    <Button
                      variant="ghost" size="icon" className="size-9 text-red-500 hover:bg-red-500/10"
                      title="Eliminar tramo" onClick={() => eliminarTramo(i)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {hayDuplicados && (
              <p className="text-xs text-red-600">Hay dos tramos con el mismo umbral. Corrige antes de guardar.</p>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={agregarTramo}>
                <Plus className="size-4 mr-1" /> Agregar tramo
              </Button>
              <Button
                size="sm" className="sm:ml-auto"
                onClick={guardar}
                disabled={mutGuardar.isPending || hayDuplicados}
              >
                {mutGuardar.isPending
                  ? <Loader2 className="size-4 mr-1 animate-spin" />
                  : <Save className="size-4 mr-1" />}
                Guardar tramos
              </Button>
            </div>

            {/* Vista previa */}
            {tramos.length > 0 && (
              <div className="border-t pt-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Vista previa — {pdvActual.pdvNombre}:</p>
                {[...tramos].sort((a, b) => b.umbral - a.umbral).map((t, i) => (
                  <p key={i}>
                    Venta ≥ {formatearCLP(t.umbral)} → bono {formatearCLP(t.monto)}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
