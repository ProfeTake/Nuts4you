// ─── PreparacionSiguienteTurno ────────────────────────────────────────────────
// Admin/Supervisor prepara los INGRESOS que recibirá una sucursal para un turno
// futuro (por fecha). Preparar DESCUENTA de la bodega central (reserva el stock).
// Al abrir el turno, la vendedora verifica y el ingreso se suma a su stock
// (stock = saldo + ingreso), pasando la preparación a CONFIRMADA.
//
// Conectado a:
//   GET   /api/admin/pdvs                       → sucursales destino
//   GET   /api/bodega/stock                     → disponible en bodega (a reservar)
//   GET   /api/inventario/:pdvId                → saldo actual del PDV (INICIO)
//   GET   /api/preparaciones/pdv/:pdvId?fecha=  → preparación existente (prefill)
//   GET   /api/preparaciones?fecha=             → todas las sucursales de esa fecha
//   POST  /api/preparaciones                    → crear / actualizar
//   PATCH /api/preparaciones/:id/anular         → anular y devolver stock a bodega

import { useState, useMemo, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2, PackagePlus, CalendarDays, Store, AlertTriangle,
  CheckCircle2, Lock, Ban, ChevronDown, ChevronUp, History, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { compararProductos } from "@/lib/categorias";
import type { PDVItem } from "@/tipos/admin.tipos";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ItemStock {
  productoId:  number;
  nombre:      string;
  categoria:   string;
  stockActual: number;
}

interface PreparacionItem {
  productoId: number;
  nombre:     string;
  categoria:  string;
  cantidad:   number;
}

interface Preparacion {
  id:            number;
  pdvId:         number;
  pdvNombre:     string;
  fecha:         string;
  estado:        "PENDIENTE" | "CONFIRMADA" | "ANULADA";
  notas:         string | null;
  creadoPor:     string | null;
  confirmadoEn:  string | null;
  totalUnidades: number;
  items:         PreparacionItem[];
}

// ─── Utilidades de fecha (local = Chile en operación) ─────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function fechaMananaISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toISODate(d);
}
function formatearFechaLarga(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-CL", {
    weekday: "long", day: "numeric", month: "long",
  });
}

// ─── Historial ────────────────────────────────────────────────────────────────

const ESTADO_HIST: Record<Preparacion["estado"], { label: string; clases: string; icono: ReactNode }> = {
  PENDIENTE:  { label: "Pendiente", clases: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",         icono: <Clock className="size-3" /> },
  CONFIRMADA: { label: "Recibida",  clases: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400", icono: <CheckCircle2 className="size-3" /> },
  ANULADA:    { label: "Anulada",   clases: "bg-muted text-muted-foreground",                                               icono: <Ban className="size-3" /> },
};

function CardHistorialPrep({ prep, vencida, onAnular, anulando }: {
  prep: Preparacion;
  vencida: boolean;
  onAnular: (id: number) => void;
  anulando: boolean;
}) {
  const [open, setOpen] = useState(false);
  const cfg = ESTADO_HIST[prep.estado];
  const items = [...prep.items].sort(compararProductos);
  return (
    <div className={`rounded-xl border overflow-hidden ${
      vencida ? "border-red-300 dark:border-red-800" : prep.estado === "ANULADA" ? "opacity-70" : ""
    }`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
        <div className="flex items-center gap-3 min-w-0">
          {vencida ? (
            <Badge variant="secondary" className="shrink-0 gap-1 text-[10px] bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
              <AlertTriangle className="size-3" /> Vencida
            </Badge>
          ) : (
            <Badge variant="secondary" className={`shrink-0 gap-1 text-[10px] ${cfg.clases}`}>{cfg.icono} {cfg.label}</Badge>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{prep.pdvNombre}</p>
            <p className="text-xs text-muted-foreground truncate capitalize">
              {formatearFechaLarga(prep.fecha)}{prep.creadoPor ? ` · ${prep.creadoPor}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground tabular-nums">{prep.totalUnidades} u · {prep.items.length} prod.</span>
          {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="border-t px-4 py-3 space-y-2">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin productos.</p>
          ) : (
            <div className="space-y-1">
              {items.map((it) => (
                <div key={it.productoId} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {it.nombre} <span className="text-xs text-muted-foreground">{it.categoria}</span>
                  </span>
                  <span className="tabular-nums font-semibold">{it.cantidad} u</span>
                </div>
              ))}
            </div>
          )}
          {prep.notas && (
            <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-semibold">Nota:</span> {prep.notas}
            </p>
          )}
          {vencida && (
            <p className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              No se abrió turno ese día y este pedido <strong>sigue reservando stock fuera de bodega</strong>.
              Anúlalo para devolverlo.
            </p>
          )}
          {prep.estado === "CONFIRMADA" && prep.confirmadoEn && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Recibida por la vendedora el{" "}
              {new Date(prep.confirmadoEn).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          {prep.estado === "PENDIENTE" && (
            <button
              onClick={() => onAnular(prep.id)}
              disabled={anulando}
              className="w-full h-9 rounded-lg border border-red-300 dark:border-red-800 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {anulando ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
              Anular y devolver a bodega
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function PreparacionSiguienteTurno() {
  const queryClient = useQueryClient();
  const [pdvId, setPdvId] = useState<string>("");
  const [fecha, setFecha] = useState<string>(fechaMananaISO);
  // Lo que el admin escribió, junto con A QUÉ preparación pertenece (PDV + fecha).
  // Ver más abajo: se deriva en el render en vez de sincronizarse con un efecto.
  const [edicion, setEdicion] = useState<{
    clave: string; notas: string; cantidades: Record<number, string>;
  } | null>(null);
  // Pestaña activa + filtro del historial por estado.
  const [tab, setTab] = useState<"preparar" | "historial">("preparar");
  const [filtroHist, setFiltroHist] = useState<"TODAS" | "VENCIDAS" | "PENDIENTE" | "CONFIRMADA" | "ANULADA">("TODAS");

  // ── Carga de datos ──────────────────────────────────────────────────────────

  const { data: pdvs = [], isLoading: cargandoPdvs } = useQuery({
    queryKey: ["admin", "pdvs"],
    queryFn:  () =>
      apiGet<{ data: (PDVItem & { activo?: boolean })[] }>("/admin/pdvs")
        .then((r) => r.data.filter((p) => p.tipo === "PUNTO_VENTA")),
  });

  const { data: bodega = [], isLoading: cargandoBodega } = useQuery({
    queryKey: ["bodega", "stock", "preparacion"],
    queryFn:  () =>
      apiGet<{ data: ItemStock[] }>("/bodega/stock").then((r) =>
        r.data.map((s) => ({
          productoId:  s.productoId,
          nombre:      s.nombre ?? "—",
          categoria:   s.categoria ?? "Otros",
          stockActual: Number(s.stockActual) || 0,
        })),
      ),
  });

  // Saldo actual del PDV (INICIO del próximo turno) — mapa productoId → stock.
  const { data: saldoPdv = {} } = useQuery({
    queryKey: ["inventario", "pdv", pdvId],
    enabled:  !!pdvId,
    queryFn:  () =>
      apiGet<{ data: { productoId: number; stockActual: number }[] }>(`/inventario/${pdvId}`)
        .then((r) => Object.fromEntries(r.data.map((i) => [i.productoId, i.stockActual])) as Record<number, number>),
  });

  // Preparación existente para (pdv, fecha).
  const { data: prepExistente, isLoading: cargandoPrep } = useQuery({
    queryKey: ["preparacion", "pdv", pdvId, fecha],
    enabled:  !!pdvId && !!fecha,
    queryFn:  () =>
      apiGet<{ data: Preparacion | null }>(`/preparaciones/pdv/${pdvId}?fecha=${fecha}`).then((r) => r.data),
  });

  // Todas las preparaciones de la fecha (resumen por sucursal).
  const { data: prepsFecha = [] } = useQuery({
    queryKey: ["preparacion", "fecha", fecha],
    enabled:  !!fecha,
    queryFn:  () =>
      apiGet<{ data: Preparacion[] }>(`/preparaciones?fecha=${fecha}`).then((r) => r.data),
  });

  // Historial completo (todas las fechas/sucursales), para revisar lo preparado.
  const { data: historial = [] } = useQuery({
    queryKey: ["preparacion", "historial"],
    queryFn:  () => apiGet<{ data: Preparacion[] }>("/preparaciones").then((r) => r.data),
  });

  // ── Prefill de ingresos según la preparación cargada ──────────────────────────
  // Se deriva en el render: la edición vale solo para el PDV+fecha en que se
  // escribió, así que al cambiar de sucursal o de día el formulario vuelve solo a
  // los datos del servidor. Antes esto era un useEffect con setState, que además
  // de renderizar dos veces borraba lo escrito cada vez que la query refrescaba.
  const claveEdicion = `${pdvId}|${fecha}`;

  const prefill = useMemo(() => {
    if (pdvId && prepExistente && prepExistente.estado !== "ANULADA") {
      return {
        cantidades: Object.fromEntries(
          prepExistente.items.map((i) => [i.productoId, String(i.cantidad)]),
        ) as Record<number, string>,
        notas: prepExistente.notas ?? "",
      };
    }
    return { cantidades: {} as Record<number, string>, notas: "" };
  }, [prepExistente, pdvId]);

  const enEdicion  = edicion?.clave === claveEdicion ? edicion : null;
  const cantidades = enEdicion?.cantidades ?? prefill.cantidades;
  const notas      = enEdicion?.notas      ?? prefill.notas;

  const setCantidades = (
    actualizar: Record<number, string> | ((prev: Record<number, string>) => Record<number, string>),
  ) => setEdicion({
    clave: claveEdicion,
    notas,
    cantidades: typeof actualizar === "function" ? actualizar(cantidades) : actualizar,
  });

  const setNotas = (valor: string) => setEdicion({ clave: claveEdicion, cantidades, notas: valor });

  // Lo ya reservado en bodega por ESTA preparación (solo si sigue PENDIENTE):
  // eleva el máximo permitido, porque ese stock ya salió de bodega para este PDV.
  const reservadoPrev = useMemo(() => {
    const m: Record<number, number> = {};
    if (prepExistente?.estado === "PENDIENTE") {
      for (const it of prepExistente.items) m[it.productoId] = it.cantidad;
    }
    return m;
  }, [prepExistente]);

  const confirmada = prepExistente?.estado === "CONFIRMADA";

  // ── Mutaciones ────────────────────────────────────────────────────────────────

  const guardar = useMutation({
    mutationFn: (payload: { pdvId: number; fecha: string; notas?: string; items: { productoId: number; cantidad: number }[] }) =>
      apiPost<{ data: { mensaje: string; pdv: string } }>("/preparaciones", payload),
    onSuccess: (res) => {
      toast.success("Preparación guardada", { description: `${res.data.pdv} · ${formatearFechaLarga(fecha)}` });
      invalidarTodo();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Error al guardar la preparación"),
  });

  const anular = useMutation({
    mutationFn: (id: number) => apiPatch<{ data: unknown }>(`/preparaciones/${id}/anular`, {}),
    onSuccess: () => {
      toast.success("Preparación anulada", { description: "El stock reservado volvió a la bodega" });
      invalidarTodo();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Error al anular"),
  });

  function invalidarTodo() {
    // El formulario vuelve a seguir los datos del servidor tras guardar/anular.
    setEdicion(null);
    queryClient.invalidateQueries({ queryKey: ["preparacion"] });
    queryClient.invalidateQueries({ queryKey: ["bodega", "stock"] });
    queryClient.invalidateQueries({ queryKey: ["inventario", "pdv"] });
  }

  // ── Derivados ─────────────────────────────────────────────────────────────────

  const setCantidad = (productoId: number, valor: string) =>
    setCantidades((prev) => ({ ...prev, [productoId]: valor.replace(/\D/g, "") }));

  const filas = useMemo(
    () =>
      bodega
        .map((b) => {
          const ingreso  = parseInt(cantidades[b.productoId] ?? "", 10) || 0;
          const saldo    = saldoPdv[b.productoId] ?? 0;
          // Máximo que se puede fijar como ingreso para esta prep = disponible en
          // bodega + lo ya reservado por esta misma preparación.
          const maxIngreso = b.stockActual + (reservadoPrev[b.productoId] ?? 0);
          return { ...b, ingreso, saldo, maxIngreso, excede: ingreso > maxIngreso };
        })
        // Mismo orden que el Turno Activo: Mezclas → Paquetes → Promos → Líquidos
        // → Helados → Conos, y por productoId dentro de cada categoría.
        .sort(compararProductos),
    [bodega, cantidades, saldoPdv, reservadoPrev],
  );

  const itemsConIngreso = filas.filter((f) => f.ingreso > 0);
  const erroresStock    = filas.filter((f) => f.excede);
  const totalUnidades   = itemsConIngreso.reduce((s, f) => s + f.ingreso, 0);
  // Categorías en el orden del Turno Activo (derivadas de las filas ya ordenadas).
  const categorias      = [...new Set(filas.map((f) => f.categoria))];

  const puedeGuardar =
    !!pdvId && !confirmada && erroresStock.length === 0 && !guardar.isPending && !cargandoPrep;

  const handleGuardar = () => {
    if (!puedeGuardar) return;
    guardar.mutate({
      pdvId: parseInt(pdvId, 10),
      fecha,
      notas: notas.trim() || undefined,
      items: itemsConIngreso.map((f) => ({ productoId: f.productoId, cantidad: f.ingreso })),
    });
  };

  const cargando = cargandoPdvs || cargandoBodega;
  const pdvNombre = pdvs.find((p) => String(p.id) === pdvId)?.nombre;

  // "Vencida" = preparación PENDIENTE cuya fecha ya pasó: no se abrió turno ese día
  // y jamás se auto-confirmará (la apertura solo confirma la preparación de HOY), así
  // que reserva stock fuera de bodega indefinidamente hasta que se anule (H6/A17).
  const hoyISO = toISODate(new Date());
  const esVencida = (p: Preparacion) => p.estado === "PENDIENTE" && p.fecha < hoyISO;
  const vencidas = useMemo(
    () => historial.filter((p) => p.estado === "PENDIENTE" && p.fecha < hoyISO),
    [historial, hoyISO],
  );

  const historialFiltrado = useMemo(
    () =>
      filtroHist === "TODAS"    ? historial
      : filtroHist === "VENCIDAS" ? historial.filter((p) => p.estado === "PENDIENTE" && p.fecha < hoyISO)
      : historial.filter((p) => p.estado === filtroHist),
    [historial, filtroHist, hoyISO],
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Preparación del siguiente turno</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define los ingresos que recibirá cada sucursal. Se reservan desde la bodega y la
            vendedora los verifica al abrir el turno.
          </p>
        </div>
        <PackagePlus className="size-5 text-muted-foreground mt-0.5 shrink-0" />
      </div>

      {/* Aviso de vencidas — visible siempre, arriba de las pestañas */}
      {vencidas.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 dark:border-red-900/60 dark:bg-red-950/20">
          <p className="flex items-start gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            {vencidas.length} preparación{vencidas.length === 1 ? "" : "es"} vencida{vencidas.length === 1 ? "" : "s"} reservando stock sin usar
          </p>
          <p className="mt-1 pl-6 text-xs text-red-700/90 dark:text-red-400/90">
            No se abrió turno en su fecha y el stock quedó reservado fuera de bodega. Anúlalas para devolverlo:{" "}
            <span className="capitalize">{vencidas.map((v) => `${v.pdvNombre} (${formatearFechaLarga(v.fecha)})`).join(", ")}</span>.
          </p>
          <button
            onClick={() => { setTab("historial"); setFiltroHist("VENCIDAS"); }}
            className="mt-2 ml-6 h-8 rounded-lg border border-red-300 px-3 text-xs font-bold text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Ver y anular
          </button>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as "preparar" | "historial")} className="w-full">
        <TabsList>
          <TabsTrigger value="preparar" className="gap-1.5">
            <PackagePlus className="size-4" /> Preparar
          </TabsTrigger>
          <TabsTrigger value="historial" className="gap-1.5">
            <History className="size-4" /> Historial
            {historial.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">{historial.length}</Badge>
            )}
            {vencidas.length > 0 && (
              <span className="size-2 rounded-full bg-red-500" title="Hay preparaciones vencidas" />
            )}
          </TabsTrigger>
        </TabsList>

        {/* ══════════ Pestaña: Preparar ══════════ */}
        <TabsContent value="preparar" className="mt-5 space-y-6">
      {/* Selectores fecha + sucursal */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <CalendarDays className="size-4 text-muted-foreground" /> Fecha del turno
          </label>
          <Input
            type="date"
            value={fecha}
            min={toISODate(new Date())}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full"
          />
          {fecha && (
            <p className="text-xs text-muted-foreground capitalize">{formatearFechaLarga(fecha)}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Store className="size-4 text-muted-foreground" /> Sucursal
          </label>
          <Select value={pdvId} onValueChange={(v) => setPdvId(v ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Seleccionar sucursal…">{pdvNombre}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {pdvs.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Resumen de sucursales para la fecha */}
      {prepsFecha.length > 0 && (
        <div className="rounded-xl border bg-muted/30 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Preparaciones para {formatearFechaLarga(fecha)}
          </p>
          <div className="flex flex-wrap gap-2">
            {prepsFecha.map((p) => (
              <button
                key={p.id}
                onClick={() => setPdvId(String(p.pdvId))}
                className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                <span className="font-medium">{p.pdvNombre}</span>
                <Badge
                  variant="secondary"
                  className={`tabular-nums text-[10px] ${
                    p.estado === "CONFIRMADA"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : p.estado === "ANULADA"
                      ? "bg-muted text-muted-foreground line-through"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                  }`}
                >
                  {p.estado === "CONFIRMADA" ? "recibida" : p.estado === "ANULADA" ? "anulada" : `${p.totalUnidades} u`}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando bodega…
        </div>
      ) : !pdvId ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          Selecciona una sucursal para preparar su ingreso.
        </div>
      ) : (
        <>
          {/* Banner de estado */}
          {confirmada && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-400">
              <Lock className="size-4 shrink-0" />
              Esta preparación ya fue confirmada por la vendedora al abrir el turno. No se puede modificar.
            </div>
          )}

          {/* Tabla de productos */}
          <div className="space-y-4">
            {categorias.map((cat) => {
              const grupo = filas.filter((f) => f.categoria === cat);
              if (grupo.length === 0) return null;
              return (
                <div key={cat} className="rounded-xl border overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto] items-center bg-muted px-4 py-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{cat}</span>
                    <div className="hidden sm:grid grid-cols-3 gap-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center w-[15rem]">
                      <span>Saldo</span><span>Bodega</span><span>Ingreso</span>
                    </div>
                  </div>
                  <div className="divide-y">
                    {grupo.map((f) => (
                      <div key={f.productoId} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{f.nombre}</p>
                          <p className="text-xs text-muted-foreground">
                            Total al abrir:{" "}
                            <span className="font-semibold tabular-nums text-foreground">{f.saldo + f.ingreso}</span>
                            {f.excede && (
                              <span className="ml-2 text-red-600 font-medium">⚠ Máx {f.maxIngreso}</span>
                            )}
                          </p>
                        </div>
                        <div className="grid grid-cols-3 gap-3 items-center w-[15rem] text-center">
                          <span className="text-sm tabular-nums text-muted-foreground">{f.saldo}</span>
                          <span className={`text-sm tabular-nums ${f.stockActual <= 0 ? "text-red-500" : "text-muted-foreground"}`}>
                            {f.stockActual}
                          </span>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={cantidades[f.productoId] ?? ""}
                            disabled={confirmada}
                            onChange={(e) => setCantidad(f.productoId, e.target.value)}
                            className={`h-9 text-center font-semibold tabular-nums ${
                              f.excede ? "border-destructive focus-visible:ring-destructive" : ""
                            }`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Notas */}
          {!confirmada && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Notas (opcional)</label>
              <Input
                type="text"
                placeholder="Ej: reponer antes de las 9:00"
                value={notas}
                maxLength={500}
                onChange={(e) => setNotas(e.target.value)}
              />
            </div>
          )}

          {/* Resumen + acciones */}
          {itemsConIngreso.length > 0 && (
            <div className="rounded-xl border bg-muted/40 px-4 py-3 space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Ingreso a reservar — {totalUnidades} unidades
              </p>
              {itemsConIngreso.map((f) => (
                <div key={f.productoId} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{f.nombre}</span>
                  <Badge variant="secondary" className="tabular-nums font-semibold">{f.ingreso} u</Badge>
                </div>
              ))}
              {erroresStock.length > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-red-600 pt-1">
                  <AlertTriangle className="size-3.5" /> Hay ingresos que superan el stock disponible en bodega.
                </p>
              )}
            </div>
          )}

          {!confirmada && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button size="lg" className="flex-1 gap-2" disabled={!puedeGuardar} onClick={handleGuardar}>
                {guardar.isPending ? (
                  <><Loader2 className="size-4 animate-spin" /> Guardando…</>
                ) : (
                  <><CheckCircle2 className="size-4" /> Guardar preparación</>
                )}
              </Button>
              {prepExistente && prepExistente.estado === "PENDIENTE" && (
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2 text-destructive hover:text-destructive"
                  disabled={anular.isPending}
                  onClick={() => anular.mutate(prepExistente.id)}
                >
                  {anular.isPending ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
                  Anular
                </Button>
              )}
            </div>
          )}
        </>
      )}

        </TabsContent>

        {/* ══════════ Pestaña: Historial ══════════ */}
        <TabsContent value="historial" className="mt-5 space-y-3">
            {/* Filtro por estado */}
            <div className="flex flex-wrap gap-2">
              {([
                ["TODAS", "Todas"],
                ["VENCIDAS", "Vencidas"],
                ["PENDIENTE", "Pendientes"],
                ["CONFIRMADA", "Recibidas"],
                ["ANULADA", "Anuladas"],
              ] as const).map(([val, label]) => {
                const count =
                  val === "TODAS"    ? historial.length
                  : val === "VENCIDAS" ? vencidas.length
                  : historial.filter((p) => p.estado === val).length;
                const activo = filtroHist === val;
                const alerta = val === "VENCIDAS" && count > 0;
                return (
                  <button
                    key={val}
                    onClick={() => setFiltroHist(val)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      activo
                        ? alerta ? "bg-red-600 text-white" : "bg-primary text-primary-foreground"
                        : alerta
                        ? "border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                        : "border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {label}
                    {val !== "TODAS" && ` (${count})`}
                  </button>
                );
              })}
            </div>

            {historialFiltrado.length === 0 ? (
              <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
                {historial.length === 0 ? "Todavía no hay preparaciones registradas." : "Sin preparaciones con ese estado."}
              </p>
            ) : (
              <div className="space-y-2">
                {historialFiltrado.map((p) => (
                  <CardHistorialPrep
                    key={p.id}
                    prep={p}
                    vencida={esVencida(p)}
                    onAnular={(id) => anular.mutate(id)}
                    anulando={anular.isPending}
                  />
                ))}
              </div>
            )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
