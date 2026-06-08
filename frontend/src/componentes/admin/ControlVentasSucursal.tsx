// ─── ControlVentasSucursal ───
// Control de Sucursales: ventas diarias por PDV.
// Selecciona PDV + fecha y consulta la API real.

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Store,
  CalendarDays,
  Banknote,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  ArrowDownRight,
  ArrowUpCircle,
  Loader2,
  PackagePlus,
  Truck,
  ChevronDown,
  ChevronUp,
  Target,
  Plus,
  Pencil,
  Power,
  Trash2,
  X,
  BarChart2,
  Settings2,
  Wallet,
  History,
  CreditCard,
  ArrowLeftRight,
  CalendarRange,
  User,
  TrendingDown,
} from "lucide-react";

// shadcn/ui
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Tipos
import type { PDVItem, ResumenSucursal, FaltanteVendedor, TurnoHistorial, VendedorOpcion } from "@/tipos/admin.tipos";
import type { Solicitud, EstadoSolicitud } from "@/tipos/pos.tipos";

// API + helpers
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { formatearCLP } from "@/lib/money";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// ─── Componente principal ───

interface PDVCompleto { id: number; nombre: string; tipo: string; activo: boolean }

export function ControlVentasSucursal() {
  const [tab, setTab] = useState<"control" | "historial" | "gestionar">("control");
  const [pdvSeleccionado, setPdvSeleccionado] = useState<number | "">("");
  const [fechaSeleccionada, setFechaSeleccionada] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [montoRetiro, setMontoRetiro] = useState("");
  const [descRetiro, setDescRetiro] = useState("");

  const { usuario } = useAuthStore();
  const esAdminOSupervisor = usuario?.rol === "ADMIN" || usuario?.rol === "SUPERVISOR";
  const queryClient = useQueryClient();

  // PDVs activos (para selector de ventas)
  const { data: pdvs = [], isLoading: cargandoPdvs } = useQuery({
    queryKey: ["admin", "pdvs"],
    queryFn: () => apiGet<{ data: PDVItem[] }>("/admin/pdvs").then(r => r.data).catch(() => [] as PDVItem[]),
  });

  // Todos los PDVs (para gestión)
  const { data: todosLosPdvs = [], isLoading: cargandoTodos } = useQuery({
    queryKey: ["admin", "pdvs-todos"],
    queryFn: () => apiGet<{ data: PDVCompleto[] }>("/admin/pdvs?todos=true").then(r => r.data),
    enabled: tab === "gestionar",
  });

  const {
    data: reporte = null,
    isLoading: cargando,
    isError,
    error,
  } = useQuery({
    queryKey: ["admin", "ventas-sucursal", pdvSeleccionado, fechaSeleccionada],
    queryFn: () =>
      apiGet<{ data: ResumenSucursal }>(
        `/admin/ventas-sucursal?pdvId=${pdvSeleccionado}&fecha=${fechaSeleccionada}`
      ).then((r) => r.data),
    enabled: !!pdvSeleccionado && !!fechaSeleccionada,
    retry: false,
  });

  const sinDatos =
    isError && error instanceof Error && error.message.includes("No hay turno");

  const mutacionRetiro = useMutation({
    mutationFn: ({ turnoId, monto, descripcion }: { turnoId: number; monto: number; descripcion?: string }) =>
      apiPost(`/pos/turnos/${turnoId}/retiros`, { monto, descripcion }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "ventas-sucursal", pdvSeleccionado, fechaSeleccionada],
      });
      setMontoRetiro("");
      setDescRetiro("");
      toast.success("Retiro registrado correctamente");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Error al registrar retiro");
    },
  });

  const handleRetiro = () => {
    if (!reporte) return;
    const monto = parseInt(montoRetiro, 10);
    if (isNaN(monto) || monto <= 0) return;
    mutacionRetiro.mutate({
      turnoId: reporte.turnoId,
      monto,
      descripcion: descRetiro.trim() || undefined,
    });
  };

  const pdvNombre = useMemo(
    () => pdvs.find((p) => p.id === pdvSeleccionado)?.nombre ?? "",
    [pdvs, pdvSeleccionado]
  );

  const diferenciaCaja = reporte?.diferenciaCaja ?? 0;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Control de Sucursales</h1>
          <p className="text-sm text-muted-foreground">
            {tab === "control" ? "Resumen de ventas diarias por punto de venta" : tab === "historial" ? "Historial de turnos por sucursal" : "Administrar puntos de venta"}
          </p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 rounded-xl bg-muted p-1 w-fit flex-wrap">
        <button
          onClick={() => setTab("control")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === "control" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <BarChart2 size={16} /> Control de Ventas
        </button>
        <button
          onClick={() => setTab("historial")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === "historial" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <CalendarRange size={16} /> Historial
        </button>
        {esAdminOSupervisor && (
          <button
            onClick={() => setTab("gestionar")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === "gestionar" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Settings2 size={16} /> Gestionar Sucursales
          </button>
        )}
      </div>

      <Separator />

      {/* ── TAB: HISTORIAL ── */}
      {tab === "historial" && (
        <HistorialSucursal pdvs={pdvs} cargandoPdvs={cargandoPdvs} />
      )}

      {/* ── TAB: GESTIONAR SUCURSALES ── */}
      {tab === "gestionar" && (
        <GestorPDVs
          pdvs={todosLosPdvs}
          cargando={cargandoTodos}
          onCambio={() => queryClient.invalidateQueries({ queryKey: ["admin", "pdvs-todos"] })}
        />
      )}

      {/* ── TAB: CONTROL DE VENTAS ── */}
      {tab === "control" && (<>

      {/* ── Filtros: PDV + Fecha ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pdv-select">Sucursal</Label>
          <Select
            value={pdvSeleccionado !== "" ? String(pdvSeleccionado) : undefined}
            onValueChange={(v) => setPdvSeleccionado(Number(v))}
            disabled={cargandoPdvs}
          >
            <SelectTrigger id="pdv-select" className="w-full">
              <SelectValue placeholder={cargandoPdvs ? "Cargando sucursales…" : "Selecciona una sucursal"}>
                {pdvSeleccionado !== "" ? pdvs.find(p => p.id === pdvSeleccionado)?.nombre : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {pdvs.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fecha-input">Fecha</Label>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              id="fecha-input"
              type="date"
              value={fechaSeleccionada}
              onChange={(e) => setFechaSeleccionada(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>

      {/* ── Sin selección ── */}
      {!pdvSeleccionado && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Store className="mb-3 size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Selecciona una sucursal para ver el reporte del día
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Cargando ── */}
      {pdvSeleccionado !== "" && cargando && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-7 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── Sin reporte para la combinación ── */}
      {pdvSeleccionado !== "" && !cargando && sinDatos && (
        <Card className="border-dashed border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="mb-3 size-10 text-amber-500/60" />
            <p className="text-sm font-medium text-amber-600">
              No hay turno para {pdvNombre} en esta fecha
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              El/la vendedor/a aún no registró el turno del día
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Reporte encontrado ── */}
      {reporte && !cargando && (
        <>
          {/* Info del turno */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 px-4 py-3">
            <Badge variant="secondary" className="text-xs">
              {pdvNombre}
            </Badge>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm text-muted-foreground">
              Vendedor:{" "}
              <strong className="text-foreground">{reporte.vendedor}</strong>
            </span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm text-muted-foreground">
              Estado:{" "}
              <Badge
                variant={reporte.estado === "CERRADO" ? "secondary" : "outline"}
                className="text-xs"
              >
                {reporte.estado === "CERRADO" ? "Cerrado" : "Abierto"}
              </Badge>
            </span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm text-muted-foreground">
              Total ventas:{" "}
              <strong className="text-foreground">
                {formatearCLP(reporte.totalVentas)}
              </strong>
            </span>
          </div>

          {/* ── Tarjetas de venta por categoría ── */}
          {Object.keys(reporte.ventasPorCategoria).length > 0 && (
            <div
              className={`grid gap-3 grid-cols-2 lg:grid-cols-${Math.min(
                Object.keys(reporte.ventasPorCategoria).length,
                4
              )}`}
            >
              {Object.entries(reporte.ventasPorCategoria).map(([cat, monto]) => (
                <TarjetaVenta key={cat} label={cat} monto={monto} />
              ))}
            </div>
          )}

          {/* ── Panel: Métricas del mes ── */}
          {reporte.metricas && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <TrendingUp className="size-5" />
                  Métricas del mes — {pdvNombre}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Total mes</p>
                    <p className="text-xl font-bold tabular-nums">{formatearCLP(reporte.metricas.totalMes)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Promedio diario</p>
                    <p className="text-xl font-bold tabular-nums">{formatearCLP(reporte.metricas.promedioDiario)}</p>
                    <p className="text-[10px] text-muted-foreground">{reporte.metricas.diasConVenta} días con venta</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Target className="size-3.5 text-primary" />
                      <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Proyección</p>
                    </div>
                    <p className="text-xl font-bold tabular-nums text-primary">{formatearCLP(reporte.metricas.proyeccionMes)}</p>
                    {reporte.metricas.proyeccionMes > 0 && (
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mt-2">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (reporte.metricas.totalMes / reporte.metricas.proyeccionMes) * 100)}%` }} />
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">{reporte.metricas.diasTranscurridos} de {reporte.metricas.diasMes} días</p>
                  </div>
                  {reporte.metricas.faltantesMes > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-amber-600 uppercase font-semibold tracking-wider">Faltantes mes</p>
                      <p className="text-xl font-bold tabular-nums text-amber-600">{formatearCLP(reporte.metricas.faltantesMes)}</p>
                    </div>
                  )}
                </div>

                {/* Desglose del mes por categoría */}
                {Object.keys(reporte.metricas.categoriasMes).length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-3">Venta del mes por categoría</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {Object.entries(reporte.metricas.categoriasMes)
                        .sort(([, a], [, b]) => b - a)
                        .map(([cat, monto]) => (
                          <div key={cat} className="rounded-xl bg-muted/40 px-3 py-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{cat}</p>
                            <p className="text-sm font-bold tabular-nums mt-0.5">{formatearCLP(monto)}</p>
                            {reporte.metricas.totalMes > 0 && (
                              <p className="text-[10px] text-muted-foreground">{Math.round((monto / reporte.metricas.totalMes) * 100)}% del total</p>
                            )}
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Pago del turno activo (solo turno ABIERTO) ── */}
          {reporte.estado === "ABIERTO" && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Wallet className="size-5 text-primary" />
                  Pago del turno activo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Vendedor/a</p>
                    <p className="text-base font-bold">{reporte.vendedor}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pago diario</p>
                    <p className="text-xl font-bold tabular-nums text-primary">{formatearCLP(reporte.pagoDiario)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado turno</p>
                    <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                      En curso
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Cuadre de Caja — solo turno CERRADO ── */}
          {reporte.estado === "CERRADO" && (
            <Card
              className={
                diferenciaCaja < 0
                  ? "border-red-500/50 bg-red-500/5"
                  : diferenciaCaja === 0
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-blue-500/50 bg-blue-500/5"
              }
            >
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Banknote className="size-5" />
                  Cuadre de Caja
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Desglose de ventas */}
                <div className="rounded-xl border bg-background overflow-hidden divide-y divide-border/60 text-sm">
                  <FilaCuadreAdmin label="Total venta calculada" valor={formatearCLP(reporte.totalVentas)} claseValor="font-bold" />
                  {reporte.ventaTarjeta > 0 && (
                    <FilaCuadreAdmin
                      icono={<CreditCard className="size-3.5 text-blue-500" />}
                      label="Venta tarjeta"
                      valor={formatearCLP(reporte.ventaTarjeta)}
                      claseValor="text-blue-600"
                    />
                  )}
                  {reporte.ventaTransferencia > 0 && (
                    <FilaCuadreAdmin
                      icono={<ArrowLeftRight className="size-3.5 text-violet-500" />}
                      label="Venta transferencia"
                      valor={formatearCLP(reporte.ventaTransferencia)}
                      claseValor="text-violet-600"
                    />
                  )}
                  <FilaCuadreAdmin label="Venta efectivo" valor={formatearCLP(reporte.ventaEfectivo)} />
                  {reporte.totalRetiros > 0 && (
                    <FilaCuadreAdmin label="+ Retiros" valor={formatearCLP(reporte.totalRetiros)} claseValor="text-orange-600" />
                  )}
                  <FilaCuadreAdmin label="A depositar (efectivo + retiros)" valor={formatearCLP(reporte.efectivoDeclarado + reporte.totalRetiros)} claseValor="font-bold text-primary" />
                </div>

                {/* Efectivo declarado vs esperado */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Efectivo declarado</p>
                    <p className="text-xl font-bold tabular-nums">{formatearCLP(reporte.efectivoDeclarado)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pago vendedor/a</p>
                    <p className="text-xl font-bold tabular-nums text-primary">{formatearCLP(reporte.pagoDiario)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Diferencia</p>
                    <div className="flex items-center gap-2">
                      <p className={`text-xl font-bold tabular-nums ${diferenciaCaja < 0 ? "text-red-600" : diferenciaCaja === 0 ? "text-emerald-600" : "text-blue-600"}`}>
                        {diferenciaCaja >= 0 ? "+" : ""}{formatearCLP(diferenciaCaja)}
                      </p>
                      {diferenciaCaja < 0 ? (
                        <ArrowDownRight className="size-5 text-red-500" />
                      ) : diferenciaCaja === 0 ? (
                        <CheckCircle2 className="size-5 text-emerald-500" />
                      ) : (
                        <TrendingUp className="size-5 text-blue-500" />
                      )}
                    </div>
                    {diferenciaCaja < 0 && (
                      <Badge variant="destructive" className="mt-1 text-xs font-semibold animate-pulse">
                        ⚠ Faltante: {formatearCLP(Math.abs(diferenciaCaja))}
                      </Badge>
                    )}
                    {diferenciaCaja === 0 && (
                      <Badge className="mt-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs">Caja cuadrada</Badge>
                    )}
                    {diferenciaCaja > 0 && (
                      <Badge className="mt-1 bg-blue-500/10 text-blue-600 border-blue-500/30 text-xs">Sobrante de caja</Badge>
                    )}
                  </div>
                </div>

                {/* Historial de faltantes del vendedor */}
                {reporte.usuarioId && (
                  <HistorialFaltantes usuarioId={reporte.usuarioId} vendedor={reporte.vendedor} />
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Retiro de dinero del punto ── */}
          {esAdminOSupervisor && reporte.estado === "ABIERTO" && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <ArrowUpCircle className="size-5 text-amber-600" />
                  Retiro de Dinero del Punto
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {reporte.totalRetiros > 0 && (
                  <div className="rounded-lg bg-amber-100/50 dark:bg-amber-900/20 px-4 py-2.5">
                    <p className="text-xs text-muted-foreground">Total retirado hoy</p>
                    <p className="text-xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                      {formatearCLP(reporte.totalRetiros)}
                    </p>
                  </div>
                )}
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="monto-retiro">Monto ($)</Label>
                      <Input
                        id="monto-retiro"
                        type="number"
                        min={1}
                        step={1000}
                        placeholder="Ej: 50000"
                        value={montoRetiro}
                        onChange={(e) => setMontoRetiro(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="desc-retiro">
                        Justificación <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="desc-retiro"
                        placeholder="Motivo del retiro (obligatorio)"
                        value={descRetiro}
                        onChange={(e) => setDescRetiro(e.target.value)}
                        maxLength={200}
                      />
                    </div>
                  </div>
                  {!descRetiro.trim() && montoRetiro && (
                    <p className="text-xs text-destructive">Debes ingresar una justificación para registrar el retiro.</p>
                  )}
                  <Button
                    onClick={handleRetiro}
                    disabled={!montoRetiro || !descRetiro.trim() || mutacionRetiro.isPending}
                    className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {mutacionRetiro.isPending ? (
                      <Loader2 className="size-4 animate-spin mr-2" />
                    ) : (
                      <ArrowUpCircle className="size-4 mr-2" />
                    )}
                    Registrar retiro
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Tabla desglose de ventas ── */}
          {Object.keys(reporte.ventasPorCategoria).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Desglose de Ventas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-3 pr-6 font-medium">Categoría</th>
                        <th className="pb-3 pr-6 font-medium text-right">
                          Monto
                        </th>
                        <th className="pb-3 font-medium text-right">
                          % del Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(reporte.ventasPorCategoria).map(
                        ([cat, monto]) => (
                          <tr key={cat} className="border-b last:border-0">
                            <td className="py-3 pr-6 font-medium">{cat}</td>
                            <td className="py-3 pr-6 text-right tabular-nums">
                              {formatearCLP(monto)}
                            </td>
                            <td className="py-3 text-right tabular-nums text-muted-foreground">
                              {reporte.totalVentas > 0
                                ? ((monto / reporte.totalVentas) * 100).toFixed(1)
                                : "0.0"}
                              %
                            </td>
                          </tr>
                        )
                      )}
                      <tr className="bg-muted/30 font-semibold">
                        <td className="py-3 pr-6">Total</td>
                        <td className="py-3 pr-6 text-right tabular-nums">
                          {formatearCLP(reporte.totalVentas)}
                        </td>
                        <td className="py-3 text-right tabular-nums">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Separator />

      {/* ── Solicitudes de insumos ── */}
      <SolicitudesPendientes queryClient={queryClient} />

      </> )} {/* fin tab control */}
    </div>
  );
}

// ─── HistorialSucursal ───────────────────────────────────────────────────────

type Periodo = "dia" | "semana" | "mes" | "custom";

function fechaHoy() {
  return new Date().toISOString().split("T")[0];
}

function fechaHace(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().split("T")[0];
}

function primerDiaMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function HistorialSucursal({ pdvs, cargandoPdvs }: { pdvs: PDVItem[]; cargandoPdvs: boolean }) {
  const [pdvId,      setPdvId]      = useState<number | "">("");
  const [periodo,    setPeriodo]    = useState<Periodo>("semana");
  const [desde,      setDesde]      = useState(fechaHace(6));
  const [hasta,      setHasta]      = useState(fechaHoy());
  const [vendedorId, setVendedorId] = useState<number | "">("");

  const rangoVisible = periodo === "custom";

  const handlePeriodo = (p: Periodo) => {
    setPeriodo(p);
    const hoy = fechaHoy();
    if (p === "dia")    { setDesde(hoy);            setHasta(hoy); }
    if (p === "semana") { setDesde(fechaHace(6));   setHasta(hoy); }
    if (p === "mes")    { setDesde(primerDiaMes()); setHasta(hoy); }
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "historial-turnos", pdvId, desde, hasta, vendedorId],
    queryFn:  () => {
      const params = new URLSearchParams({
        pdvId:  String(pdvId),
        desde,
        hasta,
        ...(vendedorId !== "" ? { usuarioId: String(vendedorId) } : {}),
      });
      return apiGet<{ data: { filas: TurnoHistorial[]; vendedores: VendedorOpcion[] } }>(
        `/admin/historial-turnos?${params}`
      ).then(r => r.data);
    },
    enabled: !!pdvId && !!desde && !!hasta,
    retry: false,
  });

  const filas      = data?.filas      ?? [];
  const vendedores = data?.vendedores ?? [];

  const totalVentas   = filas.reduce((s, f) => s + f.totalVentas, 0);
  const totalFaltante = filas.reduce((s, f) => s + (f.diferenciaCaja < 0 ? Math.abs(f.diferenciaCaja) : 0), 0);
  const totalSobrante = filas.reduce((s, f) => s + (f.diferenciaCaja > 0 ? f.diferenciaCaja : 0), 0);

  const PERIODOS: { key: Periodo; label: string }[] = [
    { key: "dia",    label: "Hoy" },
    { key: "semana", label: "Semana" },
    { key: "mes",    label: "Mes" },
    { key: "custom", label: "Personalizado" },
  ];

  return (
    <div className="space-y-5">

      {/* Filtros */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Sucursal</Label>
          <Select
            value={pdvId !== "" ? String(pdvId) : undefined}
            onValueChange={v => { setPdvId(Number(v)); setVendedorId(""); }}
            disabled={cargandoPdvs}
          >
            <SelectTrigger>
              <SelectValue placeholder={cargandoPdvs ? "Cargando…" : "Selecciona una sucursal"} />
            </SelectTrigger>
            <SelectContent>
              {pdvs.map(p => (
                <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Período</Label>
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {PERIODOS.map(p => (
              <button
                key={p.key}
                onClick={() => handlePeriodo(p.key)}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                  periodo === p.key ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Rango personalizado */}
      {rangoVisible && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Desde</Label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="pl-10" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Hasta</Label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="pl-10" />
            </div>
          </div>
        </div>
      )}

      {/* Filtro vendedor (solo si hay datos) */}
      {vendedores.length > 0 && (
        <div className="space-y-1.5">
          <Label>Filtrar por vendedor/a</Label>
          <Select
            value={vendedorId !== "" ? String(vendedorId) : "todos"}
            onValueChange={v => setVendedorId(v === "todos" ? "" : Number(v))}
          >
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los vendedores</SelectItem>
              {vendedores.map(v => (
                <SelectItem key={v.id} value={String(v.id)}>
                  <div className="flex items-center gap-2">
                    <User size={13} className="text-muted-foreground" />
                    {v.nombre}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Sin sucursal */}
      {!pdvId && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CalendarRange className="mb-3 size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Selecciona una sucursal para ver el historial</p>
          </CardContent>
        </Card>
      )}

      {/* Cargando */}
      {pdvId !== "" && isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-7 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {pdvId !== "" && isError && !isLoading && (
        <Card className="border-dashed border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <AlertCircle className="mb-3 size-8 text-amber-500/60" />
            <p className="text-sm text-amber-600">No se pudo cargar el historial</p>
          </CardContent>
        </Card>
      )}

      {/* Sin turnos */}
      {pdvId !== "" && !isLoading && !isError && filas.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <History className="mb-3 size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No hay turnos cerrados en este período</p>
          </CardContent>
        </Card>
      )}

      {/* Resumen del período */}
      {filas.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total ventas</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{formatearCLP(totalVentas)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{filas.length} turno{filas.length !== 1 ? "s" : ""}</p>
              </CardContent>
            </Card>
            {totalFaltante > 0 && (
              <Card className="border-red-500/40 bg-red-500/5">
                <CardContent className="px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-red-600">Faltantes período</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-red-600">{formatearCLP(totalFaltante)}</p>
                  <p className="text-[10px] text-red-500 mt-0.5">
                    {filas.filter(f => f.diferenciaCaja < 0).length} turno{filas.filter(f => f.diferenciaCaja < 0).length !== 1 ? "s" : ""} con faltante
                  </p>
                </CardContent>
              </Card>
            )}
            {totalSobrante > 0 && (
              <Card className="border-blue-500/40 bg-blue-500/5">
                <CardContent className="px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Sobrantes período</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-blue-600">{formatearCLP(totalSobrante)}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Tabla de turnos */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <History size={18} />
                Turnos del período
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">Fecha</th>
                      <th className="px-4 py-3 font-semibold">Vendedor/a</th>
                      <th className="px-4 py-3 font-semibold text-right">Total ventas</th>
                      <th className="px-4 py-3 font-semibold text-right">Tarjeta</th>
                      <th className="px-4 py-3 font-semibold text-right">Transfer.</th>
                      <th className="px-4 py-3 font-semibold text-right">Efectivo decl.</th>
                      <th className="px-4 py-3 font-semibold text-right">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map(f => {
                      const esFaltante = f.diferenciaCaja < 0;
                      const esSobrante = f.diferenciaCaja > 0;
                      return (
                        <tr key={f.turnoId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            {new Date(f.fecha).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <User size={13} className="text-muted-foreground shrink-0" />
                              <span className="font-medium">{f.vendedor}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold">
                            {formatearCLP(f.totalVentas)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-blue-600">
                            {f.ventaTarjeta > 0 ? formatearCLP(f.ventaTarjeta) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-violet-600">
                            {f.ventaTransferencia > 0 ? formatearCLP(f.ventaTransferencia) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {formatearCLP(f.efectivoDeclarado)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <span className={`font-bold ${esFaltante ? "text-red-600" : esSobrante ? "text-blue-600" : "text-emerald-600"}`}>
                              {f.diferenciaCaja >= 0 ? "+" : ""}{formatearCLP(f.diferenciaCaja)}
                            </span>
                            {esFaltante && (
                              <span className="ml-1.5 text-[10px] font-bold text-red-500 bg-red-100 dark:bg-red-950/40 rounded-full px-1.5 py-0.5">
                                <TrendingDown size={10} className="inline mr-0.5" />faltante
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/50 font-bold">
                      <td colSpan={2} className="px-4 py-3 text-sm">Total período</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatearCLP(totalVentas)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-blue-600">
                        {formatearCLP(filas.reduce((s, f) => s + f.ventaTarjeta, 0))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-violet-600">
                        {formatearCLP(filas.reduce((s, f) => s + f.ventaTransferencia, 0))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatearCLP(filas.reduce((s, f) => s + f.efectivoDeclarado, 0))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {totalFaltante > 0 && (
                          <span className="text-red-600">−{formatearCLP(totalFaltante)}</span>
                        )}
                        {totalFaltante === 0 && totalSobrante === 0 && (
                          <span className="text-emerald-600">+$0</span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── FilaCuadreAdmin ─────────────────────────────────────────────────────────

function FilaCuadreAdmin({
  icono, label, valor, claseValor = "text-foreground",
}: { icono?: ReactNode; label: string; valor: string; claseValor?: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icono}
        {label}
      </span>
      <span className={`text-sm tabular-nums ${claseValor}`}>{valor}</span>
    </div>
  );
}

// ─── HistorialFaltantes ───────────────────────────────────────────────────────

function HistorialFaltantes({ usuarioId, vendedor }: { usuarioId: number; vendedor: string }) {
  const { data: faltantes = [], isLoading } = useQuery({
    queryKey: ["admin", "faltantes-vendedor", usuarioId],
    queryFn:  () => apiGet<{ data: FaltanteVendedor[] }>(`/admin/vendedores/${usuarioId}/faltantes`).then(r => r.data),
  });

  if (isLoading) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
      <Loader2 size={14} className="animate-spin" /> Cargando historial…
    </div>
  );

  if (faltantes.length === 0) return null;

  const totalFaltantes = faltantes.reduce((s, f) => s + f.faltante, 0);

  return (
    <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-red-200 dark:border-red-900">
        <div className="flex items-center gap-2">
          <History size={16} className="text-red-600" />
          <p className="text-sm font-bold text-red-700 dark:text-red-400">
            Historial de faltantes — {vendedor}
          </p>
        </div>
        <Badge variant="destructive" className="text-xs">
          Total: {formatearCLP(totalFaltantes)}
        </Badge>
      </div>
      <div className="divide-y divide-red-200/60 dark:divide-red-900/60 max-h-48 overflow-y-auto">
        {faltantes.map(f => (
          <div key={f.turnoId} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <div>
              <p className="font-medium text-foreground">{f.pdvNombre}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(f.fecha).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "2-digit" })}
              </p>
            </div>
            <span className="font-bold tabular-nums text-red-600">
              −{formatearCLP(f.faltante)}
            </span>
          </div>
        ))}
      </div>
      <div className="px-4 py-2.5 bg-red-100/50 dark:bg-red-950/30 border-t border-red-200 dark:border-red-900">
        <p className="text-xs text-red-700 dark:text-red-400 font-medium">
          Estos montos se descontarán del pago final del vendedor/a.
        </p>
      </div>
    </div>
  );
}

// ─── Subcomponente: Tarjeta de venta por categoría ───

interface TarjetaVentaProps {
  label: string;
  monto: number;
}

function TarjetaVenta({ label, monto }: TarjetaVentaProps) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground truncate">
          {label}
        </p>
        <p className="mt-1 text-lg font-bold tabular-nums">
          {formatearCLP(monto)}
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Subcomponente: Solicitudes pendientes ────────────────────────────────────

import type { QueryClient } from "@tanstack/react-query";

const ESTADO_LABEL: Record<EstadoSolicitud, string> = {
  PENDIENTE:  "Pendiente",
  DESPACHADA: "Despachada",
  CONFIRMADA: "Confirmada",
}

function SolicitudesPendientes({ queryClient }: { queryClient: QueryClient }) {
  const [expandida, setExpandida] = useState(true)

  const { data: solicitudes = [], isLoading } = useQuery({
    queryKey: ["solicitudes", "admin"],
    queryFn:  () => apiGet<{ data: Solicitud[] }>("/solicitudes").then(r => r.data),
    refetchInterval: 30_000,
  })

  const mutDespachar = useMutation({
    mutationFn: (id: number) => apiPatch<{ data: Solicitud }>(`/solicitudes/${id}/despachar`, {}).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["solicitudes", "admin"] })
      toast.success("Solicitud marcada como despachada")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const pendientes  = solicitudes.filter(s => s.estado === "PENDIENTE")
  const despachadas = solicitudes.filter(s => s.estado === "DESPACHADA")
  const activas     = [...pendientes, ...despachadas]

  return (
    <div>
      <button
        onClick={() => setExpandida(p => !p)}
        className="flex w-full items-center justify-between py-1"
      >
        <div className="flex items-center gap-2">
          <PackagePlus size={18} className="text-primary" />
          <h2 className="text-lg font-bold">Solicitudes de Insumos</h2>
          {pendientes.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
              {pendientes.length}
            </span>
          )}
        </div>
        {expandida ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>

      {expandida && (
        <div className="mt-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 size={16} className="animate-spin" /> Cargando…
            </div>
          ) : activas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No hay solicitudes pendientes de despacho.
            </p>
          ) : (
            activas.map(sol => (
              <Card key={sol.id} className={`border-l-4 ${sol.estado === "PENDIENTE" ? "border-l-amber-400" : "border-l-blue-400"}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{sol.pdvNombre}</p>
                      <p className="text-xs text-muted-foreground">{sol.solicitante} · {new Date(sol.fecha).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      sol.estado === "PENDIENTE"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-blue-100 text-blue-700"
                    }`}>
                      {ESTADO_LABEL[sol.estado as EstadoSolicitud]}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {sol.items.map(it => (
                      <div key={it.id} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{it.producto}</span>
                        <span className="font-bold text-foreground tabular-nums">×{it.cantidad}</span>
                      </div>
                    ))}
                  </div>

                  {sol.notas && (
                    <p className="text-xs text-muted-foreground italic">"{sol.notas}"</p>
                  )}

                  {sol.estado === "PENDIENTE" && (
                    <button
                      onClick={() => mutDespachar.mutate(sol.id)}
                      disabled={mutDespachar.isPending}
                      className="w-full h-9 rounded-lg bg-blue-600 text-xs font-bold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <Truck size={14} /> Marcar como Despachada
                    </button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── GestorPDVs ──────────────────────────────────────────────────────────────

interface FormPDV { nombre: string; tipo: "PUNTO_VENTA" | "BODEGA" }

function GestorPDVs({
  pdvs, cargando, onCambio,
}: { pdvs: PDVCompleto[]; cargando: boolean; onCambio: () => void }) {
  const qc = useQueryClient()
  const [modal, setModal]     = useState<"crear" | { editar: PDVCompleto } | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [form, setForm]       = useState<FormPDV>({ nombre: "", tipo: "PUNTO_VENTA" })
  const [error, setError]     = useState("")

  const invalida = () => {
    qc.invalidateQueries({ queryKey: ["admin", "pdvs-todos"] })
    qc.invalidateQueries({ queryKey: ["admin", "pdvs"] })
    onCambio()
  }

  const mutCrear = useMutation({
    mutationFn: (d: FormPDV) => apiPost<{ data: PDVCompleto }>("/admin/pdvs", d).then(r => r.data),
    onSuccess: () => { invalida(); setModal(null); toast.success("Sucursal creada"); },
    onError:   (e: Error) => setError(e.message),
  })

  const mutEditar = useMutation({
    mutationFn: ({ id, nombre }: { id: number; nombre: string }) =>
      apiPatch<{ data: PDVCompleto }>(`/admin/pdvs/${id}`, { nombre }).then(r => r.data),
    onSuccess: () => { invalida(); setModal(null); toast.success("Nombre actualizado"); },
    onError:   (e: Error) => setError(e.message),
  })

  const mutEstado = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiPatch<{ data: PDVCompleto }>(`/admin/pdvs/${id}/estado`, { activo }).then(r => r.data),
    onSuccess: () => { invalida(); toast.success("Estado actualizado"); },
    onError:   (e: Error) => toast.error(e.message),
  })

  const mutEliminar = useMutation({
    mutationFn: (id: number) => apiDelete<{ data: { mensaje: string } }>(`/admin/pdvs/${id}`),
    onSuccess: () => { invalida(); setConfirmId(null); toast.success("Sucursal eliminada"); },
    onError:   (e: Error) => { setConfirmId(null); toast.error(e.message); },
  })

  const abrirCrear = () => {
    setForm({ nombre: "", tipo: "PUNTO_VENTA" });
    setError(""); setModal("crear");
  }

  const abrirEditar = (pdv: PDVCompleto) => {
    setForm({ nombre: pdv.nombre, tipo: pdv.tipo as "PUNTO_VENTA" | "BODEGA" });
    setError(""); setModal({ editar: pdv });
  }

  const guardar = () => {
    if (form.nombre.trim().length < 2) { setError("El nombre debe tener al menos 2 caracteres"); return; }
    if (modal === "crear") mutCrear.mutate({ nombre: form.nombre.trim(), tipo: form.tipo });
    else if (modal && "editar" in modal) mutEditar.mutate({ id: modal.editar.id, nombre: form.nombre.trim() });
  }

  const puntos  = pdvs.filter(p => p.tipo === "PUNTO_VENTA");
  const bodegas = pdvs.filter(p => p.tipo === "BODEGA");

  return (
    <div className="space-y-5">

      {/* Botón crear */}
      <div className="flex justify-end">
        <button
          onClick={abrirCrear}
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} /> Nueva sucursal
        </button>
      </div>

      {cargando ? (
        <div className="flex justify-center py-12"><Loader2 className="size-7 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-6">
          {[{ titulo: "Puntos de Venta", lista: puntos }, { titulo: "Bodega", lista: bodegas }].map(({ titulo, lista }) => (
            lista.length > 0 && (
              <div key={titulo}>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{titulo}</p>
                <div className="rounded-2xl border overflow-hidden divide-y">
                  {lista.map(pdv => (
                    <div key={pdv.id} className={`flex items-center gap-3 px-4 py-3.5 ${!pdv.activo ? "opacity-60 bg-muted/20" : ""}`}>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                        <Store size={18} className="text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{pdv.nombre}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{pdv.tipo === "PUNTO_VENTA" ? "Punto de Venta" : "Bodega"}</span>
                          <Badge
                            variant={pdv.activo ? "secondary" : "outline"}
                            className={`text-[10px] px-1.5 py-0 ${pdv.activo ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : ""}`}
                          >
                            {pdv.activo ? "Activo" : "Inactivo"}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Editar */}
                        <button
                          onClick={() => abrirEditar(pdv)}
                          title="Editar nombre"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        >
                          <Pencil size={15} />
                        </button>
                        {/* Activar / Desactivar */}
                        <button
                          onClick={() => mutEstado.mutate({ id: pdv.id, activo: !pdv.activo })}
                          title={pdv.activo ? "Desactivar" : "Activar"}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${pdv.activo ? "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20" : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"}`}
                        >
                          <Power size={15} />
                        </button>
                        {/* Eliminar */}
                        <button
                          onClick={() => setConfirmId(pdv.id)}
                          title="Eliminar"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {/* ── Modal crear/editar ── */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-sm rounded-2xl border bg-background shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="text-base font-bold">{modal === "crear" ? "Nueva Sucursal" : "Editar Sucursal"}</h3>
              <button onClick={() => setModal(null)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nombre</label>
                <Input
                  autoFocus
                  placeholder="Ej: Mall Centro"
                  value={form.nombre}
                  onChange={e => { setForm(p => ({ ...p, nombre: e.target.value })); setError(""); }}
                  className={error ? "border-destructive" : ""}
                />
                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>
              {modal === "crear" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Tipo</label>
                  <select
                    value={form.tipo}
                    onChange={e => setForm(p => ({ ...p, tipo: e.target.value as "PUNTO_VENTA" | "BODEGA" }))}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="PUNTO_VENTA">Punto de Venta</option>
                    <option value="BODEGA">Bodega</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 border-t px-5 py-4">
              <button onClick={() => setModal(null)} className="flex-1 h-10 rounded-xl border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancelar</button>
              <button
                onClick={guardar}
                disabled={mutCrear.isPending || mutEditar.isPending}
                className="flex-1 h-10 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {modal === "crear" ? "Crear" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmar eliminación ── */}
      {confirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl border bg-background shadow-2xl p-6 space-y-4 text-center">
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40">
              <Trash2 size={24} className="text-red-600" />
            </div>
            <div>
              <p className="font-bold text-foreground">¿Eliminar sucursal?</p>
              <p className="text-sm text-muted-foreground mt-1">
                Solo se puede eliminar si no tiene historial de turnos. Si tiene ventas registradas, usa <strong>Desactivar</strong>.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmId(null)} className="flex-1 h-10 rounded-xl border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancelar</button>
              <button
                onClick={() => mutEliminar.mutate(confirmId)}
                disabled={mutEliminar.isPending}
                className="flex-1 h-10 rounded-xl bg-red-600 text-sm font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
