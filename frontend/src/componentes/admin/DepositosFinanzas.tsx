// ─── DepositosFinanzas ───────────────────────────────────────────────────────
// Módulo de control de Depósitos Z diarios por sucursal.
// Conectado a GET/PATCH /api/finanzas/depositos.

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRightLeft,
  Filter,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

// shadcn/ui
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Tipos
import type { EstadoDeposito } from "@/tipos/admin.tipos";

// API + helpers
import { apiGet, apiPatch } from "@/lib/api";
import { formatearCLP } from "@/lib/money";

// ─── Tipos de respuesta API ─────────────────────────────────────────────────

interface RegistroDeposito {
  id: number;
  turnoId: number;
  fechaVenta: string;
  fechaDeposito: string | null;
  pdvId: number;
  sucursal: string;
  sucursalNombre: string;
  vendedor: string;
  montoADepositar: number;
  montoDepositado: number;
  faltaDepositar: number;
  estado: EstadoDeposito;
}

// ─── Helpers visuales ──────────────────────────────────────────────────────

function clasesBadgeEstado(estado: EstadoDeposito): string {
  switch (estado) {
    case "Depositado":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30";
    case "Transferencia":
      return "bg-blue-500/10 text-blue-700 border-blue-500/30";
    case "No depositado":
      return "bg-red-500/10 text-red-700 border-red-500/30";
  }
}

function IconoEstado({ estado }: { estado: EstadoDeposito }) {
  switch (estado) {
    case "Depositado":
      return <CheckCircle2 className="size-3.5 shrink-0" />;
    case "Transferencia":
      return <ArrowRightLeft className="size-3.5 shrink-0" />;
    case "No depositado":
      return <Clock className="size-3.5 shrink-0" />;
  }
}

function formatearFecha(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

// ─── Componente principal ──────────────────────────────────────────────────

export function DepositosFinanzas() {
  const queryClient = useQueryClient();
  const [filtraSucursal, setFiltraSucursal] = useState<string>("TODAS");
  const [filtraEstado, setFiltraEstado] = useState<EstadoDeposito | "TODOS">(
    "TODOS"
  );

  // Bottom-sheet mobile
  const [detalleId, setDetalleId] = useState<number | null>(null);

  // ── Cargar depósitos ──
  const {
    data: registros = [],
    isLoading: cargando,
  } = useQuery({
    queryKey: ["finanzas", "depositos"],
    queryFn: () =>
      apiGet<{ data: RegistroDeposito[] }>("/finanzas/depositos")
        .then((r) => r.data),
    throwOnError: false,
  });

  const detalle = useMemo(
    () => registros.find((r) => r.id === detalleId) ?? null,
    [registros, detalleId]
  );

  // ── Mutación: marcar como depositado ──
  const mutacionDeposito = useMutation({
    mutationFn: (id: number) =>
      apiPatch<unknown>(`/finanzas/depositos/${id}`, { estado: "CONFIRMADO" }),
    onSuccess: (_, id) => {
      queryClient.setQueryData<RegistroDeposito[]>(
        ["finanzas", "depositos"],
        (prev = []) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  montoDepositado: r.montoADepositar,
                  faltaDepositar: 0,
                  estado: "Depositado" as EstadoDeposito,
                  fechaDeposito: new Date().toISOString().slice(0, 10),
                }
              : r
          )
      );
    },
    onError: () => toast.error("No se pudo confirmar el depósito"),
  });

  // ── Sucursales únicas para el filtro ──
  const sucursalesUnicas = useMemo(() => {
    const set = new Set(registros.map((r) => r.sucursalNombre));
    return Array.from(set).sort();
  }, [registros]);

  // ── Registros filtrados ──
  const filtrados = useMemo(() => {
    return registros.filter((r) => {
      const okSucursal =
        filtraSucursal === "TODAS" || r.sucursalNombre === filtraSucursal;
      const okEstado =
        filtraEstado === "TODOS" || r.estado === filtraEstado;
      return okSucursal && okEstado;
    });
  }, [registros, filtraSucursal, filtraEstado]);

  // ── Métricas ──
  const metricas = useMemo(() => {
    const totalADepositar = registros.reduce(
      (acc, r) => acc + r.montoADepositar,
      0
    );
    const totalDepositado = registros.reduce(
      (acc, r) => acc + r.montoDepositado,
      0
    );
    const saldoPendiente = totalADepositar - totalDepositado;
    const cantPendientes = registros.filter(
      (r) => r.estado === "No depositado"
    ).length;
    return { totalADepositar, totalDepositado, saldoPendiente, cantPendientes };
  }, [registros]);

  // ── Marcar como depositado ──
  const marcarDepositado = useCallback(
    (id: number) => {
      const reg = registros.find((r) => r.id === id);
      mutacionDeposito.mutate(id, {
        onSuccess: () => {
          toast.success("Depósito confirmado", {
            description: reg
              ? `${reg.sucursalNombre} — ${formatearCLP(reg.montoADepositar)}`
              : undefined,
          });
          setDetalleId(null);
        },
      });
    },
    [registros, mutacionDeposito]
  );

  // ── Estado de carga ──
  if (cargando) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Control de Depósitos Z
        </h1>
        <p className="text-sm text-muted-foreground">
          Seguimiento de depósitos bancarios diarios por sucursal
        </p>
      </div>

      <Separator />

      {/* ── Tarjetas de métricas ── */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        {/* Total a depositar */}
        <Card>
          <CardContent className="px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                <Banknote className="size-4 text-slate-600 dark:text-slate-300" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                Total Ventas a Depositar
              </p>
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {formatearCLP(metricas.totalADepositar)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {registros.length} registros en total
            </p>
          </CardContent>
        </Card>

        {/* Total depositado */}
        <Card>
          <CardContent className="px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="size-4 text-emerald-600" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                Total Depositado en Banco
              </p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-emerald-600">
              {formatearCLP(metricas.totalDepositado)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {registros.filter((r) => r.estado !== "No depositado").length}{" "}
              confirmados
            </p>
          </CardContent>
        </Card>

        {/* Saldo pendiente */}
        <Card
          className={
            metricas.saldoPendiente > 0
              ? "border-red-400 dark:border-red-600"
              : ""
          }
        >
          <CardContent className="px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  metricas.saldoPendiente > 0
                    ? "bg-red-100 dark:bg-red-900/30"
                    : "bg-slate-100 dark:bg-slate-800"
                }`}
              >
                <AlertCircle
                  className={`size-4 ${
                    metricas.saldoPendiente > 0
                      ? "text-red-600"
                      : "text-slate-400"
                  }`}
                />
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                Saldo Pendiente por Depositar
              </p>
            </div>
            <p
              className={`text-2xl font-bold tabular-nums ${
                metricas.saldoPendiente > 0 ? "text-red-600" : "text-foreground"
              }`}
            >
              {formatearCLP(metricas.saldoPendiente)}
            </p>
            {metricas.cantPendientes > 0 ? (
              <p className="mt-0.5 text-xs text-red-600 font-medium">
                ⚠ {metricas.cantPendientes}{" "}
                {metricas.cantPendientes === 1
                  ? "sucursal pendiente"
                  : "sucursales pendientes"}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-emerald-600 font-medium">
                ✓ Todo al día
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Filter className="size-3.5" />
          Filtrar por:
        </div>
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <Select
            value={filtraSucursal}
            onValueChange={v => setFiltraSucursal(v ?? "")}
          >
            <SelectTrigger className="h-9 w-full sm:w-52 text-sm">
              <SelectValue placeholder="Todas las sucursales">
                {filtraSucursal === "TODAS" ? "Todas las sucursales" : filtraSucursal || undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas las sucursales</SelectItem>
              {sucursalesUnicas.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filtraEstado}
            onValueChange={(v) =>
              setFiltraEstado(v as EstadoDeposito | "TODOS")
            }
          >
            <SelectTrigger className="h-9 w-full sm:w-44 text-sm">
              <SelectValue placeholder="Todos los estados">
                {filtraEstado === "TODOS" ? "Todos los estados" : filtraEstado}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos los estados</SelectItem>
              <SelectItem value="Depositado">Depositado</SelectItem>
              <SelectItem value="Transferencia">Transferencia</SelectItem>
              <SelectItem value="No depositado">No depositado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground shrink-0">
          {filtrados.length} registro{filtrados.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* ── Sin registros ── */}
      {registros.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <Banknote className="mb-3 size-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            No hay depósitos registrados aún
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Aparecerán aquí cuando los vendedores cierren sus turnos
          </p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <Banknote className="mb-3 size-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            No hay registros con los filtros seleccionados
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: tarjetas */}
          <div className="sm:hidden space-y-2">
            {filtrados.map((r) => (
              <button
                key={r.id}
                className="w-full text-left rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40 active:bg-muted/60"
                onClick={() => setDetalleId(r.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold truncate">
                        {r.sucursalNombre}
                      </p>
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-xs flex items-center gap-1 ${clasesBadgeEstado(r.estado)}`}
                      >
                        <IconoEstado estado={r.estado} />
                        {r.estado}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.vendedor} · {formatearFecha(r.fechaVenta)}
                    </p>
                  </div>
                  <ChevronDown className="size-4 text-muted-foreground rotate-[-90deg] shrink-0 mt-0.5" />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
                  <div>
                    <p className="text-muted-foreground">A depositar</p>
                    <p className="font-semibold tabular-nums">
                      {formatearCLP(r.montoADepositar)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Depositado</p>
                    <p className="font-semibold tabular-nums text-emerald-600">
                      {formatearCLP(r.montoDepositado)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Falta</p>
                    <p
                      className={`font-bold tabular-nums ${
                        r.faltaDepositar > 0
                          ? "text-red-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {r.faltaDepositar > 0
                        ? formatearCLP(r.faltaDepositar)
                        : "—"}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Desktop: tabla */}
          <Card className="hidden sm:block">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Fecha Venta</th>
                    <th className="px-4 py-3 font-medium">Fecha Depósito</th>
                    <th className="px-4 py-3 font-medium">Sucursal</th>
                    <th className="px-4 py-3 font-medium">Vendedor</th>
                    <th className="px-4 py-3 font-medium text-right">
                      A Depositar
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      Depositado
                    </th>
                    <th className="px-4 py-3 font-medium text-right">Falta</th>
                    <th className="px-4 py-3 font-medium text-center">Estado</th>
                    <th className="px-4 py-3 font-medium text-center">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 tabular-nums">
                        {formatearFecha(r.fechaVenta)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {r.fechaDeposito ? formatearFecha(r.fechaDeposito) : "—"}
                      </td>
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {r.sucursalNombre}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.vendedor}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {formatearCLP(r.montoADepositar)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-600 font-medium">
                        {r.montoDepositado > 0
                          ? formatearCLP(r.montoDepositado)
                          : "—"}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums font-bold ${
                          r.faltaDepositar > 0
                            ? "text-red-600"
                            : "text-muted-foreground"
                        }`}
                      >
                        {r.faltaDepositar > 0
                          ? formatearCLP(r.faltaDepositar)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant="outline"
                          className={`text-xs flex items-center gap-1 w-fit mx-auto ${clasesBadgeEstado(r.estado)}`}
                        >
                          <IconoEstado estado={r.estado} />
                          {r.estado}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.estado === "No depositado" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 border-emerald-500/50 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-700"
                            disabled={mutacionDeposito.isPending && mutacionDeposito.variables === r.id}
                            onClick={() => marcarDepositado(r.id)}
                          >
                            {mutacionDeposito.isPending && mutacionDeposito.variables === r.id ? (
                              <Loader2 className="size-3 mr-1 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-3 mr-1" />
                            )}
                            Marcar Depositado
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Bottom-sheet: detalle + acción (mobile) ── */}
      {detalleId !== null && detalle && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDetalleId(null)}
          />
          <div className="absolute bottom-0 left-0 right-0 animate-in slide-in-from-bottom duration-300">
            <div className="rounded-t-2xl bg-background px-4 pt-5 pb-6">
              <div className="mb-4 flex justify-center">
                <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
              </div>

              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-bold">{detalle.sucursalNombre}</p>
                  <p className="text-sm text-muted-foreground">
                    {detalle.vendedor}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`text-xs flex items-center gap-1 ${clasesBadgeEstado(detalle.estado)}`}
                >
                  <IconoEstado estado={detalle.estado} />
                  {detalle.estado}
                </Badge>
              </div>

              <Separator className="mb-4" />

              <div className="space-y-3 text-sm">
                <FilaDetalle
                  label="Fecha de venta"
                  valor={formatearFecha(detalle.fechaVenta)}
                />
                <FilaDetalle
                  label="Fecha de depósito"
                  valor={
                    detalle.fechaDeposito
                      ? formatearFecha(detalle.fechaDeposito)
                      : "Pendiente"
                  }
                  claseValor={!detalle.fechaDeposito ? "text-amber-600" : ""}
                />
                <FilaDetalle
                  label="Monto a depositar"
                  valor={formatearCLP(detalle.montoADepositar)}
                  claseValor="font-bold"
                />
                <FilaDetalle
                  label="Monto depositado"
                  valor={
                    detalle.montoDepositado > 0
                      ? formatearCLP(detalle.montoDepositado)
                      : "—"
                  }
                  claseValor={
                    detalle.montoDepositado > 0
                      ? "text-emerald-600 font-semibold"
                      : "text-muted-foreground"
                  }
                />
                {detalle.faltaDepositar > 0 && (
                  <FilaDetalle
                    label="Falta depositar"
                    valor={formatearCLP(detalle.faltaDepositar)}
                    claseValor="text-red-600 font-bold"
                  />
                )}
              </div>

              <div className="mt-5 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setDetalleId(null)}
                >
                  Cerrar
                </Button>
                {detalle.estado === "No depositado" && (
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={mutacionDeposito.isPending && mutacionDeposito.variables === detalle.id}
                    onClick={() => marcarDepositado(detalle.id)}
                  >
                    {mutacionDeposito.isPending && mutacionDeposito.variables === detalle.id ? (
                      <Loader2 className="size-4 mr-1.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4 mr-1.5" />
                    )}
                    Marcar Depositado
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponente auxiliar ────────────────────────────────────────────────

function FilaDetalle({
  label,
  valor,
  claseValor = "",
}: {
  label: string;
  valor: string;
  claseValor?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${claseValor}`}>{valor}</span>
    </div>
  );
}
