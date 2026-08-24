// ─── PanelNotificaciones ─────────────────────────────────────────────────────
// Muestra las notificaciones del usuario autenticado.
// Se usa en la BarraLateral del POS para que los vendedores vean su horario.
//
// pdvId (opcional): en el POS es el PDV del turno actual → solo muestra avisos de
// esa sucursal + los globales. Sin pdvId (contexto admin) muestra todos. Evita
// que un vendedor con turnos en dos PDV vea en uno los avisos del otro.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, X, CheckCheck, Calendar } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";

interface Notificacion {
  id:      number;
  titulo:  string;
  mensaje: string;
  leida:   boolean;
  fecha:   string;
}

interface PanelNotificacionesProps {
  pdvId?: number;
}

export function PanelNotificaciones({ pdvId }: PanelNotificacionesProps = {}) {
  const [abierto, setAbierto] = useState(false);
  const qc = useQueryClient();

  const qs = pdvId ? `?pdvId=${pdvId}` : "";

  const { data: sinLeer = 0 } = useQuery({
    queryKey: ["notificaciones", "sinLeer", pdvId ?? null],
    queryFn:  () =>
      apiGet<{ data: { count: number } }>(`/notificaciones/sin-leer${qs}`)
        .then((r) => r.data.count)
        .catch(() => 0),
    refetchInterval: 60_000,
  });

  const { data: notifs = [] } = useQuery({
    queryKey: ["notificaciones", pdvId ?? null],
    queryFn:  () =>
      apiGet<{ data: Notificacion[] }>(`/notificaciones${qs}`)
        .then((r) => r.data)
        .catch(() => [] as Notificacion[]),
    enabled: abierto,
  });

  const mutLeerTodas = useMutation({
    mutationFn: () => apiPatch(`/notificaciones/leer-todas${qs}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificaciones"] }),
  });

  const mutLeerUna = useMutation({
    mutationFn: (id: number) => apiPatch(`/notificaciones/${id}/leer`, {}),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["notificaciones"] }),
  });

  const abrir = () => {
    setAbierto(true);
    qc.invalidateQueries({ queryKey: ["notificaciones"] });
  };

  return (
    <>
      {/* Botón campana */}
      <button
        onClick={abrir}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title="Notificaciones"
      >
        <Bell size={18} />
        {sinLeer > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
            {sinLeer > 9 ? "9+" : sinLeer}
          </span>
        )}
      </button>

      {/* Panel modal */}
      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-start sm:justify-end"
          onClick={() => setAbierto(false)}
        >
          <div
            className="w-full sm:w-96 sm:m-4 rounded-t-2xl sm:rounded-2xl bg-background border shadow-2xl flex flex-col max-h-[85dvh] animate-in slide-in-from-bottom sm:slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-primary" />
                <h2 className="font-bold text-sm">Notificaciones</h2>
                {sinLeer > 0 && (
                  <span className="rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 px-2 py-0.5 text-xs font-bold">
                    {sinLeer} sin leer
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {sinLeer > 0 && (
                  <button
                    onClick={() => mutLeerTodas.mutate()}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
                    title="Marcar todas como leídas"
                  >
                    <CheckCheck size={13} /> Leer todas
                  </button>
                )}
                <button
                  onClick={() => setAbierto(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto divide-y">
              {notifs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Bell size={28} className="opacity-20" />
                  <p className="text-sm">Sin notificaciones</p>
                </div>
              ) : (
                notifs.map((n) => (
                  <div
                    key={n.id}
                    className={`px-4 py-3 transition-colors ${
                      !n.leida ? "bg-primary/5 dark:bg-primary/10" : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`mt-0.5 shrink-0 flex h-8 w-8 items-center justify-center rounded-full ${
                        !n.leida ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                      }`}>
                        <Calendar size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-snug ${!n.leida ? "font-semibold" : "font-medium text-muted-foreground"}`}>
                          {n.titulo}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                          {n.mensaje}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground/60">
                          {new Date(n.fecha).toLocaleDateString("es-CL", {
                            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      </div>
                      {!n.leida && (
                        <button
                          onClick={() => mutLeerUna.mutate(n.id)}
                          className="shrink-0 mt-0.5 h-6 w-6 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          title="Marcar como leída"
                        >
                          <CheckCheck size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
