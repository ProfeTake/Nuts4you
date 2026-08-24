// ─── PagosPeriodo ────────────────────────────────────────────────────────────
// Liquidación del personal, presentada como la planilla del cliente
// ("Sueldos Feb 2026.xlsx", hoja PAGO TURNOS) filtrada por vendedora:
//
//   una fila = un turno       TOTAL = pago diario + bono + horas extra
//   bloque de cierre (K162)   Subtotal − descuento de caja + ajuste − cotizaciones
//
// Se liquida de a una persona: el admin elige a la vendedora, revisa sus turnos
// tal como los revisaría en el Excel y genera SU pago. Antes esta pantalla
// mostraba una tabla agregada por vendedor con el detalle escondido tras un
// desplegable, que es justo el grano que el cliente NO usa para pensar.
//
// Solo entran turnos CERRADOS + recepción confirmada + sin pago previo.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Banknote, Loader2, AlertTriangle, CheckCircle2, Trash2, History, Users,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

import { apiGet, apiPost, apiDelete, api } from "@/lib/api";
import { formatearCLP } from "@/lib/money";
import type { ConfigSueldosGlobal, TurnoPorPagar } from "@/tipos/admin.tipos";

// ─── Tipos de API ────────────────────────────────────────────────────────────

interface VendedorResumen {
  usuarioId: number;
  nombre: string;
  diasTrabajados: number;
  turnoIds: number[];
  pagoDiario: number;
  montoBase: number;
  montoBonos: number;
  montoExtras: number;
  montoDescuentos: number;
  montoAdicional: number;
  montoCotizaciones: number;
  netoCaja: number;
  montoTotal: number;
  /** Detalle fila por fila, como la planilla. */
  turnos: TurnoPorPagar[];
}

interface ResumenPago extends ConfigSueldosGlobal {
  desde: string;
  hasta: string;
  vendedores: VendedorResumen[];
  turnosSinRecepcion: number;
}

interface PagoGenerado {
  id: number;
  usuarioId: number | null;
  nombre: string;
  desde: string;
  hasta: string;
  diasTrabajados: number;
  montoBase: number;
  montoBonos: number;
  montoExtras: number;
  montoDescuentos: number;
  montoAdicional: number;
  montoCotizaciones: number;
  montoTotal: number;
  creadoPor: string | null;
  creadoEn: string;
  // Pago hecho con el efectivo de una sucursal ("Pagar a vendedor", en Cierre de
  // turno): null cuando el pago se generó por período desde esta pantalla.
  pdvNombre?: string | null;
}

/** Cierre del período de UNA vendedora (planilla, celdas H163 y H164). */
interface AjusteVendedor { ajuste: string; cotizaciones: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Opciones de "Horas extra" del turno: los mismos cuatro valores que acepta la
 * planilla (columna E). Se guardan en décimas para no usar decimales.
 */
const OPCIONES_EXTRA = [
  { decimas: 0,  etiqueta: "—" },
  { decimas: 5,  etiqueta: "0,5" },
  { decimas: 10, etiqueta: "1" },
  { decimas: 15, etiqueta: "1,5" },
];

/** Fecha de hoy en Chile (YYYY-MM-DD) — espejo del helper del backend. */
function fechaHoyChile(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/** Resta n días a una fecha YYYY-MM-DD (aritmética UTC, sin sorpresas de zona). */
function restarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatearFechaCorta(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

const numero = (s: string) => Number(s) || 0;

// ─── Componente ──────────────────────────────────────────────────────────────

export function PagosPeriodo() {
  const queryClient = useQueryClient();
  const hoy = fechaHoyChile();

  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [confirmarAbierto, setConfirmarAbierto] = useState(false);
  const [anulandoId, setAnulandoId] = useState<number | null>(null);
  // Vendedora cuya planilla se está mirando. null = la primera del rango.
  // Derivado en el render en vez de sincronizado con un efecto, para que un
  // refetch no cambie la selección bajo los pies del admin.
  const [vendedoraElegida, setVendedoraElegida] = useState<number | null>(null);
  // Cierre del período que el admin escribió, por vendedora. Lo no tocado se
  // deriva del servidor, así un refetch no pisa lo que está tipeando.
  const [ajustes, setAjustes] = useState<Record<number, AjusteVendedor>>({});

  const rangoValido = !!desde && !!hasta && desde <= hasta;

  // ── Preview del rango ──
  const { data: resumen, isFetching: cargandoResumen } = useQuery({
    queryKey: ["rrhh", "pagos-resumen", desde, hasta],
    queryFn: () =>
      apiGet<{ data: ResumenPago }>(`/rrhh/pagos/resumen?desde=${desde}&hasta=${hasta}`)
        .then((r) => r.data),
    enabled: rangoValido,
    throwOnError: false,
  });

  // ── Historial de pagos generados ──
  const { data: pagos = [] } = useQuery({
    queryKey: ["rrhh", "pagos"],
    queryFn: () => apiGet<{ data: PagoGenerado[] }>("/rrhh/pagos").then((r) => r.data),
    throwOnError: false,
  });

  const vendedores = resumen?.vendedores ?? [];
  const vendedora =
    vendedores.find((v) => v.usuarioId === vendedoraElegida) ?? vendedores[0] ?? null;

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["rrhh", "pagos"] });
    queryClient.invalidateQueries({ queryKey: ["rrhh", "pagos-resumen"] });
    queryClient.invalidateQueries({ queryKey: ["rrhh", "nomina"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "pagos-pendientes"] });
  };

  // ── Cierre del período (planilla, celdas H163 "Ajuste" y H164 "Cotizaciones") ──
  // Las cotizaciones vienen prellenadas con el valor sugerido en Configuración.
  const ajusteDe = (v: VendedorResumen): AjusteVendedor => ajustes[v.usuarioId] ?? {
    ajuste:       String(v.montoAdicional),
    cotizaciones: String(resumen?.cotizacionesDefault ?? v.montoCotizaciones),
  };
  const setAjuste = (usuarioId: number, campo: keyof AjusteVendedor, valor: string, actual: AjusteVendedor) =>
    setAjustes((prev) => ({ ...prev, [usuarioId]: { ...actual, [campo]: valor.replace(/\D/g, "") } }));

  /** Total de la vendedora recalculado en vivo con lo que hay escrito. */
  const totalCon = (v: VendedorResumen) => {
    const a = ajusteDe(v);
    return v.montoBase + v.montoBonos + v.montoExtras - v.montoDescuentos
      + numero(a.ajuste) - numero(a.cotizaciones);
  };

  // ── Horas extra de un turno (planilla, columna E) ──
  const mutExtra = useMutation({
    mutationFn: (payload: { turnoId: number; extraDecimas: number }) =>
      api(`/rrhh/turnos/${payload.turnoId}/extra`, {
        method: "PATCH",
        body: { extraDecimas: payload.extraDecimas },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rrhh", "pagos-resumen"] }),
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "No se pudieron guardar las horas extra"),
  });

  // ── Generar el pago de LA vendedora en pantalla ──
  const mutGenerar = useMutation({
    mutationFn: () => {
      const a = ajusteDe(vendedora!);
      return apiPost<{ data: { mensaje: string } }>("/rrhh/pagos", {
        desde, hasta,
        usuarioIds: [vendedora!.usuarioId],
        ajustes: [{
          usuarioId:    vendedora!.usuarioId,
          adicional:    numero(a.ajuste),
          cotizaciones: numero(a.cotizaciones),
        }],
      });
    },
    onSuccess: (res) => {
      toast.success("Pago generado", { description: res.data.mensaje });
      setConfirmarAbierto(false);
      setVendedoraElegida(null); // sus turnos ya no están: pasa a la siguiente
      setAjustes({});            // los montos quedaron congelados en el pago
      invalidar();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "No se pudo generar el pago");
      setConfirmarAbierto(false);
    },
  });

  // ── Anular ──
  const mutAnular = useMutation({
    mutationFn: (id: number) => apiDelete<{ data: { mensaje: string } }>(`/rrhh/pagos/${id}`),
    onSuccess: () => {
      toast.success("Pago anulado", { description: "Sus turnos vuelven a estar pendientes de pago" });
      setAnulandoId(null);
      invalidar();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "No se pudo anular el pago");
      setAnulandoId(null);
    },
  });

  const pagoAAnular = pagos.find((p) => p.id === anulandoId) ?? null;
  const totalVendedora = vendedora ? totalCon(vendedora) : 0;
  const puedePagar = vendedora !== null && totalVendedora > 0;

  // Rangos rápidos: día / semana (últimos 7 días) / mes (desde el día 1)
  const aplicarRango = (tipo: "hoy" | "semana" | "mes") => {
    if (tipo === "hoy") { setDesde(hoy); setHasta(hoy); }
    else if (tipo === "semana") { setDesde(restarDias(hoy, 6)); setHasta(hoy); }
    else { setDesde(`${hoy.slice(0, 7)}-01`); setHasta(hoy); }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="px-4 py-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <Banknote className="size-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold">Liquidar sueldos</p>
              <p className="text-xs text-muted-foreground">
                Elige el período y la vendedora: verás sus turnos uno por uno y el total a pagarle
              </p>
            </div>
          </div>

          {/* ── Paso 1: período ── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="pago-desde" className="text-xs">Desde</Label>
              <Input id="pago-desde" type="date" value={desde} max={hoy}
                onChange={(e) => setDesde(e.target.value)} className="h-9 w-40 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pago-hasta" className="text-xs">Hasta</Label>
              <Input id="pago-hasta" type="date" value={hasta} max={hoy}
                onChange={(e) => setHasta(e.target.value)} className="h-9 w-40 text-sm" />
            </div>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => aplicarRango("hoy")}>Hoy</Button>
              <Button variant="outline" size="sm" onClick={() => aplicarRango("semana")}>Últimos 7 días</Button>
              <Button variant="outline" size="sm" onClick={() => aplicarRango("mes")}>Mes en curso</Button>
            </div>
          </div>

          {/* Aviso: turnos sin recepción confirmada en el rango */}
          {rangoValido && (resumen?.turnosSinRecepcion ?? 0) > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>
                Hay <b>{resumen!.turnosSinRecepcion}</b> turno{resumen!.turnosSinRecepcion !== 1 ? "s" : ""} cerrado{resumen!.turnosSinRecepcion !== 1 ? "s" : ""} sin
                recepción confirmada en este rango — no entran al pago hasta que confirmes la recepción del dinero en Sucursales.
              </span>
            </div>
          )}

          {!rangoValido ? (
            <p className="text-xs text-muted-foreground">Selecciona un rango válido.</p>
          ) : cargandoResumen ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Calculando…
            </div>
          ) : vendedores.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
              Sin turnos pendientes de pago en este rango
            </p>
          ) : (
            <>
              {/* ── Paso 2: vendedora ── */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="size-3.5" />
                  {vendedores.length} vendedora{vendedores.length !== 1 ? "s" : ""} con turnos por pagar
                </div>
                <div className="flex flex-wrap gap-2">
                  {vendedores.map((v) => {
                    const activa = v.usuarioId === vendedora?.usuarioId;
                    return (
                      <button
                        key={v.usuarioId}
                        type="button"
                        onClick={() => setVendedoraElegida(v.usuarioId)}
                        className={`rounded-lg border px-3 py-1.5 text-left transition-colors ${
                          activa
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "hover:bg-muted/60"
                        }`}
                      >
                        <span className="block text-sm font-medium">{v.nombre}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {v.diasTrabajados} turno{v.diasTrabajados !== 1 ? "s" : ""} · {formatearCLP(totalCon(v))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Paso 3: la planilla de esa vendedora ── */}
              {vendedora && (
                <PlanillaVendedora
                  vendedora={vendedora}
                  desde={desde}
                  hasta={hasta}
                  toleranciaFaltante={resumen!.toleranciaFaltante}
                  ajuste={ajusteDe(vendedora)}
                  total={totalVendedora}
                  guardandoExtra={mutExtra.isPending}
                  onCambiarExtra={(turnoId, extraDecimas) => mutExtra.mutate({ turnoId, extraDecimas })}
                  onCambiarAjuste={(campo, valor) =>
                    setAjuste(vendedora.usuarioId, campo, valor, ajusteDe(vendedora))}
                />
              )}

              {!puedePagar && vendedora && (
                <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <span>
                    El pago de {vendedora.nombre} no queda positivo. Revisa las cotizaciones y los
                    faltantes de caja: no se puede generar un pago en cero o negativo.
                  </span>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={!puedePagar}
                  onClick={() => setConfirmarAbierto(true)}
                >
                  <CheckCircle2 className="size-4 mr-1.5" />
                  Generar pago de {vendedora?.nombre}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Historial de pagos generados ── */}
      {pagos.length > 0 && (
        <Card>
          <CardContent className="px-4 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <History className="size-4 text-muted-foreground" />
              <p className="text-sm font-bold">Pagos generados</p>
            </div>
            <div className="rounded-xl border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground bg-muted/40">
                    <th className="px-3 py-2 font-medium">Período</th>
                    <th className="px-3 py-2 font-medium">Vendedor/a</th>
                    <th className="px-3 py-2 font-medium text-center">Turnos</th>
                    <th className="px-3 py-2 font-medium text-right">Total pagado</th>
                    <th className="px-3 py-2 font-medium">Generado por</th>
                    <th className="px-3 py-2 font-medium text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                        {p.desde === p.hasta
                          ? formatearFechaCorta(p.desde)
                          : `${formatearFechaCorta(p.desde)} – ${formatearFechaCorta(p.hasta)}`}
                      </td>
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{p.nombre}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{p.diasTrabajados}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{formatearCLP(p.montoTotal)}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {p.creadoPor ?? "—"} · {formatearFechaCorta(p.creadoEn.slice(0, 10))}
                        {/* Pagado con la caja de un punto: anularlo devuelve el
                            monto al "a depositar" de esa sucursal. */}
                        {p.pdvNombre && (
                          <span className="ml-2 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                            caja {p.pdvNombre}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => setAnulandoId(p.id)}
                        >
                          <Trash2 className="size-3" />
                          Anular
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Diálogo: confirmar generación ── */}
      <Dialog open={confirmarAbierto} onOpenChange={(a) => !a && setConfirmarAbierto(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pagar a {vendedora?.nombre}</DialogTitle>
            <DialogDescription>
              {desde === hasta
                ? `Día ${formatearFechaCorta(desde)}`
                : `Período ${formatearFechaCorta(desde)} – ${formatearFechaCorta(hasta)}`}
              {" · "}{vendedora?.diasTrabajados ?? 0} turno{(vendedora?.diasTrabajados ?? 0) !== 1 ? "s" : ""}
              {" · total "}{formatearCLP(totalVendedora)}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esos turnos quedarán marcados como pagados y no volverán a entrar en
            pagos futuros. Puedes anular el pago desde el historial si te equivocas.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarAbierto(false)}>Cancelar</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={mutGenerar.isPending}
              onClick={() => mutGenerar.mutate()}
            >
              {mutGenerar.isPending
                ? <Loader2 className="size-4 mr-1.5 animate-spin" />
                : <CheckCircle2 className="size-4 mr-1.5" />}
              Generar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: confirmar anulación ── */}
      <Dialog open={anulandoId !== null} onOpenChange={(a) => !a && setAnulandoId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Anular pago</DialogTitle>
            <DialogDescription>
              {pagoAAnular
                ? `${pagoAAnular.nombre} — ${formatearCLP(pagoAAnular.montoTotal)} (${formatearFechaCorta(pagoAAnular.desde)}${pagoAAnular.desde !== pagoAAnular.hasta ? ` – ${formatearFechaCorta(pagoAAnular.hasta)}` : ""})`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            El registro se elimina y sus turnos vuelven a quedar pendientes de
            pago (podrán incluirse en una nueva generación).
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnulandoId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={mutAnular.isPending}
              onClick={() => anulandoId !== null && mutAnular.mutate(anulandoId)}
            >
              {mutAnular.isPending
                ? <Loader2 className="size-4 mr-1.5 animate-spin" />
                : <Trash2 className="size-4 mr-1.5" />}
              Anular pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── PlanillaVendedora ────────────────────────────────────────────────────────
// La hoja del Excel de UNA vendedora: sus turnos arriba, su cierre abajo.
// Las columnas y el orden son los de la planilla para que el cliente reconozca
// lo que ya sabe leer. Lo único editable en las filas son las horas extra.

function PlanillaVendedora({
  vendedora, desde, hasta, toleranciaFaltante,
  ajuste, total, guardandoExtra, onCambiarExtra, onCambiarAjuste,
}: {
  vendedora: VendedorResumen;
  desde: string;
  hasta: string;
  toleranciaFaltante: number;
  ajuste: AjusteVendedor;
  total: number;
  guardandoExtra: boolean;
  onCambiarExtra: (turnoId: number, extraDecimas: number) => void;
  onCambiarAjuste: (campo: keyof AjusteVendedor, valor: string) => void;
}) {
  const subtotal = vendedora.montoBase + vendedora.montoBonos + vendedora.montoExtras;

  return (
    <div className="rounded-xl border overflow-hidden">
      {/* Encabezado de la hoja */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
        <p className="text-sm font-bold">{vendedora.nombre}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatearFechaCorta(desde)} – {formatearFechaCorta(hasta)}
          {" · "}pago por turno {formatearCLP(vendedora.pagoDiario)}
        </p>
      </div>

      {/* Una fila por turno */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Sucursal</th>
              <th className="px-3 py-2 font-medium text-right">Venta</th>
              <th className="px-3 py-2 font-medium text-right">Diferencia</th>
              <th className="px-3 py-2 font-medium text-right">Pago diario</th>
              <th className="px-3 py-2 font-medium text-right">Bono</th>
              <th className="px-3 py-2 font-medium text-center w-24">Horas extra</th>
              <th className="px-3 py-2 font-medium text-right">Total turno</th>
            </tr>
          </thead>
          <tbody>
            {vendedora.turnos.map((t) => (
              <tr key={t.turnoId} className="border-b last:border-0">
                <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">{formatearFechaCorta(t.fecha)}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{t.pdvNombre}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatearCLP(t.venta)}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums ${
                  t.diferenciaCaja < 0 ? "text-red-600"
                    : t.diferenciaCaja > 0 ? "text-emerald-600" : "text-muted-foreground"
                }`}>
                  {t.diferenciaCaja === 0 ? "—" : formatearCLP(t.diferenciaCaja)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatearCLP(vendedora.pagoDiario)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600">
                  {t.bono > 0 ? `+${formatearCLP(t.bono)}` : "—"}
                </td>
                <td className="px-2 py-1">
                  <Select
                    value={String(t.extraDecimas)}
                    disabled={guardandoExtra}
                    onValueChange={(v) => onCambiarExtra(t.turnoId, Number(v))}
                  >
                    <SelectTrigger className="h-7 w-full text-xs">
                      {/* La etiqueta va como children: Base UI mostraría las
                          décimas crudas (0/5/10/15) en vez de 0,5 · 1 · 1,5. */}
                      <SelectValue>
                        {OPCIONES_EXTRA.find((o) => o.decimas === t.extraDecimas)?.etiqueta}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {OPCIONES_EXTRA.map((o) => (
                        <SelectItem key={o.decimas} value={String(o.decimas)}>{o.etiqueta}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                  {formatearCLP(vendedora.pagoDiario + t.bono + t.montoExtra)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cierre del período — la parte de abajo de la planilla (celda K162) */}
      <div className="border-t bg-muted/20 px-4 py-3">
        <dl className="ml-auto max-w-md space-y-1.5 text-sm">
          <FilaCierre
            termino={`Subtotal · ${vendedora.diasTrabajados} turno${vendedora.diasTrabajados !== 1 ? "s" : ""}`}
            valor={formatearCLP(subtotal)}
          />
          <FilaCierre
            termino="Descuento por diferencias de caja"
            detalle={
              vendedora.montoDescuentos === 0
                ? `neto ${formatearCLP(vendedora.netoCaja)}, dentro de la tolerancia de ${formatearCLP(toleranciaFaltante)}`
                : `neto ${formatearCLP(vendedora.netoCaja)} del período`
            }
            valor={vendedora.montoDescuentos > 0 ? `− ${formatearCLP(vendedora.montoDescuentos)}` : "—"}
            clase={vendedora.montoDescuentos > 0 ? "text-red-600 font-semibold" : "text-muted-foreground"}
          />
          <FilaCierre
            termino="Ajuste"
            detalle="monto extra que se le suma a este pago"
            valor={
              <Input
                type="number" min={0} inputMode="numeric"
                value={ajuste.ajuste === "0" ? "" : ajuste.ajuste}
                onChange={(e) => onCambiarAjuste("ajuste", e.target.value)}
                placeholder="0"
                className="h-8 w-32 text-right tabular-nums text-sm"
              />
            }
          />
          <FilaCierre
            termino="Cotizaciones"
            detalle="se descuentan de este pago"
            valor={
              <Input
                type="number" min={0} inputMode="numeric"
                value={ajuste.cotizaciones === "0" ? "" : ajuste.cotizaciones}
                onChange={(e) => onCambiarAjuste("cotizaciones", e.target.value)}
                placeholder="0"
                className="h-8 w-32 text-right tabular-nums text-sm"
              />
            }
          />
          <div className="flex items-baseline justify-between gap-4 border-t pt-2">
            <dt className="font-bold">TOTAL A PAGAR</dt>
            <dd className={`text-xl font-bold tabular-nums ${total <= 0 ? "text-red-600" : ""}`}>
              {formatearCLP(total)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

/** Una línea del bloque de cierre: concepto (con su explicación) y monto. */
function FilaCierre({ termino, detalle, valor, clase }: {
  termino: string;
  detalle?: string;
  valor: React.ReactNode;
  clase?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="min-w-0">
        <span className="block">{termino}</span>
        {detalle && <span className="block text-[11px] text-muted-foreground leading-tight">{detalle}</span>}
      </dt>
      <dd className={`shrink-0 tabular-nums ${clase ?? ""}`}>{valor}</dd>
    </div>
  );
}
