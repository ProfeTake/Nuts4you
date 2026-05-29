// ─── ModuloRRHH ────────────────────────────────────────────────────────────────
// Módulo de Personal y Remuneraciones del panel de administración.
// Sub-módulos: Empleados (CRUD API) | Turnos (historial real TurnoCaja) | Liquidaciones.
//
// Módulo: RRHH
// Estado actual: conectado a API real (2026-05-14)
// Mejora aplicada: Personal y Turnos ya no usan MOCK_EMPLEADAS / MOCK_TURNOS.
//   Personal → GET/POST/PATCH /api/rrhh/personal (usuarios con rol VENDEDOR)
//   Turnos   → GET /api/rrhh/turnos?mes= (historial real de TurnoCaja)
// Riesgo o deuda pendiente:
//   - Sin campo teléfono en modelo Usuario (no está en schema Prisma)
//   - Sin planificación de turnos futuros (los turnos se crean desde el POS)
// Siguiente paso recomendado: agregar campo telefono al modelo si el cliente lo pide

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Plus,
  Pencil,
  UserX,
  UserCheck,
  Calendar,
  Banknote,
  AlertCircle,
  Star,
  Save,
  Eye,
  FileText,
  Search,
  ChevronRight,
  Clock,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

// shadcn/ui
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Helpers y API
import { formatearCLP } from "@/lib/money";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { autoFormatRUT } from "@/lib/rut";
import type { PDVItem } from "@/tipos/admin.tipos";
import { HorariosTurnos }        from "./HorariosVendedoras";
import { SeguimientoVendedores } from "./SeguimientoVendedores";

// ─── Tipos desde API ────────────────────────────────────────────────────────

interface Personal {
  id:          number;
  nombre:      string;
  rut:         string;
  pdvId:       number | null;
  pdvNombre:   string | null;
  pagoDiario:  number;
  activo:      boolean;
  ultimoTurno: string | null;
}

interface TurnoRRHH {
  id:            number;
  fecha:         string;  // YYYY-MM-DD
  usuarioId:     number;
  usuarioNombre: string;
  pdvId:         number;
  pdvNombre:     string;
  estado:        "ABIERTO" | "CERRADO";
  horaApertura:  string;
  horaCierre:    string | null;
}

interface LiquidacionAPI {
  usuarioId:           number;
  nombre:              string;
  diasTrabajados:      number;
  promedioVentaDiaria: number;
  pagoBase:            number;
  bonos:               number;
  descuentosCaja:      number;
  sueldoLiquido:       number;
}

// ─── Tipos de formularios ────────────────────────────────────────────────────

interface FormPersonal {
  nombre:     string;
  rut:        string;
  pdvId:      string;
  pagoDiario: string;
}

const FORM_PERSONAL_VACIO: FormPersonal = {
  nombre: "", rut: "", pdvId: "", pagoDiario: "28000",
};

// ─── Panel activo ────────────────────────────────────────────────────────────

type PanelActivo =
  | { tipo: "crear-personal" }
  | { tipo: "editar-personal"; personal: Personal }
  | { tipo: "baja-personal"; personal: Personal }
  | { tipo: "detalle-liquidacion"; liq: LiquidacionAPI }
  | null;

// ─── Helpers de formato ──────────────────────────────────────────────────────

function formatearFechaCorta(iso: string): string {
  const [, mes, dia] = iso.slice(0, 10).split("-");
  const meses = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
                      "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${dia} ${meses[Number(mes)]}`;
}

function formatearMesLabel(mesISO: string): string {
  const [anio, mes] = mesISO.split("-");
  const meses = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return `${meses[Number(mes)]} ${anio}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// Componente principal
// ══════════════════════════════════════════════════════════════════════════════

export function ModuloRRHH() {
  const queryClient = useQueryClient();
  const mesActual   = new Date().toISOString().slice(0, 7);

  const [mesSeleccionado, setMesSeleccionado] = useState(mesActual);
  const [panel, setPanel]   = useState<PanelActivo>(null);
  const [formPersonal, setFormPersonal] = useState<FormPersonal>(FORM_PERSONAL_VACIO);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "activos" | "inactivos">("todos");

  // ── Queries ─────────────────────────────────────────────────────────────

  const { data: personal = [], isLoading: cargandoPersonal } = useQuery({
    queryKey: ["rrhh", "personal"],
    queryFn:  () => apiGet<{ data: Personal[] }>("/rrhh/personal").then((r) => r.data),
  });

  const { data: turnos = [], isLoading: cargandoTurnos } = useQuery({
    queryKey: ["rrhh", "turnos", mesSeleccionado],
    queryFn:  () =>
      apiGet<{ data: TurnoRRHH[] }>(`/rrhh/turnos?mes=${mesSeleccionado}`).then((r) => r.data),
  });

  const { data: liquidaciones = [], isLoading: cargandoLiq } = useQuery({
    queryKey: ["rrhh", "nomina", mesSeleccionado],
    queryFn:  () =>
      apiGet<{ data: LiquidacionAPI[] }>(`/rrhh/nomina?mes=${mesSeleccionado}`).then((r) => r.data),
  });

  const { data: pdvs = [] } = useQuery({
    queryKey: ["admin", "pdvs"],
    queryFn:  () => apiGet<{ data: PDVItem[] }>("/admin/pdvs").then((r) => r.data),
  });

  // ── Mutaciones ───────────────────────────────────────────────────────────

  const mutCrear = useMutation({
    mutationFn: (payload: object) =>
      apiPost<{ data: Personal }>("/rrhh/personal", payload),
    onSuccess: (res) => {
      toast.success("Personal agregado", { description: res.data.nombre });
      queryClient.invalidateQueries({ queryKey: ["rrhh", "personal"] });
      setPanel(null);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al crear personal"),
  });

  const mutEditar = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: object }) =>
      apiPatch<{ data: Personal }>(`/rrhh/personal/${id}`, payload),
    onSuccess: (res) => {
      toast.success("Personal actualizado", { description: res.data.nombre });
      queryClient.invalidateQueries({ queryKey: ["rrhh", "personal"] });
      setPanel(null);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al editar personal"),
  });

  const mutEstado = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiPatch<{ data: Personal }>(`/rrhh/personal/${id}`, { activo }),
    onSuccess: (res) => {
      toast.success(res.data.activo ? "Personal reactivado" : "Personal dado de baja", {
        description: res.data.nombre,
      });
      queryClient.invalidateQueries({ queryKey: ["rrhh", "personal"] });
      setPanel(null);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al cambiar estado"),
  });

  // ── Datos derivados ──────────────────────────────────────────────────────

  const personalFiltrado = useMemo(() => {
    const q = busqueda.toLowerCase();
    return personal.filter((p) => {
      if (filtroEstado === "activos"   && !p.activo) return false;
      if (filtroEstado === "inactivos" && p.activo)  return false;
      if (q && !p.nombre.toLowerCase().includes(q) && !p.rut.includes(q)) return false;
      return true;
    });
  }, [personal, busqueda, filtroEstado]);

  const personalActivo = personal.filter((p) => p.activo);

  const metricasLiq = useMemo(() => {
    if (liquidaciones.length === 0) return null;
    const totalNomina    = liquidaciones.reduce((a, l) => a + l.sueldoLiquido, 0);
    const totalDescuentos = liquidaciones.reduce((a, l) => a + l.descuentosCaja, 0);
    const mejorRendimiento = liquidaciones.reduce((a, b) =>
      a.promedioVentaDiaria >= b.promedioVentaDiaria ? a : b
    );
    return { totalNomina, totalDescuentos, mejorRendimiento };
  }, [liquidaciones]);

  // ── Handlers formulario personal ─────────────────────────────────────────

  const setField = useCallback(
    (k: keyof FormPersonal) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setFormPersonal((p) => ({ ...p, [k]: e.target.value })),
    []
  );

  const abrirCrear = useCallback(() => {
    setFormPersonal(FORM_PERSONAL_VACIO);
    setPanel({ tipo: "crear-personal" });
  }, []);

  const abrirEditar = useCallback((p: Personal) => {
    setFormPersonal({
      nombre:     p.nombre,
      rut:        p.rut,
      pdvId:      p.pdvId ? String(p.pdvId) : "",
      pagoDiario: String(p.pagoDiario),
    });
    setPanel({ tipo: "editar-personal", personal: p });
  }, []);

  const cerrarPanel = useCallback(() => setPanel(null), []);

  const guardarPersonal = useCallback(() => {
    const pdvId     = formPersonal.pdvId ? parseInt(formPersonal.pdvId, 10) : null;
    const pagoDiario = parseInt(formPersonal.pagoDiario, 10) || 28000;

    if (panel?.tipo === "crear-personal") {
      mutCrear.mutate({
        nombre:     formPersonal.nombre.trim(),
        rut:        formPersonal.rut.trim(),
        pdvId,
        pagoDiario,
      });
    } else if (panel?.tipo === "editar-personal") {
      mutEditar.mutate({
        id: panel.personal.id,
        payload: { nombre: formPersonal.nombre.trim(), pdvId, pagoDiario },
      });
    }
  }, [formPersonal, panel, mutCrear, mutEditar]);

  const guardando = mutCrear.isPending || mutEditar.isPending;

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Personal y Remuneraciones</h1>
        <p className="text-sm text-muted-foreground">
          Gestión de personal de ventas, historial de turnos y liquidaciones del mes
        </p>
      </div>

      <Separator />

      {/* Selector de mes global (afecta Turnos y Liquidaciones) */}
      <div className="flex items-center gap-3">
        <Label htmlFor="mes-input" className="text-sm shrink-0 text-muted-foreground">Mes:</Label>
        <Input
          id="mes-input"
          type="month"
          value={mesSeleccionado}
          max={mesActual}
          onChange={(e) => setMesSeleccionado(e.target.value)}
          className="h-9 w-44 text-sm"
        />
        <span className="text-sm text-muted-foreground hidden sm:inline">
          {formatearMesLabel(mesSeleccionado)}
        </span>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="empleados">
        {/* Carrusel horizontal — scrollable en móvil, dedos grandes */}
        <div className="w-full overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <TabsList className="!h-12 w-max min-w-full gap-0.5 px-1">
            <TabsTrigger value="empleados" className="shrink-0 !h-10 px-4 gap-2 min-w-max text-sm">
              <Users className="size-4" />
              Personal
              <Badge variant="secondary" className="text-xs ml-0.5 shrink-0">
                {personalActivo.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="turnos" className="shrink-0 !h-10 px-4 gap-2 min-w-max text-sm">
              <Calendar className="size-4" />
              Turnos
            </TabsTrigger>
            <TabsTrigger value="liquidaciones" className="shrink-0 !h-10 px-4 gap-2 min-w-max text-sm">
              <Banknote className="size-4" />
              Liquidaciones
            </TabsTrigger>
            <TabsTrigger value="horarios" className="shrink-0 !h-10 px-4 gap-2 min-w-max text-sm">
              <Calendar className="size-4" />
              Horarios
            </TabsTrigger>
            <TabsTrigger value="seguimiento" className="shrink-0 !h-10 px-4 gap-2 min-w-max text-sm">
              <Star className="size-4" />
              Seguimiento
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ════════════ TAB: PERSONAL ════════════ */}
        <TabsContent value="empleados" className="mt-5 space-y-4">
          {/* Barra de acciones */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Buscar por nombre o RUT…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select
                value={filtroEstado}
                onValueChange={(v) => setFiltroEstado(v as typeof filtroEstado)}
              >
                <SelectTrigger className="h-9 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="activos">Activos</SelectItem>
                  <SelectItem value="inactivos">Inactivos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={abrirCrear}>
              <Plus className="size-4 mr-1" />
              Añadir Personal
            </Button>
          </div>

          {/* Resumen mini */}
          <div className="grid grid-cols-3 gap-2">
            <MiniCard label="Total" valor={personal.length} />
            <MiniCard label="Activos" valor={personalActivo.length} color="text-emerald-600" />
            <MiniCard
              label="Inactivos"
              valor={personal.filter((p) => !p.activo).length}
              color={personal.filter((p) => !p.activo).length > 0 ? "text-amber-600" : ""}
            />
          </div>

          {/* Cargando */}
          {cargandoPersonal ? (
            <div className="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Cargando personal…
            </div>
          ) : personalFiltrado.length === 0 ? (
            <EmptyState icon={<Users className="size-8" />} mensaje="Sin resultados" />
          ) : (
            <>
              {/* Mobile: tarjetas */}
              <div className="sm:hidden space-y-2">
                {personalFiltrado.map((p) => (
                  <Card key={p.id}>
                    <CardContent className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold truncate">{p.nombre}</span>
                            <EstadoBadge activo={p.activo} />
                          </div>
                          <p className="text-xs text-muted-foreground">{p.rut}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.pdvNombre ?? <em>Sin sucursal</em>}
                          </p>
                          <p className="mt-1 text-xs font-medium">
                            {formatearCLP(p.pagoDiario)}/día
                          </p>
                        </div>
                        <AccionesPersonal
                          personal={p}
                          onEditar={() => abrirEditar(p)}
                          onBaja={() => setPanel({ tipo: "baja-personal", personal: p })}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop: tabla */}
              <Card className="hidden sm:block">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Nombre</th>
                        <th className="px-4 py-3 font-medium">RUT</th>
                        <th className="px-4 py-3 font-medium">Sucursal</th>
                        <th className="px-4 py-3 font-medium text-right">Pago / Día</th>
                        <th className="px-4 py-3 font-medium text-center">Estado</th>
                        <th className="px-4 py-3 font-medium">Último turno</th>
                        <th className="px-4 py-3 font-medium text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {personalFiltrado.map((p) => (
                        <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium">{p.nombre}</td>
                          <td className="px-4 py-3 tabular-nums text-muted-foreground">{p.rut}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {p.pdvNombre ?? <em className="text-muted-foreground/60">Sin asignar</em>}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">
                            {formatearCLP(p.pagoDiario)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <EstadoBadge activo={p.activo} />
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {p.ultimoTurno
                              ? formatearFechaCorta(p.ultimoTurno.slice(0, 10))
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <AccionesPersonal
                              personal={p}
                              onEditar={() => abrirEditar(p)}
                              onBaja={() => setPanel({ tipo: "baja-personal", personal: p })}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ════════════ TAB: TURNOS ════════════ */}
        <TabsContent value="turnos" className="mt-5 space-y-4">
          <p className="text-xs text-muted-foreground">
            Historial de turnos trabajados en {formatearMesLabel(mesSeleccionado)}.
            Los turnos se crean automáticamente cuando el vendedor abre caja desde el POS.
          </p>

          {cargandoTurnos ? (
            <div className="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Cargando turnos…
            </div>
          ) : turnos.length === 0 ? (
            <EmptyState
              icon={<Calendar className="size-8" />}
              mensaje={`Sin turnos registrados en ${formatearMesLabel(mesSeleccionado)}`}
            />
          ) : (
            <>
              {/* Mobile: tarjetas */}
              <div className="sm:hidden space-y-2">
                {turnos.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-xl border bg-card px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{t.usuarioNombre}</p>
                      <p className="text-xs text-muted-foreground">{t.pdvNombre}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <TurnoBadge estado={t.estado} />
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {formatearFechaCorta(t.fecha)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: tabla */}
              <Card className="hidden sm:block">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Fecha</th>
                        <th className="px-4 py-3 font-medium">Vendedor/a</th>
                        <th className="px-4 py-3 font-medium">Sucursal</th>
                        <th className="px-4 py-3 font-medium text-center">Estado</th>
                        <th className="px-4 py-3 font-medium">Hora apertura</th>
                        <th className="px-4 py-3 font-medium">Hora cierre</th>
                      </tr>
                    </thead>
                    <tbody>
                      {turnos.map((t) => (
                        <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 tabular-nums font-medium whitespace-nowrap">
                            {formatearFechaCorta(t.fecha)}
                          </td>
                          <td className="px-4 py-3">{t.usuarioNombre}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{t.pdvNombre}</td>
                          <td className="px-4 py-3 text-center">
                            <TurnoBadge estado={t.estado} />
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                            {new Date(t.horaApertura).toLocaleTimeString("es-CL", {
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                            {t.horaCierre
                              ? new Date(t.horaCierre).toLocaleTimeString("es-CL", {
                                  hour: "2-digit", minute: "2-digit",
                                })
                              : <span className="flex items-center gap-1"><Clock className="size-3" />En curso</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ════════════ TAB: LIQUIDACIONES ════════════ */}
        <TabsContent value="liquidaciones" className="mt-5 space-y-5">
          {cargandoLiq ? (
            <div className="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Calculando liquidaciones…
            </div>
          ) : liquidaciones.length === 0 ? (
            <EmptyState
              icon={<Banknote className="size-8" />}
              mensaje={`Sin turnos cerrados en ${formatearMesLabel(mesSeleccionado)}`}
            />
          ) : (
            <>
              {/* Métricas */}
              {metricasLiq && (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                  <Card>
                    <CardContent className="px-4 py-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                          <Banknote className="size-4 text-blue-600" />
                        </div>
                        <p className="text-xs font-medium text-muted-foreground">Total Nómina a Pagar</p>
                      </div>
                      <p className="text-2xl font-bold tabular-nums">
                        {formatearCLP(metricasLiq.totalNomina)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {liquidaciones.length} vendedor{liquidaciones.length !== 1 ? "es" : ""} · {formatearMesLabel(mesSeleccionado)}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className={metricasLiq.totalDescuentos > 0 ? "border-red-400 dark:border-red-600" : ""}>
                    <CardContent className="px-4 py-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                          metricasLiq.totalDescuentos > 0
                            ? "bg-red-100 dark:bg-red-900/30"
                            : "bg-slate-100 dark:bg-slate-800"
                        }`}>
                          <AlertCircle className={`size-4 ${
                            metricasLiq.totalDescuentos > 0 ? "text-red-600" : "text-slate-400"
                          }`} />
                        </div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Total Descuentos por Caja
                        </p>
                      </div>
                      <p className={`text-2xl font-bold tabular-nums ${
                        metricasLiq.totalDescuentos > 0 ? "text-red-600" : "text-foreground"
                      }`}>
                        {metricasLiq.totalDescuentos > 0
                          ? `− ${formatearCLP(metricasLiq.totalDescuentos)}`
                          : "Sin descuentos"}
                      </p>
                      {metricasLiq.totalDescuentos > 0 && (
                        <p className="mt-0.5 text-xs text-red-600 font-medium">
                          {liquidaciones.filter((l) => l.descuentosCaja > 0).length} con faltante
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="px-4 py-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                          <Star className="size-4 text-amber-600" />
                        </div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Mejor Rendimiento (Promedio Diario)
                        </p>
                      </div>
                      <p className="text-base font-bold truncate">
                        {metricasLiq.mejorRendimiento.nombre}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-amber-600">
                        {formatearCLP(metricasLiq.mejorRendimiento.promedioVentaDiaria)}/día
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Mobile: tarjetas */}
              <div className="sm:hidden space-y-2">
                {liquidaciones.map((l) => (
                  <button
                    key={l.usuarioId}
                    className="w-full text-left rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40 active:bg-muted/60"
                    onClick={() => setPanel({ tipo: "detalle-liquidacion", liq: l })}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{l.nombre}</p>
                        <p className="text-xs text-muted-foreground">{l.diasTrabajados} días</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold tabular-nums">
                          {formatearCLP(l.sueldoLiquido)}
                        </p>
                        {l.descuentosCaja > 0 && (
                          <p className="text-xs font-bold text-red-600 tabular-nums">
                            − {formatearCLP(l.descuentosCaja)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Promedio:{" "}
                        <span className="font-medium text-foreground tabular-nums">
                          {formatearCLP(l.promedioVentaDiaria)}
                        </span>
                        {l.bonos > 0 && (
                          <span className="ml-2 text-emerald-600 font-medium">
                            + bono {formatearCLP(l.bonos)}
                          </span>
                        )}
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" />
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
                        <th className="px-4 py-3 font-medium">Vendedor/a</th>
                        <th className="px-4 py-3 font-medium text-center">Días</th>
                        <th className="px-4 py-3 font-medium text-right">Prom. Venta</th>
                        <th className="px-4 py-3 font-medium text-right">Pago Base</th>
                        <th className="px-4 py-3 font-medium text-right">Bonos</th>
                        <th className="px-4 py-3 font-medium text-right">Desc. Caja</th>
                        <th className="px-4 py-3 font-medium text-right">Líquido</th>
                        <th className="px-4 py-3 font-medium text-center">Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liquidaciones.map((l) => (
                        <tr key={l.usuarioId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium">{l.nombre}</td>
                          <td className="px-4 py-3 text-center tabular-nums">{l.diasTrabajados}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <div className="flex items-center justify-end gap-1">
                              {metricasLiq && l.promedioVentaDiaria === metricasLiq.mejorRendimiento.promedioVentaDiaria && (
                                <Star className="size-3 text-amber-500 fill-amber-400 shrink-0" />
                              )}
                              {formatearCLP(l.promedioVentaDiaria)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">
                            {formatearCLP(l.pagoBase)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-emerald-600 font-medium">
                            {l.bonos > 0 ? `+${formatearCLP(l.bonos)}` : "—"}
                          </td>
                          <td className={`px-4 py-3 text-right tabular-nums font-bold ${
                            l.descuentosCaja > 0 ? "text-red-600" : "text-muted-foreground"
                          }`}>
                            {l.descuentosCaja > 0 ? `− ${formatearCLP(l.descuentosCaja)}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-bold text-base">
                            {formatearCLP(l.sueldoLiquido)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              title="Ver detalle"
                              onClick={() => setPanel({ tipo: "detalle-liquidacion", liq: l })}
                            >
                              <Eye className="size-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* Total */}
              {metricasLiq && (
                <div className="flex items-center justify-end gap-2 text-sm border-t pt-3">
                  <span className="text-muted-foreground">
                    Total nómina {formatearMesLabel(mesSeleccionado)}:
                  </span>
                  <span className="text-xl font-bold tabular-nums">
                    {formatearCLP(metricasLiq.totalNomina)}
                  </span>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ════════════ TAB: HORARIOS ════════════ */}
        <TabsContent value="horarios" className="mt-5">
          <HorariosTurnos />
        </TabsContent>

        {/* ════════════ TAB: SEGUIMIENTO ════════════ */}
        <TabsContent value="seguimiento" className="mt-5">
          <SeguimientoVendedores />
        </TabsContent>
      </Tabs>

      {/* ════════════════════════════════════════════════════════════════════
          BOTTOM-SHEETS
          ════════════════════════════════════════════════════════════════════ */}

      {/* ── Panel: Crear / Editar personal ── */}
      {panel && (panel.tipo === "crear-personal" || panel.tipo === "editar-personal") && (
        <BottomSheet onClose={cerrarPanel}>
          <div className="sticky top-0 bg-background px-4 pt-5 pb-3 border-b">
            <Handle />
            <h2 className="text-lg font-bold">
              {panel.tipo === "editar-personal" ? "Editar vendedor/a" : "Añadir Personal"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {panel.tipo === "editar-personal"
                ? "Modifica los datos del vendedor/a."
                : "Registra un nuevo vendedor/a. La contraseña inicial será 1234."}
            </p>
          </div>

          <div className="px-4 py-4 grid gap-4 overflow-y-auto">
            {/* Nombre */}
            <div className="space-y-1.5">
              <Label htmlFor="p-nombre">Nombre completo</Label>
              <Input
                id="p-nombre"
                placeholder="Ej: Alexandra Muñoz"
                value={formPersonal.nombre}
                onChange={setField("nombre")}
              />
            </div>

            {/* RUT (solo al crear) */}
            <div className="space-y-1.5">
              <Label htmlFor="p-rut">RUT</Label>
              <Input
                id="p-rut"
                placeholder="16234567-8"
                value={formPersonal.rut}
                onChange={(e) => setFormPersonal((p) => ({ ...p, rut: autoFormatRUT(e.target.value) }))}
                disabled={panel.tipo === "editar-personal"}
                className={panel.tipo === "editar-personal" ? "bg-muted text-muted-foreground" : ""}
              />
            </div>

            {/* PDV — solo informativo, la asignación real es por Horarios */}
            <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 flex gap-2.5">
              <Calendar className="size-4 text-primary shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p className="font-semibold text-foreground">PDV asignado vía Horarios</p>
                <p>Los puntos de venta se asignan en la pestaña <strong>Horarios</strong> importando el Excel de turnos. No hay sucursal fija por vendedor/a.</p>
              </div>
            </div>

            {/* Pago diario */}
            <div className="space-y-1.5">
              <Label htmlFor="p-pago">Pago diario base (CLP)</Label>
              <Input
                id="p-pago"
                inputMode="numeric"
                placeholder="28000"
                value={formPersonal.pagoDiario}
                onChange={(e) =>
                  setFormPersonal((p) => ({ ...p, pagoDiario: e.target.value.replace(/\D/g, "") }))
                }
              />
            </div>

            {/* Aviso contraseña (solo al crear) */}
            {panel.tipo === "crear-personal" && (
              <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 px-3 py-2.5 text-xs text-blue-700 dark:text-blue-400">
                <CheckCircle2 className="size-3.5 mt-0.5 shrink-0" />
                <span>
                  La contraseña inicial será <strong>1234</strong>. Cámbiala desde{" "}
                  <strong>Gestión de Usuarios</strong> antes de entregar las credenciales.
                </span>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 bg-background border-t px-4 py-3 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={cerrarPanel}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={guardarPersonal}
              disabled={!formPersonal.nombre.trim() || !formPersonal.rut.trim() || guardando}
            >
              {guardando ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Save className="size-4 mr-1" />}
              {panel.tipo === "editar-personal" ? "Guardar Cambios" : "Añadir"}
            </Button>
          </div>
        </BottomSheet>
      )}

      {/* ── Panel: Confirmar baja / reactivar ── */}
      {panel?.tipo === "baja-personal" && (
        <BottomSheet onClose={cerrarPanel}>
          <div className="px-4 pt-5 pb-6">
            <Handle />
            <div className="mb-2 mt-1 flex items-center gap-2">
              {panel.personal.activo
                ? <UserX className="size-5 text-red-600" />
                : <UserCheck className="size-5 text-emerald-600" />}
              <h2 className="text-lg font-bold">
                {panel.personal.activo ? "Dar de Baja" : "Reactivar Personal"}
              </h2>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">
              {panel.personal.activo
                ? <>¿Confirmas dar de baja a <strong className="text-foreground">{panel.personal.nombre}</strong>? Quedará inactiva en el sistema.</>
                : <>¿Reactivar a <strong className="text-foreground">{panel.personal.nombre}</strong>? Podrá volver a ser asignada a turnos.</>}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={cerrarPanel}>
                Cancelar
              </Button>
              {panel.personal.activo ? (
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  disabled={mutEstado.isPending}
                  onClick={() => mutEstado.mutate({ id: panel.personal.id, activo: false })}
                >
                  {mutEstado.isPending
                    ? <Loader2 className="size-4 mr-1 animate-spin" />
                    : <UserX className="size-4 mr-1" />}
                  Dar de Baja
                </Button>
              ) : (
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={mutEstado.isPending}
                  onClick={() => mutEstado.mutate({ id: panel.personal.id, activo: true })}
                >
                  {mutEstado.isPending
                    ? <Loader2 className="size-4 mr-1 animate-spin" />
                    : <UserCheck className="size-4 mr-1" />}
                  Reactivar
                </Button>
              )}
            </div>
          </div>
        </BottomSheet>
      )}

      {/* ── Panel: Detalle liquidación ── */}
      {panel?.tipo === "detalle-liquidacion" && (
        <BottomSheet onClose={cerrarPanel}>
          <div className="px-4 pt-5 pb-6">
            <Handle />
            <div className="mb-4 mt-1">
              <p className="text-lg font-bold">{panel.liq.nombre}</p>
              <p className="text-sm text-muted-foreground">{formatearMesLabel(mesSeleccionado)}</p>
            </div>
            <Separator className="mb-4" />
            <div className="space-y-3 text-sm">
              <FilaDetalle label="Días trabajados" valor={`${panel.liq.diasTrabajados} días`} />
              <FilaDetalle
                label="Promedio venta diaria"
                valor={formatearCLP(panel.liq.promedioVentaDiaria)}
                claseValor="font-semibold"
              />
              <Separator />
              <FilaDetalle label="Pago base" valor={formatearCLP(panel.liq.pagoBase)} claseValor="font-semibold" />
              <FilaDetalle
                label="Bonos"
                valor={panel.liq.bonos > 0 ? `+ ${formatearCLP(panel.liq.bonos)}` : "—"}
                claseValor={panel.liq.bonos > 0 ? "text-emerald-600 font-semibold" : "text-muted-foreground"}
              />
              <FilaDetalle
                label="Descuento por diferencia de caja"
                valor={panel.liq.descuentosCaja > 0 ? `− ${formatearCLP(panel.liq.descuentosCaja)}` : "—"}
                claseValor={panel.liq.descuentosCaja > 0 ? "text-red-600 font-bold" : "text-muted-foreground"}
              />
              <Separator />
              <div className="flex items-center justify-between">
                <span className="font-semibold text-base">Sueldo Líquido</span>
                <span className="text-xl font-bold tabular-nums">
                  {formatearCLP(panel.liq.sueldoLiquido)}
                </span>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={cerrarPanel}>
                Cerrar
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => {
                  toast("Próximamente", { description: "Generación de PDF en desarrollo" });
                  cerrarPanel();
                }}
              >
                <FileText className="size-4 mr-1.5" />
                Generar PDF
              </Button>
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

// ─── Subcomponentes auxiliares ──────────────────────────────────────────────

function BottomSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 max-h-[92dvh] animate-in slide-in-from-bottom duration-300">
        <div className="rounded-t-2xl bg-background overflow-y-auto max-h-[92dvh]">
          {children}
        </div>
      </div>
    </div>
  );
}

function Handle() {
  return (
    <div className="mb-3 flex justify-center">
      <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
    </div>
  );
}

function MiniCard({ label, valor, color = "" }: { label: string; valor: number; color?: string }) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{valor}</p>
      </CardContent>
    </Card>
  );
}

function FilaDetalle({ label, valor, claseValor = "" }: { label: string; valor: string; claseValor?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${claseValor}`}>{valor}</span>
    </div>
  );
}

function EstadoBadge({ activo }: { activo: boolean }) {
  return (
    <Badge
      variant="outline"
      className={activo
        ? "text-xs bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
        : "text-xs bg-slate-500/10 text-slate-500 border-slate-400/30"}
    >
      {activo ? "Activo" : "Inactivo"}
    </Badge>
  );
}

function TurnoBadge({ estado }: { estado: "ABIERTO" | "CERRADO" }) {
  return (
    <Badge
      variant="outline"
      className={estado === "ABIERTO"
        ? "text-xs bg-blue-500/10 text-blue-700 border-blue-500/30"
        : "text-xs bg-slate-500/10 text-slate-500 border-slate-400/30"}
    >
      {estado === "ABIERTO" ? "En curso" : "Cerrado"}
    </Badge>
  );
}

function AccionesPersonal({
  personal,
  onEditar,
  onBaja,
}: {
  personal: Personal;
  onEditar: () => void;
  onBaja: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-center gap-1">
      <Button variant="ghost" size="icon" className="size-8" title="Editar" onClick={onEditar}>
        <Pencil className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={`size-8 ${
          personal.activo
            ? "text-red-500 hover:text-red-600 hover:bg-red-500/10"
            : "text-emerald-600 hover:bg-emerald-500/10"
        }`}
        title={personal.activo ? "Dar de baja" : "Reactivar"}
        onClick={onBaja}
      >
        {personal.activo ? <UserX className="size-3.5" /> : <UserCheck className="size-3.5" />}
      </Button>
    </div>
  );
}

function EmptyState({ icon, mensaje }: { icon: React.ReactNode; mensaje: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-14 text-center">
      <div className="mb-3 text-muted-foreground/30">{icon}</div>
      <p className="text-sm text-muted-foreground">{mensaje}</p>
    </div>
  );
}
