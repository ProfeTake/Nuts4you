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
  Package,
  PackagePlus,
  Target,
  Plus,
  Pencil,
  Power,
  Trash2,
  X,
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

// API + helpers
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { formatearCLP } from "@/lib/money";
import { compararProductos } from "@/lib/categorias";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PanelTurnosActivos } from "./PanelTurnosActivos";
import { PagoVendedorCaja } from "./PagoVendedorCaja";

// ─── Componente principal ───

interface PDVCompleto { id: number; nombre: string; tipo: string; activo: boolean }

/** Una línea del formulario de retiros (varios retiros en una sola pasada). */
interface LineaRetiro { id: number; monto: string; descripcion: string }

let _siguienteLineaId = 1;
const nuevaLineaRetiro = (): LineaRetiro => ({ id: _siguienteLineaId++, monto: "", descripcion: "" });

/** Líneas completas y válidas: con monto > 0 y justificación. */
const lineasValidas = (lineas: LineaRetiro[]) =>
  lineas
    .map((l) => ({ monto: parseInt(l.monto, 10), descripcion: l.descripcion.trim() }))
    .filter((l) => !isNaN(l.monto) && l.monto > 0 && l.descripcion.length > 0);

export function ControlVentasSucursal() {
  const [tab, setTab] = useState<"cierre" | "historial" | "gestionar">("cierre");
  const [pdvSeleccionado, setPdvSeleccionado] = useState<number | "">("");
  const [fechaSeleccionada, setFechaSeleccionada] = useState(
    new Date().toISOString().split("T")[0]
  );
  // Varios retiros a la vez: en una misma visita al punto se saca plata por más
  // de un motivo (depósito, pago a proveedor, vuelto) y cada uno necesita su
  // propia justificación para que el cuadre sea auditable.
  const [lineasRetiro, setLineasRetiro] = useState<LineaRetiro[]>([nuevaLineaRetiro()]);
  const [dineroRecibido, setDineroRecibido] = useState("");

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
    // En "Cierre de Turno" refresca solo para que el reporte aparezca apenas
    // el vendedor cierra su caja, sin tener que recargar a mano.
    refetchInterval: tab === "cierre" ? 15_000 : false,
  });

  const sinDatos =
    isError && error instanceof Error && error.message.includes("No hay turno");

  const mutacionRetiro = useMutation({
    // Se registran de a uno y en serie: cada retiro es su propia fila auditable, y
    // en serie el error identifica exactamente cuál falló. Se acumulan los que sí
    // entraron para no volver a enviarlos si hay que reintentar.
    mutationFn: async ({ turnoId, retiros }: { turnoId: number; retiros: { monto: number; descripcion: string }[] }) => {
      const registrados: number[] = [];
      for (const [i, r] of retiros.entries()) {
        try {
          await apiPost(`/pos/turnos/${turnoId}/retiros`, { monto: r.monto, descripcion: r.descripcion });
          registrados.push(i);
        } catch (err) {
          const detalle = err instanceof Error ? err.message : "error desconocido";
          throw new Error(
            registrados.length > 0
              ? `Se registraron ${registrados.length} retiro(s), pero falló "${r.descripcion}": ${detalle}. Los pendientes siguen en el formulario.`
              : `No se pudo registrar "${r.descripcion}": ${detalle}`,
          )
        }
      }
      return registrados.length
    },
    onSuccess: (cantidad) => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "ventas-sucursal", pdvSeleccionado, fechaSeleccionada],
      });
      // El panel de turnos activos muestra los retiros acumulados del turno
      queryClient.invalidateQueries({ queryKey: ["admin", "turnos-activos"] });
      // El detalle de movimientos del turno abierto (retiros + gastos)
      queryClient.invalidateQueries({ queryKey: ["admin", "movimientos-turno"] });
      setLineasRetiro([nuevaLineaRetiro()]);
      toast.success(
        cantidad === 1 ? "Retiro registrado correctamente" : `${cantidad} retiros registrados correctamente`,
      );
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Error al registrar retiro", { duration: 10000 });
    },
  });

  const retirosAEnviar = lineasValidas(lineasRetiro);

  const handleRetiro = () => {
    if (!reporte || retirosAEnviar.length === 0) return;
    mutacionRetiro.mutate({ turnoId: reporte.turnoId, retiros: retirosAEnviar });
  };

  const actualizarLinea = (id: number, campo: "monto" | "descripcion", valor: string) =>
    setLineasRetiro((prev) => prev.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));
  const agregarLinea  = () => setLineasRetiro((prev) => [...prev, nuevaLineaRetiro()]);
  const quitarLinea   = (id: number) =>
    setLineasRetiro((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.id !== id)));

  const totalAEnviar = retirosAEnviar.reduce((s, r) => s + r.monto, 0);
  // Línea a medio llenar: se avisa para que no se pierda al enviar.
  const hayLineaIncompleta = lineasRetiro.some(
    (l) => (l.monto.trim() !== "" || l.descripcion.trim() !== "") &&
           !(parseInt(l.monto, 10) > 0 && l.descripcion.trim() !== ""),
  );

  // ── Recepción del dinero (2ª etapa del cierre: admin/supervisor) ──
  const mutacionRecepcion = useMutation({
    mutationFn: ({ turnoId, dineroRecibido }: { turnoId: number; dineroRecibido: number }) =>
      apiPatch(`/pos/turnos/${turnoId}/recepcion`, { dineroRecibido }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "ventas-sucursal", pdvSeleccionado, fechaSeleccionada],
      });
      setDineroRecibido("");
      toast.success("Turno finalizado: recepción confirmada");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Error al confirmar la recepción");
    },
  });

  const handleRecepcion = () => {
    if (!reporte) return;
    const monto = parseInt(dineroRecibido.replace(/\D/g, ""), 10);
    if (isNaN(monto) || monto < 0) return;
    mutacionRecepcion.mutate({ turnoId: reporte.turnoId, dineroRecibido: monto });
  };

  // ── Cierre administrativo: cerrar un turno que quedó ABIERTO sin cuadre ──
  const [confirmandoCierreAdmin, setConfirmandoCierreAdmin] = useState(false);
  const mutacionCierreAdmin = useMutation({
    mutationFn: (turnoId: number) => apiPatch(`/pos/turnos/${turnoId}/cerrar-admin`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "ventas-sucursal", pdvSeleccionado, fechaSeleccionada],
      });
      // El turno deja de estar abierto: sale del panel de turnos activos
      queryClient.invalidateQueries({ queryKey: ["admin", "turnos-activos"] });
      setConfirmandoCierreAdmin(false);
      toast.success("Turno cerrado administrativamente");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "No se pudo cerrar el turno");
    },
  });

  // ── Reabrir un turno mal cerrado (solo ADMIN) ──
  const [confirmandoReapertura, setConfirmandoReapertura] = useState(false);
  const mutacionReabrir = useMutation({
    mutationFn: (turnoId: number) =>
      apiPatch<{ data: { mensaje: string; productosRestaurados: number; stockRestaurable: boolean } }>(
        `/pos/turnos/${turnoId}/reabrir`, {},
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "ventas-sucursal", pdvSeleccionado, fechaSeleccionada],
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "turnos-activos"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "movimientos-turno"] });
      setConfirmandoReapertura(false);
      toast.success("Turno reabierto", {
        description: res.data.stockRestaurable
          ? `El vendedor puede volver a cuadrar. Stock restaurado en ${res.data.productosRestaurados} producto(s).`
          : "El vendedor puede volver a cuadrar. Ojo: este turno se cerró antes de que se guardara el detalle del stock, así que el inventario NO se revirtió — revísalo a mano.",
        duration: 12000,
      });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "No se pudo reabrir el turno", { duration: 10000 });
    },
  });

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
            {tab === "cierre" ? "Cierre de turno y ventas diarias por punto de venta" : tab === "historial" ? "Historial de turnos por sucursal" : "Administrar puntos de venta"}
          </p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 rounded-xl bg-muted p-1 w-fit flex-wrap">
        <button
          onClick={() => setTab("cierre")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === "cierre" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Wallet size={16} /> Cierre y Ventas
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

      {/* ── TAB: CIERRE Y VENTAS ── */}
      {tab === "cierre" && (<>

      {/* ── Turnos abiertos ahora mismo ── */}
      {esAdminOSupervisor && (
        <PanelTurnosActivos
          pdvSeleccionado={pdvSeleccionado}
          onSeleccionar={(pdvId, diaApertura) => {
            setPdvSeleccionado(pdvId);
            // El reporte de abajo busca el turno por su día de apertura: para un
            // turno arrastrado de días anteriores hay que pedir ESE día, no hoy.
            setFechaSeleccionada(diaApertura);
          }}
        />
      )}

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
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                  <AlertCircle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                    El turno sigue <strong>abierto</strong>. El total vendido, el efectivo a entregar y los saldos finales
                    aparecerán aquí cuando <strong>{reporte.vendedor}</strong> cierre su caja en el POS. Ahí podrás confirmar
                    el dinero recibido y dar término al turno.
                  </p>
                </div>

                {/* Cierre administrativo: para turnos que quedaron abiertos sin cuadre */}
                {esAdminOSupervisor && (
                  !confirmandoCierreAdmin ? (
                    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-dashed px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">
                        ¿Quedó abierto por error o el vendedor no lo cerró? Puedes cerrarlo tú.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950/30"
                        onClick={() => setConfirmandoCierreAdmin(true)}
                      >
                        <Power className="size-4 mr-1.5" />
                        Cerrar turno administrativamente
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 px-4 py-3 space-y-2.5">
                      <p className="text-xs text-red-700 dark:text-red-400">
                        <strong>Cierre administrativo:</strong> el turno se cerrará <strong>sin ventas declaradas</strong> (en $0),
                        porque el vendedor no cuadró su caja. Úsalo solo para desatascar turnos que quedaron abiertos.
                        Esta acción no se puede deshacer.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled={mutacionCierreAdmin.isPending}
                          onClick={() => setConfirmandoCierreAdmin(false)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                          disabled={mutacionCierreAdmin.isPending}
                          onClick={() => mutacionCierreAdmin.mutate(reporte.turnoId)}
                        >
                          {mutacionCierreAdmin.isPending ? (
                            <Loader2 className="size-4 mr-1.5 animate-spin" />
                          ) : (
                            <Power className="size-4 mr-1.5" />
                          )}
                          Sí, cerrar turno
                        </Button>
                      </div>
                    </div>
                  )
                )}
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
                {/* Dos bloques separados a propósito: los retiros aparecen en ambos
                    con signo opuesto (salen de la caja, pero igual van al banco) y
                    en una lista plana eso se leía como un error de cálculo. */}

                {/* 1. ¿Cuánto debía haber en la caja? */}
                <div className="rounded-xl border bg-background overflow-hidden text-sm">
                  <div className="border-b bg-muted/40 px-4 py-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      1 · Qué debía haber en la caja
                    </p>
                  </div>
                  <div className="divide-y divide-border/60">
                    <FilaCuadreAdmin label="Total venta calculada" valor={formatearCLP(reporte.totalVentas)} claseValor="font-bold" />
                    {reporte.ventaTarjeta > 0 && (
                      <FilaCuadreAdmin
                        icono={<CreditCard className="size-3.5 text-blue-500" />}
                        label="− Venta tarjeta"
                        valor={`-${formatearCLP(reporte.ventaTarjeta)}`}
                        claseValor="text-blue-600"
                      />
                    )}
                    {reporte.ventaTransferencia > 0 && (
                      <FilaCuadreAdmin
                        icono={<ArrowLeftRight className="size-3.5 text-violet-500" />}
                        label="− Venta transferencia"
                        valor={`-${formatearCLP(reporte.ventaTransferencia)}`}
                        claseValor="text-violet-600"
                      />
                    )}
                    <FilaCuadreAdmin label="= Venta en efectivo" valor={formatearCLP(reporte.ventaEfectivo)} claseValor="font-semibold" />
                    {/* Salidas de efectivo del turno: esa plata ya no estaba en la caja
                        cuando el vendedor contó, así que baja el esperado. Sin estas dos
                        filas un retiro grande se leía como faltante del vendedor. */}
                    {reporte.totalGastos > 0 && (
                      <FilaCuadreAdmin label="− Gastos pagados de la caja" valor={`-${formatearCLP(reporte.totalGastos)}`} claseValor="text-red-600" />
                    )}
                    {reporte.totalRetiros > 0 && (
                      <FilaCuadreAdmin label="− Retiros del punto" valor={`-${formatearCLP(reporte.totalRetiros)}`} claseValor="text-orange-600" />
                    )}
                    <FilaCuadreAdmin
                      label="= Esperado en caja"
                      valor={formatearCLP(reporte.esperadoCaja)}
                      claseValor={`font-bold ${reporte.esperadoCaja < 0 ? "text-red-600" : ""}`}
                    />
                    <FilaCuadreAdmin
                      label="Efectivo contado por el vendedor"
                      valor={formatearCLP(reporte.efectivoDeclarado)}
                      claseValor="font-semibold"
                    />
                  </div>
                </div>

                {/* Un esperado negativo es imposible: salió más plata de la caja de la
                    que entró. Casi siempre es un retiro cargado al turno equivocado o
                    con un cero de más; sin este aviso el error se leía como sobrante. */}
                {reporte.esperadoCaja < 0 && (
                  <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 dark:border-red-900/60 dark:bg-red-950/20">
                    <p className="text-sm font-bold text-red-700 dark:text-red-400">
                      ⚠ Los datos de este turno no cuadran
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-red-600 dark:text-red-400/90">
                      El esperado en caja da <strong>negativo</strong>: entre retiros y gastos salieron{" "}
                      <strong>{formatearCLP(reporte.totalRetiros + reporte.totalGastos)}</strong> de una caja que solo
                      recibió <strong>{formatearCLP(reporte.ventaEfectivo)}</strong> en ventas al contado. Eso no puede
                      pasar en la realidad, así que la diferencia de abajo no es un sobrante real — revisa los retiros
                      registrados en este turno.
                    </p>
                  </div>
                )}

                {/* 2. ¿Cuánto va al banco? */}
                <div className="rounded-xl border bg-background overflow-hidden text-sm">
                  <div className="border-b bg-muted/40 px-4 py-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      2 · Qué debe llegar al banco
                    </p>
                  </div>
                  <div className="divide-y divide-border/60">
                    <FilaCuadreAdmin label="Efectivo que entrega el vendedor" valor={formatearCLP(reporte.efectivoAEntregar)} />
                    {reporte.totalRetiros > 0 && (
                      <FilaCuadreAdmin
                        label="+ Retiros ya sacados del punto"
                        valor={`+${formatearCLP(reporte.totalRetiros)}`}
                        claseValor="text-orange-600"
                      />
                    )}
                    {/* Pagos al vendedor hechos con este mismo efectivo: no llegan
                        al banco (planilla del cliente, celda F29 "Pagado a Vendedor"). */}
                    {reporte.pagoVendedorTotal > 0 && (
                      <FilaCuadreAdmin
                        icono={<User className="size-3.5 text-amber-500" />}
                        label="− Pagado a vendedor/a desde esta caja"
                        valor={`-${formatearCLP(reporte.pagoVendedorTotal)}`}
                        claseValor="text-amber-600"
                      />
                    )}
                    <FilaCuadreAdmin
                      label="= A depositar"
                      valor={formatearCLP(reporte.aDepositar)}
                      claseValor={`font-bold ${reporte.aDepositar < 0 ? "text-red-600" : "text-primary"}`}
                    />
                    {/* La caja chica no participa del cuadre: se muestra como dato del
                        punto (queda en la sucursal para el turno siguiente). */}
                    {reporte.saldoInicial > 0 && (
                      <FilaCuadreAdmin
                        label="Caja chica que queda en el punto (fuera del cuadre)"
                        valor={formatearCLP(reporte.saldoInicial)}
                        claseValor="text-muted-foreground"
                      />
                    )}
                  </div>
                </div>

                {/* Efectivo declarado / a entregar vs esperado */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Efectivo a entregar</p>
                    <p className="text-xl font-bold tabular-nums">{formatearCLP(reporte.efectivoAEntregar)}</p>
                    <p className="text-[10px] text-muted-foreground">Efectivo de ventas contado (la caja chica queda en el punto)</p>
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

                {/* Reabrir el turno: para cuando el cuadre se declaró con datos
                    equivocados. Solo ADMIN — deshace stock, depósito y cuadre. */}
                {usuario?.rol === "ADMIN" && !confirmandoReapertura && (
                  <div className="flex flex-col gap-2 rounded-lg border border-dashed px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      ¿El cuadre quedó mal declarado? Puedes reabrir el turno para que se vuelva a cerrar.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setConfirmandoReapertura(true)}
                    >
                      <History className="size-4 mr-1.5" />
                      Reabrir turno
                    </Button>
                  </div>
                )}
                {usuario?.rol === "ADMIN" && confirmandoReapertura && (
                  <div className="space-y-2.5 rounded-lg border border-amber-300 bg-amber-50/60 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/20">
                    <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-400">
                      <strong>Se va a deshacer el cierre del turno #{reporte.turnoId}.</strong> El stock del punto
                      vuelve al valor que tenía antes de cerrar, se elimina el depósito generado y se borra el cuadre
                      declarado ({formatearCLP(reporte.efectivoDeclarado)} contados, diferencia{" "}
                      {formatearCLP(reporte.diferenciaCaja)}). Si ya confirmaste la recepción del dinero, habrá que
                      confirmarla de nuevo.
                    </p>
                    <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-400">
                      Los <strong>gastos y retiros no se tocan</strong>: son movimientos reales del punto. Si el error
                      estaba ahí, corrígelos una vez reabierto el turno.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={mutacionReabrir.isPending}
                        onClick={() => setConfirmandoReapertura(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                        disabled={mutacionReabrir.isPending}
                        onClick={() => mutacionReabrir.mutate(reporte.turnoId)}
                      >
                        {mutacionReabrir.isPending
                          ? <Loader2 className="size-4 mr-1.5 animate-spin" />
                          : <History className="size-4 mr-1.5" />}
                        Sí, reabrir turno
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Detalle de ventas por producto (solo turno CERRADO con snapshot) ── */}
          {reporte.estado === "CERRADO" && reporte.detalleVentas.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Package className="size-5" />
                  Detalle de ventas — {pdvNombre}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Lo vendido por {reporte.vendedor} en este turno (unidades × precio). El vendedor no ve estos montos.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y text-left text-muted-foreground bg-muted/40">
                        <th className="px-4 py-2 font-medium">Producto</th>
                        <th className="px-4 py-2 font-medium text-center">Cant.</th>
                        <th className="px-4 py-2 font-medium text-right">Precio</th>
                        <th className="px-4 py-2 font-medium text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Mismo orden que el Turno Activo (Mezclas → Paquetes →
                          Promos → Líquidos, y dentro de cada uno Maní, Almendras,
                          Nueces, Promo). Venía ordenado por subtotal, así que el
                          admin leía los productos en un orden distinto al que la
                          vendedora los cuenta. */}
                      {[...reporte.detalleVentas].sort(compararProductos).map((d) => (
                        <tr key={d.productoId} className="border-b last:border-0">
                          <td className="px-4 py-2 font-medium whitespace-nowrap">{d.nombre}</td>
                          <td className="px-4 py-2 text-center tabular-nums">{d.cantidad}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{formatearCLP(d.precioUnitario)}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold">{formatearCLP(d.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/30">
                        <td className="px-4 py-2.5 font-bold" colSpan={3}>TOTAL VENDIDO</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-extrabold text-primary">
                          {formatearCLP(reporte.detalleVentas.reduce((s, d) => s + d.subtotal, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Recepción de dinero / Término de turno (admin/supervisor) ── */}
          {esAdminOSupervisor && reporte.estado === "CERRADO" && (
            reporte.recepcionConfirmada ? (
              <Card className="border-emerald-500/50 bg-emerald-500/5">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <CheckCircle2 className="size-5 text-emerald-600" />
                    Turno finalizado
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Dinero recibido</p>
                      <p className="text-xl font-bold tabular-nums text-emerald-600">{formatearCLP(reporte.dineroRecibido ?? 0)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Diferencia</p>
                      {(() => {
                        const dif = reporte.diferenciaRecepcion ?? 0;
                        return (
                          <p className={`text-xl font-bold tabular-nums ${dif < 0 ? "text-red-600" : dif === 0 ? "text-emerald-600" : "text-blue-600"}`}>
                            {dif >= 0 ? "+" : ""}{formatearCLP(dif)}
                          </p>
                        );
                      })()}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recibido por</p>
                      <p className="text-base font-bold">{reporte.recibidoPor ?? "—"}</p>
                      {reporte.fechaRecepcion && (
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(reporte.fechaRecepcion).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-primary/40 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Banknote className="size-5 text-primary" />
                    Recepción de Dinero — Dar término al turno
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg bg-muted/50 px-4 py-2.5 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Efectivo de ventas a entregar</span>
                    <span className="text-sm font-bold tabular-nums">{formatearCLP(reporte.efectivoAEntregar)}</span>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="dinero-recibido">Dinero recibido en mano ($)</Label>
                    <Input
                      id="dinero-recibido"
                      inputMode="numeric"
                      placeholder="$0"
                      value={dineroRecibido ? `$${(parseInt(dineroRecibido.replace(/\D/g, ""), 10) || 0).toLocaleString("es-CL")}` : ""}
                      onChange={(e) => setDineroRecibido(e.target.value.replace(/\D/g, ""))}
                      className="text-right h-12 text-lg font-bold"
                    />
                  </div>

                  {/* Diferencia en vivo vs lo declarado por el vendedor */}
                  {dineroRecibido !== "" && (() => {
                    const recibidoNum = parseInt(dineroRecibido.replace(/\D/g, ""), 10) || 0;
                    const dif = recibidoNum - reporte.efectivoAEntregar;
                    return (
                      <div className={`rounded-lg px-4 py-2.5 flex items-center justify-between border ${dif < 0 ? "border-red-500/40 bg-red-500/5" : dif === 0 ? "border-emerald-500/40 bg-emerald-500/5" : "border-blue-500/40 bg-blue-500/5"}`}>
                        <span className="text-sm text-muted-foreground">Diferencia</span>
                        <span className={`text-sm font-bold tabular-nums ${dif < 0 ? "text-red-600" : dif === 0 ? "text-emerald-600" : "text-blue-600"}`}>
                          {dif >= 0 ? "+" : ""}{formatearCLP(dif)}
                          {dif < 0 && <span className="ml-1.5 text-[10px] font-bold">⚠ falta</span>}
                        </span>
                      </div>
                    );
                  })()}

                  <Button
                    onClick={handleRecepcion}
                    disabled={dineroRecibido === "" || mutacionRecepcion.isPending}
                    className="w-full sm:w-auto"
                  >
                    {mutacionRecepcion.isPending ? (
                      <Loader2 className="size-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle2 className="size-4 mr-2" />
                    )}
                    Confirmar cierre de turno
                  </Button>
                </CardContent>
              </Card>
            )
          )}

          {/* ── Pagar a vendedor con el efectivo del punto ── */}
          {/* Sale del "a depositar" de este turno, como la celda F29 ("Pagado a
              Vendedor") de la planilla del cliente. Solo ADMIN: los endpoints de
              pagos viven en RRHH, que es ADMIN-only (A5/D1). */}
          {usuario?.rol === "ADMIN" && reporte.estado === "CERRADO" && (
            <PagoVendedorCaja
              turnoId={reporte.turnoId}
              pdvNombre={pdvNombre}
              aDepositar={reporte.aDepositar}
              depositoBloqueado={reporte.depositoBloqueado}
              pagosVendedor={reporte.pagosVendedor}
              onPagado={() =>
                queryClient.invalidateQueries({
                  queryKey: ["admin", "ventas-sucursal", pdvSeleccionado, fechaSeleccionada],
                })
              }
            />
          )}

          {/* ── Saldos finales del turno (solo turno CERRADO con snapshot) ── */}
          {reporte.estado === "CERRADO" && reporte.saldosFinales.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <PackagePlus className="size-5" />
                  Saldos finales del turno — {pdvNombre}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Stock declarado por {reporte.vendedor} al cerrar (queda como inicio del próximo turno)
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                        <th className="px-4 py-2.5 font-semibold">Producto</th>
                        <th className="px-4 py-2.5 font-semibold">Categoría</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Saldo final</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...reporte.saldosFinales].sort(compararProductos).map((s) => (
                        <tr key={s.productoId} className="border-b last:border-0">
                          <td className="px-4 py-2.5 font-medium">{s.nombre}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{s.categoria}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{s.cantidad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                  {/* Una fila por retiro: cada salida de plata lleva su propia
                      justificación, si no el cuadre queda con un monto grande sin
                      explicar. El "+" agrega filas para registrarlas de una vez. */}
                  {lineasRetiro.map((linea, i) => (
                    <div key={linea.id} className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
                      <div className="space-y-1.5">
                        <Label htmlFor={`monto-retiro-${linea.id}`} className={i > 0 ? "sr-only sm:not-sr-only" : ""}>
                          Monto ($)
                        </Label>
                        <Input
                          id={`monto-retiro-${linea.id}`}
                          type="number"
                          min={1}
                          step={1000}
                          placeholder="Ej: 50000"
                          value={linea.monto}
                          onChange={(e) => actualizarLinea(linea.id, "monto", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`desc-retiro-${linea.id}`} className={i > 0 ? "sr-only sm:not-sr-only" : ""}>
                          Justificación <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id={`desc-retiro-${linea.id}`}
                          placeholder="Motivo del retiro (obligatorio)"
                          value={linea.descripcion}
                          onChange={(e) => actualizarLinea(linea.id, "descripcion", e.target.value)}
                          maxLength={200}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                        title="Quitar este retiro"
                        disabled={lineasRetiro.length === 1}
                        onClick={() => quitarLinea(linea.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}

                  {hayLineaIncompleta && (
                    <p className="text-xs text-destructive">
                      Hay un retiro sin monto o sin justificación: complétalo o quítalo. Solo se registrarán las filas completas.
                    </p>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button variant="outline" size="sm" onClick={agregarLinea} className="w-full sm:w-auto">
                      <Plus className="size-4 mr-1" /> Agregar otro retiro
                    </Button>
                    <Button
                      onClick={handleRetiro}
                      disabled={retirosAEnviar.length === 0 || mutacionRetiro.isPending}
                      className="w-full sm:w-auto sm:ml-auto bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      {mutacionRetiro.isPending ? (
                        <Loader2 className="size-4 animate-spin mr-2" />
                      ) : (
                        <ArrowUpCircle className="size-4 mr-2" />
                      )}
                      {retirosAEnviar.length > 1
                        ? `Registrar ${retirosAEnviar.length} retiros · ${formatearCLP(totalAEnviar)}`
                        : "Registrar retiro"}
                    </Button>
                  </div>
                </div>

                {/* Movimientos ya registrados en el turno: sin esto el admin no
                    tenía forma de ver qué se retiró ni en qué se gastó, solo el
                    total, y no podía detectar un retiro duplicado. */}
                <MovimientosTurno turnoId={reporte.turnoId} puedeBorrar={usuario?.rol === "ADMIN"} />
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

      {/* Las solicitudes de insumos se despachan desde Bodega → tab Solicitudes:
          despachar mueve stock real y necesita el stock de bodega al lado (A15). */}

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
              <SelectValue placeholder={cargandoPdvs ? "Cargando…" : "Selecciona una sucursal"}>
                {pdvId !== "" ? pdvs.find(p => p.id === pdvId)?.nombre : undefined}
              </SelectValue>
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
              <SelectValue>
                {vendedorId === "" ? "Todos los vendedores" : vendedores.find(v => v.id === vendedorId)?.nombre}
              </SelectValue>
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

// ─── MovimientosTurno ─────────────────────────────────────────────────────────
// Retiros y gastos ya registrados en un turno abierto. Ambos salen del efectivo
// de la caja, así que bajan el "esperado" del cuadre: verlos detallados evita
// registrar un retiro dos veces y explica de dónde sale cada peso que falta.

interface RetiroTurno { id: number; monto: number; descripcion: string | null; realizadoPor: string; fechaHora: string }
interface GastoTurno  { id: number; descripcion: string; monto: number }

function MovimientosTurno({ turnoId, puedeBorrar }: { turnoId: number; puedeBorrar: boolean }) {
  const queryClient = useQueryClient();
  const [borrando, setBorrando] = useState<string | null>(null);

  const mutBorrar = useMutation({
    mutationFn: ({ tipo, id }: { tipo: "retiro" | "gasto"; id: number }) =>
      apiDelete(`/pos/turnos/${turnoId}/${tipo === "retiro" ? "retiros" : "gastos"}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "movimientos-turno", turnoId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "ventas-sucursal"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "turnos-activos"] });
      setBorrando(null);
      toast.success("Movimiento eliminado");
    },
    onError: (err) => {
      setBorrando(null);
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar", { duration: 8000 });
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "movimientos-turno", turnoId],
    // Cada lista falla por su cuenta: si una no responde se muestra la otra en
    // vez de dejar el panel entero en blanco.
    queryFn: async () => {
      const [retiros, gastos] = await Promise.all([
        apiGet<{ data: RetiroTurno[] }>(`/pos/turnos/${turnoId}/retiros`).then((r) => r.data).catch(() => [] as RetiroTurno[]),
        apiGet<{ data: GastoTurno[] }>(`/pos/turnos/${turnoId}/gastos`).then((r) => r.data).catch(() => [] as GastoTurno[]),
      ]);
      return { retiros, gastos };
    },
  });

  if (isLoading) return (
    <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
      <Loader2 size={13} className="animate-spin" /> Cargando movimientos…
    </div>
  );
  if (!data) return null;

  const { retiros, gastos } = data;
  if (retiros.length === 0 && gastos.length === 0) return null;

  const totalRetiros = retiros.reduce((s, r) => s + r.monto, 0);
  const totalGastos  = gastos.reduce((s, g) => s + g.monto, 0);

  return (
    <div className="rounded-xl border bg-background overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Movimientos del turno
        </p>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          Sale de caja: {formatearCLP(totalRetiros + totalGastos)}
        </span>
      </div>
      <div className="divide-y text-sm">
        {retiros.map((r) => (
          <div key={`r-${r.id}`} className="flex items-center justify-between gap-3 px-4 py-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.descripcion ?? "Retiro de efectivo"}</p>
              <p className="truncate text-xs text-muted-foreground">
                Retiro · {r.realizadoPor} · {r.fechaHora}
              </p>
            </div>
            <span className="shrink-0 font-bold tabular-nums text-orange-600">−{formatearCLP(r.monto)}</span>
            {puedeBorrar && (
              <BotonBorrarMovimiento
                activo={borrando === `r-${r.id}`}
                pendiente={mutBorrar.isPending}
                onPedir={() => setBorrando(`r-${r.id}`)}
                onCancelar={() => setBorrando(null)}
                onConfirmar={() => mutBorrar.mutate({ tipo: "retiro", id: r.id })}
              />
            )}
          </div>
        ))}
        {gastos.map((g) => (
          <div key={`g-${g.id}`} className="flex items-center justify-between gap-3 px-4 py-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{g.descripcion}</p>
              <p className="text-xs text-muted-foreground">Gasto del turno</p>
            </div>
            <span className="shrink-0 font-bold tabular-nums text-red-600">−{formatearCLP(g.monto)}</span>
            {puedeBorrar && (
              <BotonBorrarMovimiento
                activo={borrando === `g-${g.id}`}
                pendiente={mutBorrar.isPending}
                onPedir={() => setBorrando(`g-${g.id}`)}
                onCancelar={() => setBorrando(null)}
                onConfirmar={() => mutBorrar.mutate({ tipo: "gasto", id: g.id })}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Borrar un movimiento pide confirmación en el mismo lugar: borrarlo cambia el
 * cuadre del turno, así que un clic accidental no debe bastar.
 */
function BotonBorrarMovimiento({ activo, pendiente, onPedir, onCancelar, onConfirmar }: {
  activo: boolean; pendiente: boolean;
  onPedir: () => void; onCancelar: () => void; onConfirmar: () => void;
}) {
  if (!activo) {
    return (
      <Button
        variant="ghost" size="icon" title="Eliminar este movimiento"
        className="size-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onClick={onPedir}
      >
        <Trash2 className="size-3.5" />
      </Button>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onCancelar} disabled={pendiente}>
        Cancelar
      </Button>
      <Button
        size="sm" className="h-8 px-2 text-xs bg-destructive hover:bg-destructive/90 text-white"
        onClick={onConfirmar} disabled={pendiente}
      >
        {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : "Eliminar"}
      </Button>
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
      {/* El descuento no es faltante a faltante: al pagar se suma el neto del
          período (los sobrantes compensan) y solo se descuenta si queda peor que
          la tolerancia configurada en Personal → Pagos. */}
      <div className="px-4 py-2.5 bg-red-100/50 dark:bg-red-950/30 border-t border-red-200 dark:border-red-900">
        <p className="text-xs text-red-700 dark:text-red-400 font-medium">
          Al pagar se descuenta el <strong>neto</strong> del período (los sobrantes compensan),
          y solo si supera la tolerancia de caja configurada.
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
