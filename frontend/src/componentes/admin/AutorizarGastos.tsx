// ─── AutorizarGastos ──────────────────────────────────────────────────────────
// Supervisor/Admin revisan las solicitudes de gasto de los vendedores y las
// aprueban o rechazan. Al aprobar, el backend crea el GastoTurno y el gasto
// aparece en el cierre de caja de ese turno.
//
// Conectado a:
//   GET   /api/solicitudes-gasto?estado=       → listado
//   GET   /api/solicitudes-gasto/:id/foto      → boucher (base64) bajo demanda
//   PATCH /api/solicitudes-gasto/:id/resolver  → aprobar / rechazar

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2, Receipt, Check, Ban, Store, User, Clock, Image as ImageIcon, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiGet, apiPatch } from "@/lib/api";
import { formatearCLP } from "@/lib/money";

interface SolicitudGasto {
  id: number;
  turnoId: number;
  pdvId: number;
  pdvNombre: string | null;
  vendedor: string | null;
  monto: number;
  motivo: string;
  categoria: string | null;
  estado: "PENDIENTE" | "APROBADO" | "RECHAZADO";
  resueltoPor: string | null;
  comentario: string | null;
  creadoEn: string;
  resueltoEn: string | null;
}

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });

export function AutorizarGastos() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(0); // 0 = pendientes, 1 = historial
  const estado = tab === 0 ? "PENDIENTE" : "";
  const [verFotoId, setVerFotoId] = useState<number | null>(null);
  const [accion, setAccion] = useState<{ sol: SolicitudGasto; aprobar: boolean } | null>(null);
  const [comentario, setComentario] = useState("");

  const { data: solicitudes = [], isLoading } = useQuery({
    queryKey: ["solicitudes-gasto", estado],
    queryFn: () =>
      apiGet<{ data: SolicitudGasto[] }>(`/solicitudes-gasto${estado ? `?estado=${estado}` : ""}`)
        .then((r) => r.data),
    refetchInterval: 20_000, // refresca por si llegan nuevas solicitudes
  });

  const resolver = useMutation({
    mutationFn: ({ id, aprobar, comentario }: { id: number; aprobar: boolean; comentario?: string }) =>
      apiPatch(`/solicitudes-gasto/${id}/resolver`, { aprobar, comentario: comentario || undefined }),
    onSuccess: (_r, vars) => {
      toast.success(vars.aprobar ? "Gasto aprobado" : "Gasto rechazado");
      queryClient.invalidateQueries({ queryKey: ["solicitudes-gasto"] });
      setAccion(null);
      setComentario("");
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "No se pudo resolver la solicitud"),
  });

  const pendientes = solicitudes.filter((s) => s.estado === "PENDIENTE").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Autorizar Gastos</h1>
          <p className="text-sm text-muted-foreground">
            Solicitudes de gasto de los vendedores. Al aprobar, el gasto entra al cierre de caja del turno.
          </p>
        </div>
        <Receipt className="size-5 text-muted-foreground mt-1 shrink-0" />
      </div>

      <Separator />

      <Tabs value={tab} onValueChange={(v) => setTab(Number(v))}>
        <TabsList>
          <TabsTrigger value={0}>
            <Clock className="size-4" /> Pendientes
            {pendientes > 0 && <Badge variant="secondary" className="ml-1 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">{pendientes}</Badge>}
          </TabsTrigger>
          <TabsTrigger value={1}>
            <Receipt className="size-4" /> Historial
          </TabsTrigger>
        </TabsList>

        <TabsContent value={0} className="mt-4">
          <ListaSolicitudes
            solicitudes={solicitudes} isLoading={isLoading}
            vacio="No hay gastos pendientes de autorización"
            onVerFoto={setVerFotoId}
            onResolver={(sol, aprobar) => { setAccion({ sol, aprobar }); setComentario(""); }}
          />
        </TabsContent>
        <TabsContent value={1} className="mt-4">
          <ListaSolicitudes
            solicitudes={solicitudes} isLoading={isLoading}
            vacio="Aún no hay solicitudes resueltas"
            onVerFoto={setVerFotoId}
            onResolver={(sol, aprobar) => { setAccion({ sol, aprobar }); setComentario(""); }}
          />
        </TabsContent>
      </Tabs>

      {/* Modal de confirmación aprobar/rechazar */}
      {accion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setAccion(null)}>
          <div className="w-full max-w-sm rounded-2xl border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-3 text-center">
              <div className={`mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full ${accion.aprobar ? "bg-emerald-100 dark:bg-emerald-950/40" : "bg-red-100 dark:bg-red-950/40"}`}>
                {accion.aprobar ? <Check className="size-6 text-emerald-600" strokeWidth={2.5} /> : <Ban className="size-6 text-red-600" />}
              </div>
              <h3 className="text-base font-bold">{accion.aprobar ? "Aprobar gasto" : "Rechazar gasto"}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {accion.sol.vendedor} · {formatearCLP(accion.sol.monto)} — {accion.sol.motivo}
              </p>
            </div>
            <div className="px-5 pb-4">
              <textarea
                placeholder={accion.aprobar ? "Comentario (opcional)" : "Motivo del rechazo (opcional)"}
                value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} maxLength={500}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <Button variant="outline" className="flex-1" disabled={resolver.isPending} onClick={() => setAccion(null)}>
                Cancelar
              </Button>
              <Button
                className={`flex-1 text-white ${accion.aprobar ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
                disabled={resolver.isPending}
                onClick={() => resolver.mutate({ id: accion.sol.id, aprobar: accion.aprobar, comentario })}
              >
                {resolver.isPending ? <Loader2 className="size-4 animate-spin" /> : accion.aprobar ? "Aprobar" : "Rechazar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Visor de foto */}
      {verFotoId !== null && <VisorFoto id={verFotoId} onCerrar={() => setVerFotoId(null)} />}
    </div>
  );
}

// ─── Lista ──────────────────────────────────────────────────────────────────

function ListaSolicitudes({ solicitudes, isLoading, vacio, onVerFoto, onResolver }: {
  solicitudes: SolicitudGasto[];
  isLoading: boolean;
  vacio: string;
  onVerFoto: (id: number) => void;
  onResolver: (sol: SolicitudGasto, aprobar: boolean) => void;
}) {
  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }
  if (solicitudes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">{vacio}</div>
    );
  }
  return (
    <div className="space-y-3">
      {solicitudes.map((s) => {
        const est = s.estado === "APROBADO"
          ? { cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400", txt: "Aprobado" }
          : s.estado === "RECHAZADO"
          ? { cls: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400", txt: "Rechazado" }
          : { cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400", txt: "Pendiente" };
        return (
          <div key={s.id} className="rounded-2xl border bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-bold tabular-nums">{formatearCLP(s.monto)}</span>
                  <Badge variant="secondary" className={est.cls}>{est.txt}</Badge>
                  {s.categoria && <Badge variant="outline" className="text-xs">{s.categoria}</Badge>}
                </div>
                <p className="text-sm text-foreground mt-1">{s.motivo}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1.5">
                  <span className="flex items-center gap-1"><User className="size-3" /> {s.vendedor ?? "—"}</span>
                  <span className="flex items-center gap-1"><Store className="size-3" /> {s.pdvNombre ?? "—"}</span>
                  <span className="flex items-center gap-1"><Clock className="size-3" /> {fmtFecha(s.creadoEn)}</span>
                </div>
                {s.comentario && (
                  <p className="text-xs text-muted-foreground mt-1 italic">Nota: {s.comentario}{s.resueltoPor ? ` — ${s.resueltoPor}` : ""}</p>
                )}
              </div>
              <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => onVerFoto(s.id)}>
                <ImageIcon className="size-4" /> Boucher
              </Button>
            </div>

            {s.estado === "PENDIENTE" && (
              <div className="flex gap-2 pt-1">
                <Button size="sm" className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onResolver(s, true)}>
                  <Check className="size-4" /> Aprobar
                </Button>
                <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30" onClick={() => onResolver(s, false)}>
                  <Ban className="size-4" /> Rechazar
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Visor de foto (carga la imagen bajo demanda) ─────────────────────────────

function VisorFoto({ id, onCerrar }: { id: number; onCerrar: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["solicitud-gasto-foto", id],
    queryFn: () => apiGet<{ data: { foto: string | null } }>(`/solicitudes-gasto/${id}/foto`).then((r) => r.data.foto),
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" onClick={onCerrar}>
      <div className="relative max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="size-8 animate-spin text-white" /></div>
        ) : data ? (
          <img src={data} alt="Boucher del gasto" className="w-full rounded-2xl shadow-2xl" />
        ) : (
          <div className="rounded-2xl bg-background px-6 py-12 text-center">
            <ImageIcon className="mx-auto mb-2 size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">El vendedor no adjuntó foto.</p>
          </div>
        )}
        <button onClick={onCerrar} className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-background border shadow">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
