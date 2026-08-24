// ─── SolicitudesBodega ────────────────────────────────────────────────────────
// Tab "Solicitudes" del módulo Bodega: la bandeja de pedidos de las sucursales.
// Vive aquí (y ya no en Sucursales) porque despachar es una operación de bodega:
// mueve stock real (A15) y necesita el stock disponible al lado.
//
// Conectado a:
//   GET   /api/solicitudes                 → pedidos de todas las sucursales
//   PATCH /api/solicitudes/:id/despachar   → mueve stock bodega → PDV (modal)
//   PATCH /api/solicitudes/:id/rechazar    → cierra el pedido con motivo

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2, Truck, Ban, PackagePlus, ChevronDown, ChevronUp, Clock,
  CheckCircle2, Inbox, AlertTriangle,
} from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";
import { compararProductos } from "@/lib/categorias";
import { ModalDespacharSolicitud } from "@/componentes/solicitudes/ModalDespacharSolicitud";
import type { Solicitud, EstadoSolicitud } from "@/tipos/pos.tipos";

// ─── Chip de estado ──────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<EstadoSolicitud, { label: string; clases: string; icono: React.ReactNode }> = {
  PENDIENTE:  { label: "Pendiente",  clases: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",             icono: <Clock size={12} /> },
  DESPACHADA: { label: "Despachada", clases: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",                 icono: <Truck size={12} /> },
  CONFIRMADA: { label: "Confirmada", clases: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",     icono: <CheckCircle2 size={12} /> },
  RECHAZADA:  { label: "Rechazada",  clases: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",                     icono: <Ban size={12} /> },
};

function ChipEstado({ estado }: { estado: EstadoSolicitud }) {
  const cfg = ESTADO_CONFIG[estado];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.clases}`}>
      {cfg.icono} {cfg.label}
    </span>
  );
}

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });

// ─── Detalle: pedido vs despachado ───────────────────────────────────────────
// Con despacho parcial lo pedido y lo enviado difieren; el bodeguero necesita
// ver ambas cifras para saber qué quedó pendiente en la sucursal.

function DetalleSolicitud({ sol }: { sol: Solicitud }) {
  const enviadoPorProducto = new Map<number, number>();
  for (const d of sol.despachos ?? []) {
    for (const it of d.items) {
      enviadoPorProducto.set(it.productoId, (enviadoPorProducto.get(it.productoId) ?? 0) + it.cantidad);
    }
  }
  const huboDespacho = (sol.despachos ?? []).length > 0;
  // Mismo orden que el Turno Activo, igual que el formulario de despacho.
  const items = [...sol.items].sort(compararProductos);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border divide-y overflow-hidden">
        <div className="flex items-center gap-3 bg-muted px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <span className="flex-1">Producto</span>
          <span className="w-14 text-right">Pidió</span>
          {huboDespacho && <span className="w-16 text-right">Envié</span>}
        </div>
        {items.map((it) => {
          const enviado = enviadoPorProducto.get(it.productoId) ?? 0;
          const falto   = huboDespacho && enviado < it.cantidad;
          return (
            <div key={it.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="flex-1 min-w-0 truncate">
                {it.producto}
                <span className="ml-2 text-xs text-muted-foreground">{it.categoria}</span>
              </span>
              <span className="w-14 text-right font-semibold tabular-nums">{it.cantidad}</span>
              {huboDespacho && (
                <span className={`w-16 text-right font-bold tabular-nums ${falto ? "text-amber-600" : "text-emerald-600"}`}>
                  {enviado}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {sol.notas && (
        <p className="rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-semibold">Nota del PDV:</span> {sol.notas}
        </p>
      )}

      {sol.estado === "RECHAZADA" && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          <span className="font-semibold">Rechazada</span>
          {sol.motivoRechazo ? `: ${sol.motivoRechazo}` : " (sin motivo indicado)"}
        </p>
      )}

      {(sol.despachos ?? []).map((d) => (
        <p key={d.loteId} className="rounded-xl border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Despacho</span> · {d.totalUnidades} unid.
          {d.enviadoPor ? ` · envió ${d.enviadoPor}` : ""} · {fmtFecha(d.fecha)}
          {d.estado === "CONFIRMADO"
            ? " · recepción confirmada"
            : " · esperando confirmación del PDV"}
        </p>
      ))}
    </div>
  );
}

// ─── Card de solicitud ───────────────────────────────────────────────────────

/**
 * Entrega fantasma: la solicitud figura entregada pero no tiene despacho enlazado,
 * o sea que el stock nunca salió de bodega ni llegó al PDV (pedidos cerrados con
 * el flujo anterior a A15). Hay que poder verlo y arreglarlo, si no la sucursal
 * opera creyendo que recibió insumos que no tiene.
 */
const sinMovimientoDeStock = (sol: Solicitud) =>
  (sol.estado === "DESPACHADA" || sol.estado === "CONFIRMADA") && (sol.despachos ?? []).length === 0;

function CardSolicitud({
  sol, abiertaPorDefecto, onDespachar, onRegularizar, onRechazar, rechazando,
}: {
  sol: Solicitud;
  abiertaPorDefecto: boolean;
  onDespachar: (sol: Solicitud) => void;
  onRegularizar: (sol: Solicitud) => void;
  onRechazar: (id: number, motivo?: string) => void;
  rechazando: boolean;
}) {
  const [expandida, setExpandida] = useState(abiertaPorDefecto);
  const [modoRechazo, setModoRechazo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const totalUnidades = sol.items.reduce((s, it) => s + it.cantidad, 0);

  const confirmarRechazo = () => {
    onRechazar(sol.id, motivo.trim() || undefined);
    setModoRechazo(false);
    setMotivo("");
  };

  const fantasma = sinMovimientoDeStock(sol);

  return (
    <div className={`rounded-2xl border bg-background overflow-hidden ${
      fantasma ? "border-l-4 border-l-red-500"
      : sol.estado === "PENDIENTE" ? "border-l-4 border-l-amber-400" : ""
    }`}>
      <button onClick={() => setExpandida((p) => !p)} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
        <div className="flex items-center gap-3 min-w-0">
          <ChipEstado estado={sol.estado} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{sol.pdvNombre}</p>
            <p className="text-xs text-muted-foreground truncate">
              #{sol.id} · {sol.solicitante} · {fmtFecha(sol.fecha)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground font-medium tabular-nums">
            {sol.items.length} prod. · {totalUnidades} unid.
          </span>
          {expandida ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
        </div>
      </button>

      {expandida && (
        <div className="border-t px-4 py-3 space-y-3">
          <DetalleSolicitud sol={sol} />

          {fantasma && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2 dark:border-red-900/50 dark:bg-red-950/20">
              <p className="flex items-start gap-1.5 text-xs text-red-700 dark:text-red-400">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  Esta entrega <strong>no descontó bodega ni sumó stock al PDV</strong>. La sucursal
                  quedó operando sin estos insumos en su inventario.
                </span>
              </p>
              <button
                onClick={() => onRegularizar(sol)}
                className="w-full h-9 rounded-lg bg-red-600 text-xs font-bold text-white hover:bg-red-700 transition-colors flex items-center justify-center gap-1.5"
              >
                <Truck size={14} /> Regularizar stock
              </button>
            </div>
          )}

          {sol.estado === "PENDIENTE" && !modoRechazo && (
            <p className="rounded-lg bg-blue-50/60 dark:bg-blue-950/20 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
              Al <span className="font-semibold">despachar</span> puedes <span className="font-semibold">ajustar cuánto envías</span> de cada producto (viene prellenado con lo pedido) y dejar una <span className="font-semibold">nota</span> para la sucursal.
            </p>
          )}

          {sol.estado === "PENDIENTE" && !modoRechazo && (
            <div className="flex gap-2">
              <button
                onClick={() => onDespachar(sol)}
                disabled={rechazando}
                className="flex-1 h-10 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Truck size={16} /> Despachar / ajustar
              </button>
              <button
                onClick={() => setModoRechazo(true)}
                disabled={rechazando}
                className="flex-1 h-10 rounded-xl border border-red-300 dark:border-red-800 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Ban size={16} /> Rechazar
              </button>
            </div>
          )}

          {sol.estado === "PENDIENTE" && modoRechazo && (
            <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-3 space-y-2">
              <label className="text-xs font-semibold text-red-700 dark:text-red-400">
                Motivo del rechazo (opcional)
              </label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: no hay stock disponible, pedido duplicado…"
                rows={2}
                maxLength={200}
                autoFocus
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-red-300 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setModoRechazo(false); setMotivo(""); }}
                  className="flex-1 h-9 rounded-lg border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarRechazo}
                  disabled={rechazando}
                  className="flex-1 h-9 rounded-lg bg-red-600 text-xs font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Ban size={14} /> Confirmar rechazo
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export function SolicitudesBodega() {
  const qc = useQueryClient();
  // Una misma solicitud se abre en el modal para despachar o para regularizar
  // (mismo formulario, endpoints distintos).
  const [enModal, setEnModal] = useState<{ sol: Solicitud; modo: "despachar" | "regularizar" } | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);

  const { data: solicitudes = [], isLoading } = useQuery({
    queryKey: ["solicitudes", "bodega"],
    queryFn:  () => apiGet<{ data: Solicitud[] }>("/solicitudes").then((r) => r.data),
    refetchInterval: 30_000,
  });

  const mutRechazar = useMutation({
    mutationFn: (vars: { id: number; motivo?: string }) =>
      apiPatch<{ data: Solicitud }>(`/solicitudes/${vars.id}/rechazar`, vars.motivo ? { motivo: vars.motivo } : {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solicitudes"] });
      toast.success("Solicitud rechazada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendientes = solicitudes.filter((s) => s.estado === "PENDIENTE");
  // "Historial" = todo lo ya resuelto: despachadas (esperando acuse del PDV),
  // confirmadas y rechazadas.
  const historial  = solicitudes.filter((s) => s.estado !== "PENDIENTE");
  const porConfirmar = historial.filter((s) => s.estado === "DESPACHADA").length;
  const fantasmas    = solicitudes.filter(sinMovimientoDeStock);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando solicitudes…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Solicitudes de las sucursales</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Al despachar, el stock sale de bodega y entra al inventario del punto de venta.
          </p>
        </div>
        <PackagePlus className="size-5 shrink-0 text-muted-foreground mt-0.5" />
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MiniResumen label="Por despachar" valor={pendientes.length} destacado={pendientes.length > 0} />
        <MiniResumen label="Esperando acuse del PDV" valor={porConfirmar} />
        <MiniResumen label="Total registradas" valor={solicitudes.length} />
      </div>

      {/* Entregas que quedaron registradas sin mover inventario: el PDV cree que
          recibió stock que nunca entró, así que hay que regularizarlas. */}
      {fantasmas.length > 0 && (
        <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 dark:border-red-900/60 dark:bg-red-950/20">
          <p className="flex items-start gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {fantasmas.length} entrega{fantasmas.length === 1 ? "" : "s"} sin movimiento de stock
          </p>
          <p className="mt-1 pl-6 text-xs text-red-700/90 dark:text-red-400/90">
            Estas solicitudes figuran entregadas pero no descontaron bodega ni sumaron al PDV
            (quedaron así con el flujo anterior). Ábrelas en el historial y usa{" "}
            <strong>Regularizar stock</strong>:{" "}
            {fantasmas.map((s) => `#${s.id} (${s.pdvNombre})`).join(", ")}.
          </p>
          <button
            onClick={() => setVerHistorial(true)}
            className="mt-2 ml-6 h-8 rounded-lg border border-red-300 px-3 text-xs font-bold text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Ver en el historial
          </button>
        </div>
      )}

      {/* Pendientes */}
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Pendientes de despacho
        </p>
        {pendientes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed py-10 text-center">
            <Inbox className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">No hay pedidos por despachar</p>
            <p className="text-xs text-muted-foreground">
              Cuando una sucursal pida insumos, aparecerá aquí.
            </p>
          </div>
        ) : (
          pendientes.map((sol) => (
            <CardSolicitud
              key={sol.id}
              sol={sol}
              abiertaPorDefecto={pendientes.length <= 3}
              onDespachar={(s) => setEnModal({ sol: s, modo: "despachar" })}
              onRegularizar={(s) => setEnModal({ sol: s, modo: "regularizar" })}
              onRechazar={(id, motivo) => mutRechazar.mutate({ id, motivo })}
              rechazando={mutRechazar.isPending}
            />
          ))
        )}
      </div>

      {/* Historial */}
      <div className="space-y-3">
        <button
          onClick={() => setVerHistorial((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="text-xs font-bold uppercase tracking-wider">
            Historial de solicitudes ({historial.length})
          </span>
          {verHistorial ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        {verHistorial && (
          historial.length === 0 ? (
            <p className="rounded-2xl border border-dashed py-8 text-center text-sm text-muted-foreground">
              Todavía no hay solicitudes despachadas ni rechazadas.
            </p>
          ) : (
            <div className="space-y-3">
              {historial.map((sol) => (
                <CardSolicitud
                  key={sol.id}
                  sol={sol}
                  abiertaPorDefecto={sinMovimientoDeStock(sol)}
                  onDespachar={(s) => setEnModal({ sol: s, modo: "despachar" })}
                  onRegularizar={(s) => setEnModal({ sol: s, modo: "regularizar" })}
                  onRechazar={(id, motivo) => mutRechazar.mutate({ id, motivo })}
                  rechazando={mutRechazar.isPending}
                />
              ))}
            </div>
          )
        )}
      </div>

      {enModal && (
        <ModalDespacharSolicitud
          solicitud={enModal.sol}
          modo={enModal.modo}
          onCerrar={() => setEnModal(null)}
        />
      )}
    </div>
  );
}

function MiniResumen({ label, valor, destacado }: { label: string; valor: number; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${destacado ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20" : "bg-muted/20"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${destacado ? "text-amber-700 dark:text-amber-400" : "text-foreground"}`}>
        {valor}
      </p>
    </div>
  );
}
