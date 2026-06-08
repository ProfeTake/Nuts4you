import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShieldAlert, Store, ChevronDown, ChevronUp, Trash2,
  CheckSquare2, Square, ClipboardList, History,
  BadgeDollarSign, StickyNote, Eye, Plus, X, Settings2,
  Loader2,
} from "lucide-react";
import { Button }    from "@/components/ui/button";
import { Input }     from "@/components/ui/input";
import { Label }     from "@/components/ui/label";
import { Badge }     from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { formatearCLP } from "@/lib/money";
import type { CierrePreventivo, ChecklistItem } from "@/tipos/admin.tipos";
import { useAuthStore } from "@/store/auth.store";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PDVItem {
  id:     number;
  nombre: string;
  tipo:   string;
  activo: boolean;
}

interface TareaAPI {
  id:    number;
  label: string;
  orden: number;
}

// ─── Tarjeta de cierre en el historial ────────────────────────────────────────

function TarjetaCierre({
  cierre,
  puedeEliminar,
  onEliminar,
}: {
  cierre:        CierrePreventivo;
  puedeEliminar: boolean;
  onEliminar:    (id: number) => void;
}) {
  const [expandido, setExpandido]     = useState(false);
  const [dlgEliminar, setDlgEliminar] = useState(false);
  const marcados = cierre.checklist.filter((i) => i.marcado).length;
  const total    = cierre.checklist.length;

  const fecha = new Date(cierre.fecha);
  const fechaLabel = fecha.toLocaleDateString("es-CL", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpandido((v) => !v)}
      >
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
          <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm">{cierre.pdvNombre}</p>
            <Badge variant="outline" className="text-xs">
              {marcados}/{total} ítems
            </Badge>
            {cierre.montoRetiro > 0 && (
              <Badge className="text-xs bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400">
                Retiro {formatearCLP(cierre.montoRetiro)}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {cierre.usuarioNombre} · {fechaLabel}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {puedeEliminar && (
            <Button
              size="icon" variant="ghost"
              className="size-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => { e.stopPropagation(); setDlgEliminar(true); }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
          {expandido
            ? <ChevronUp className="size-4 text-muted-foreground" />
            : <ChevronDown className="size-4 text-muted-foreground" />
          }
        </div>
      </div>

      {expandido && (
        <div className="border-t px-4 py-4 space-y-4 bg-muted/20">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Actividades realizadas
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {cierre.checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  {item.marcado
                    ? <CheckSquare2 className="size-4 shrink-0 text-emerald-500" />
                    : <Square className="size-4 shrink-0 text-muted-foreground" />
                  }
                  <span className={`text-xs ${item.marcado ? "" : "text-muted-foreground line-through"}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {(cierre.notasVendedor || cierre.observaciones) && <Separator />}

          {cierre.notasVendedor && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Tareas dejadas al vendedor
              </p>
              <p className="text-sm whitespace-pre-wrap rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 px-3 py-2">
                {cierre.notasVendedor}
              </p>
            </div>
          )}

          {cierre.observaciones && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Observaciones internas
              </p>
              <p className="text-sm whitespace-pre-wrap rounded-lg bg-muted px-3 py-2">
                {cierre.observaciones}
              </p>
            </div>
          )}
        </div>
      )}

      <Dialog open={dlgEliminar} onOpenChange={setDlgEliminar}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="size-4" /> Eliminar registro
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Seguro que quieres eliminar el cierre preventivo de{" "}
            <span className="font-semibold text-foreground">{cierre.pdvNombre}</span>?
            Esta acción no se puede deshacer.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDlgEliminar(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => { onEliminar(cierre.id); setDlgEliminar(false); }}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Formulario de nuevo cierre ───────────────────────────────────────────────

function FormCierrePreventivo({
  pdvs,
  tareasBase,
  onGuardar,
  onCancelar,
  guardando,
}: {
  pdvs:       PDVItem[];
  tareasBase: TareaAPI[];
  onGuardar:  (data: {
    pdvId: number;
    montoRetiro: number;
    checklist: ChecklistItem[];
    notasVendedor: string;
    observaciones: string;
  }) => void;
  onCancelar: () => void;
  guardando:  boolean;
}) {
  const [pdvId,         setPdvId]         = useState<number | null>(null);
  const [montoRetiro,   setMontoRetiro]   = useState("");
  const [checklist,     setChecklist]     = useState<ChecklistItem[]>(() =>
    tareasBase.map((t) => ({ label: t.label, marcado: false }))
  );
  const [notasVendedor, setNotasVendedor] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [nuevaTarea,    setNuevaTarea]    = useState("");

  const toggleItem = (i: number) =>
    setChecklist((prev) => prev.map((it, idx) => idx === i ? { ...it, marcado: !it.marcado } : it));

  const eliminarItem = (i: number) =>
    setChecklist((prev) => prev.filter((_, idx) => idx !== i));

  const agregarTarea = () => {
    const label = nuevaTarea.trim();
    if (!label) return;
    setChecklist((prev) => [...prev, { label, marcado: false }]);
    setNuevaTarea("");
  };

  const marcadosCount = checklist.filter((i) => i.marcado).length;
  const valido = pdvId !== null;

  const handleSubmit = () => {
    if (!valido || !pdvId) return;
    onGuardar({
      pdvId,
      montoRetiro: parseInt(montoRetiro.replace(/\D/g, "")) || 0,
      checklist,
      notasVendedor,
      observaciones,
    });
  };

  return (
    <div className="space-y-6 py-1">
      {/* PDV + Monto retiro */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-end">
        <div className="space-y-1.5">
          <Label>Punto de venta visitado</Label>
          <Select
            value={pdvId?.toString() ?? ""}
            onValueChange={(v) => setPdvId(Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar sucursal">
                {pdvId != null
                  ? pdvs.find((p) => p.id === pdvId)?.nombre
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {pdvs.map((p) => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <BadgeDollarSign className="size-3.5 text-muted-foreground" />
            Monto de retiro
            <span className="text-muted-foreground text-xs font-normal">(opcional)</span>
          </Label>
          <Input
            placeholder="$0"
            value={montoRetiro}
            onChange={(e) => setMontoRetiro(e.target.value.replace(/\D/g, ""))}
          />
        </div>
      </div>

      <Separator />

      {/* Checklist */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">
            <ClipboardList className="size-3.5 text-muted-foreground" />
            Actividades realizadas
          </Label>
          <span className="text-xs text-muted-foreground">
            {marcadosCount}/{checklist.length} completadas
          </span>
        </div>

        {checklist.length > 0 ? (
          <div className="rounded-xl border bg-muted/20 divide-y">
            {checklist.map((item, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/40 transition-colors group">
                <button
                  type="button"
                  onClick={() => toggleItem(i)}
                  className="flex flex-1 items-center gap-3 text-left min-w-0"
                >
                  {item.marcado
                    ? <CheckSquare2 className="size-4 shrink-0 text-emerald-500" />
                    : <Square className="size-4 shrink-0 text-muted-foreground" />
                  }
                  <span className={`text-sm truncate ${item.marcado ? "font-medium" : "text-muted-foreground"}`}>
                    {item.label}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => eliminarItem(i)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  title="Eliminar tarea"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
            Sin tareas. Agrega una abajo o configura la plantilla en la pestaña Plantilla.
          </div>
        )}

        {/* Agregar tarea ad-hoc */}
        <div className="flex gap-2">
          <Input
            placeholder="Agregar tarea a este cierre..."
            value={nuevaTarea}
            onChange={(e) => setNuevaTarea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); agregarTarea(); }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={agregarTarea}
            disabled={!nuevaTarea.trim()}
            title="Agregar tarea"
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <Separator />

      {/* Notas vendedor */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <StickyNote className="size-3.5 text-muted-foreground" />
          Tareas para el vendedor
          <span className="text-muted-foreground text-xs font-normal">(opcional)</span>
        </Label>
        <textarea
          rows={3}
          placeholder="Escribe instrucciones o tareas que el vendedor debe realizar al reabrir..."
          value={notasVendedor}
          onChange={(e) => setNotasVendedor(e.target.value)}
          className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {/* Observaciones internas */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <Eye className="size-3.5 text-muted-foreground" />
          Observaciones internas
          <span className="text-muted-foreground text-xs font-normal">(opcional)</span>
        </Label>
        <textarea
          rows={2}
          placeholder="Notas internas para el equipo administrativo..."
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {/* Acciones */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!valido || guardando}
          className="gap-1.5"
        >
          {guardando
            ? <Loader2 className="size-4 animate-spin" />
            : <ShieldAlert className="size-4" />}
          {guardando ? "Registrando..." : "Registrar cierre preventivo"}
        </Button>
      </div>
    </div>
  );
}

// ─── Panel gestión de plantilla (solo ADMIN) ──────────────────────────────────

function GestorPlantilla({ tareas, cargando }: { tareas: TareaAPI[]; cargando: boolean }) {
  const queryClient = useQueryClient();
  const [nueva, setNueva] = useState("");

  const mutCrear = useMutation({
    mutationFn: (label: string) =>
      apiPost<{ data: TareaAPI }>("/cierres-preventivos/tareas", { label }),
    onSuccess: () => {
      toast.success("Tarea agregada a la plantilla");
      queryClient.invalidateQueries({ queryKey: ["checklist-tareas"] });
      setNueva("");
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al agregar tarea"),
  });

  const mutEliminar = useMutation({
    mutationFn: (id: number) =>
      apiDelete<{ data: { id: number } }>(`/cierres-preventivos/tareas/${id}`),
    onSuccess: () => {
      toast.success("Tarea eliminada");
      queryClient.invalidateQueries({ queryKey: ["checklist-tareas"] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al eliminar tarea"),
  });

  const agregar = () => {
    const label = nueva.trim();
    if (!label) return;
    mutCrear.mutate(label);
  };

  return (
    <div className="rounded-xl border bg-card p-6 space-y-5">
      <div>
        <p className="text-sm font-semibold">Plantilla de tareas</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Estas tareas aparecen por defecto (sin marcar) al registrar un nuevo cierre preventivo.
          Puedes agregar o eliminar según las necesidades operativas.
        </p>
      </div>

      {/* Agregar nueva tarea */}
      <div className="flex gap-2">
        <Input
          placeholder="Descripción de la nueva tarea..."
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); agregar(); }
          }}
        />
        <Button
          onClick={agregar}
          disabled={!nueva.trim() || mutCrear.isPending}
          className="gap-1.5 shrink-0"
        >
          {mutCrear.isPending
            ? <Loader2 className="size-4 animate-spin" />
            : <Plus className="size-4" />}
          Agregar tarea
        </Button>
      </div>

      {/* Lista de tareas */}
      {cargando ? (
        <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Cargando tareas...
        </div>
      ) : tareas.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No hay tareas configuradas. Agrega la primera tarea arriba.
        </div>
      ) : (
        <div className="rounded-xl border divide-y">
          {tareas.map((t, i) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3 group">
              <div className="flex size-6 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground shrink-0">
                {i + 1}
              </div>
              <span className="flex-1 text-sm">{t.label}</span>
              <Button
                size="icon" variant="ghost"
                className="size-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => mutEliminar.mutate(t.id)}
                disabled={mutEliminar.isPending}
                title="Eliminar tarea"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        {tareas.length} tarea{tareas.length !== 1 ? "s" : ""} en la plantilla
      </p>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function GestorCierrePreventivo() {
  const queryClient = useQueryClient();
  const { usuario } = useAuthStore();
  const esAdmin = usuario?.rol === "ADMIN";

  const [tab,         setTab]         = useState<"nuevo" | "historial" | "plantilla">("nuevo");
  const [filtroPdv,   setFiltroPdv]   = useState("TODOS");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: pdvs = [] } = useQuery({
    queryKey: ["pdvs-activos"],
    queryFn:  () =>
      apiGet<{ data: PDVItem[] }>("/admin/pdvs").then((r) =>
        r.data.filter((p) => p.tipo === "PUNTO_VENTA" && p.activo)
      ),
  });

  const { data: tareas = [], isLoading: cargandoTareas } = useQuery({
    queryKey: ["checklist-tareas"],
    queryFn:  () =>
      apiGet<{ data: TareaAPI[] }>("/cierres-preventivos/tareas").then((r) => r.data),
  });

  const queryParams = new URLSearchParams();
  if (filtroPdv !== "TODOS") queryParams.set("pdvId", filtroPdv);
  if (filtroDesde)            queryParams.set("desde", filtroDesde);
  if (filtroHasta)            queryParams.set("hasta", filtroHasta);

  const { data: cierres = [], isLoading: cargandoCierres } = useQuery({
    queryKey: ["cierres-preventivos", filtroPdv, filtroDesde, filtroHasta],
    queryFn:  () =>
      apiGet<{ data: CierrePreventivo[] }>(
        `/cierres-preventivos?${queryParams.toString()}`
      ).then((r) => r.data),
    enabled: tab === "historial",
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const mutRegistrar = useMutation({
    mutationFn: (body: object) =>
      apiPost<{ data: CierrePreventivo }>("/cierres-preventivos", body),
    onSuccess: () => {
      toast.success("Cierre preventivo registrado correctamente");
      queryClient.invalidateQueries({ queryKey: ["cierres-preventivos"] });
      setTab("historial");
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al registrar"),
  });

  const mutEliminar = useMutation({
    mutationFn: (id: number) =>
      apiDelete<{ data: { id: number } }>(`/cierres-preventivos/${id}`),
    onSuccess: () => {
      toast.success("Registro eliminado");
      queryClient.invalidateQueries({ queryKey: ["cierres-preventivos"] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al eliminar"),
  });

  const handleGuardar = (data: {
    pdvId: number;
    montoRetiro: number;
    checklist: ChecklistItem[];
    notasVendedor: string;
    observaciones: string;
  }) => {
    mutRegistrar.mutate({
      pdvId:         data.pdvId,
      montoRetiro:   data.montoRetiro,
      checklist:     data.checklist,
      notasVendedor: data.notasVendedor || undefined,
      observaciones: data.observaciones || undefined,
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldAlert className="size-6 text-amber-500" />
          Cierre Preventivo
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Registro de visitas a sucursales con cierre, retiro e inventario
        </p>
      </div>

      <Separator />

      {/* Banner informativo */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 space-y-1">
        <p className="font-semibold">¿Qué es un cierre preventivo?</p>
        <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
          Es un cierre temporal del PDV realizado por un administrador o supervisor para realizar retiros
          de efectivo, revisar inventario y dejar instrucciones al vendedor.
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="mb-4">
          <TabsTrigger value="nuevo" className="gap-2">
            <ShieldAlert className="size-4" />
            Registrar cierre
          </TabsTrigger>
          <TabsTrigger value="historial" className="gap-2">
            <History className="size-4" />
            Historial
          </TabsTrigger>
          {esAdmin && (
            <TabsTrigger value="plantilla" className="gap-2">
              <Settings2 className="size-4" />
              Plantilla
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Tab: Nuevo cierre ── */}
        <TabsContent value="nuevo">
          <div className="rounded-xl border bg-card p-6">
            <FormCierrePreventivo
              key={tareas.map((t) => t.id).join(",")}
              pdvs={pdvs}
              tareasBase={tareas}
              onGuardar={handleGuardar}
              onCancelar={() => setTab("historial")}
              guardando={mutRegistrar.isPending}
            />
          </div>
        </TabsContent>

        {/* ── Tab: Historial ── */}
        <TabsContent value="historial">
          <div className="flex flex-wrap gap-3 mb-4">
            <Select value={filtroPdv} onValueChange={(v) => setFiltroPdv(v ?? "TODOS")}>
              <SelectTrigger className="w-48">
                <Store className="size-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Todas las sucursales" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todas las sucursales</SelectItem>
                {pdvs.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>{p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground shrink-0">Desde</Label>
              <Input
                type="date"
                className="h-9 w-36"
                value={filtroDesde}
                onChange={(e) => setFiltroDesde(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground shrink-0">Hasta</Label>
              <Input
                type="date"
                className="h-9 w-36"
                value={filtroHasta}
                onChange={(e) => setFiltroHasta(e.target.value)}
              />
            </div>
            {(filtroPdv !== "TODOS" || filtroDesde || filtroHasta) && (
              <Button
                variant="ghost" size="sm"
                onClick={() => { setFiltroPdv("TODOS"); setFiltroDesde(""); setFiltroHasta(""); }}
              >
                Limpiar filtros
              </Button>
            )}
          </div>

          {cargandoCierres && (
            <div className="flex items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Cargando historial...
            </div>
          )}

          {!cargandoCierres && cierres.length === 0 && (
            <div className="text-center py-12 space-y-2">
              <ShieldAlert className="size-10 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">No hay cierres preventivos registrados</p>
            </div>
          )}

          {!cargandoCierres && cierres.length > 0 && (
            <div className="space-y-3">
              {cierres.map((c) => (
                <TarjetaCierre
                  key={c.id}
                  cierre={c}
                  puedeEliminar={esAdmin}
                  onEliminar={(id) => mutEliminar.mutate(id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Plantilla (solo ADMIN) ── */}
        {esAdmin && (
          <TabsContent value="plantilla">
            <GestorPlantilla tareas={tareas} cargando={cargandoTareas} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
