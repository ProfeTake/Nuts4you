// ─── ModalDespacharSolicitud ──────────────────────────────────────────────────
// Despachar una solicitud de insumos MUEVE STOCK real (A15): descuenta bodega y
// suma al PDV. Por eso el bodeguero declara aquí las cantidades que efectivamente
// envía — puede mandar menos de lo pedido, o 0 en un producto que no tiene.
//
// Compartido a propósito por las dos vistas que despachan:
//   - Admin → Bodega → tab Solicitudes (SolicitudesBodega)
//   - POS  → Solicitudes (el BODEGUERO opera en el layout POS)
//
// Conectado a:
//   GET   /api/bodega/stock                    → stock disponible en bodega
//   PATCH /api/solicitudes/:id/despachar       → mueve el stock y cierra el pedido

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Truck, X, AlertTriangle, PackageCheck } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";
import { compararProductos } from "@/lib/categorias";
import type { Solicitud } from "@/tipos/pos.tipos";

interface StockBodega {
  productoId:  number;
  nombre:      string;
  stockActual: number;
}

export function ModalDespacharSolicitud({
  solicitud,
  onCerrar,
  // "regularizar": la solicitud ya figura entregada pero nunca movió stock
  // (pedidos cerrados con el flujo anterior a A15). Mismo formulario, otro
  // endpoint, y el estado de la solicitud no cambia.
  modo = "despachar",
}: {
  solicitud: Solicitud;
  onCerrar: () => void;
  modo?: "despachar" | "regularizar";
}) {
  const esRegularizar = modo === "regularizar";
  const qc = useQueryClient();
  // Cantidades a despachar por productoId, prellenadas con lo pedido (el caso
  // normal es despachar completo; ajustar a la baja es la excepción).
  const [cantidades, setCantidades] = useState<Record<number, string>>(() =>
    Object.fromEntries(solicitud.items.map((it) => [it.productoId, String(it.cantidad)])),
  );
  const [notas, setNotas] = useState("");

  // Mismo queryKey que FormularioDespacho: comparten el stock ya cacheado y se
  // refrescan juntos al invalidar el prefijo ["bodega","stock"].
  const { data: stock = [], isLoading: cargandoStock } = useQuery({
    queryKey: ["bodega", "stock", "despacho"],
    queryFn:  () => apiGet<{ data: StockBodega[] }>("/bodega/stock").then((r) => r.data),
  });
  const stockPorProducto = new Map(stock.map((s) => [s.productoId, Number(s.stockActual) || 0]));

  const mutacion = useMutation({
    mutationFn: (payload: { items: { productoId: number; cantidad: number }[]; notas?: string }) =>
      apiPatch<{ data: Solicitud }>(
        `/solicitudes/${solicitud.id}/${esRegularizar ? "regularizar" : "despachar"}`,
        payload,
      ).then((r) => r.data),
    onSuccess: (sol) => {
      // El prefijo cubre las dos vistas de solicitudes (["solicitudes"] en POS y
      // ["solicitudes","admin"] en el panel) más el stock e historial de bodega.
      qc.invalidateQueries({ queryKey: ["solicitudes"] });
      qc.invalidateQueries({ queryKey: ["bodega"] });
      qc.invalidateQueries({ queryKey: ["inventario"] });
      const unidades = sol.despachos?.[0]?.totalUnidades ?? totalUnidades;
      toast.success(esRegularizar ? `Regularizado en ${sol.pdvNombre}` : `Despachado a ${sol.pdvNombre}`, {
        description: `${unidades} unidad${unidades === 1 ? "" : "es"} salieron de bodega y ya están en el stock del PDV.`,
      });
      onCerrar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Filas derivadas: `pedido` es lo que pidió el PDV, `aEnviar` lo que el
  // bodeguero declara despachar (pueden diferir: despacho parcial).
  // Ordenadas como el Turno Activo (Mezclas → Paquetes → Líquidos), no por el
  // orden en que el vendedor armó el pedido.
  const filas = solicitud.items
    .map((it) => {
      const disponible = stockPorProducto.get(it.productoId) ?? 0;
      const texto      = cantidades[it.productoId] ?? "";
      const aEnviar    = parseInt(texto, 10) || 0;
      return {
        productoId: it.productoId,
        producto:   it.producto,
        categoria:  it.categoria,
        pedido:     it.cantidad,
        disponible, texto, aEnviar,
        excede:     aEnviar > disponible,
      };
    })
    .sort(compararProductos);

  const totalUnidades = filas.reduce((s, f) => s + f.aEnviar, 0);
  const conCantidad   = filas.filter((f) => f.aEnviar > 0);
  const hayExceso     = filas.some((f) => f.excede);
  const esParcial     = filas.some((f) => f.aEnviar < f.pedido);
  const puedeEnviar   = conCantidad.length > 0 && !hayExceso && !mutacion.isPending;

  const setCantidad = (productoId: number, valor: string) =>
    setCantidades((prev) => ({ ...prev, [productoId]: valor.replace(/\D/g, "") }));

  const enviar = () => {
    if (!puedeEnviar) return;
    mutacion.mutate({
      // Se envían también los ítems en 0: el backend los filtra y así el payload
      // refleja exactamente lo que el bodeguero declaró para cada producto.
      items: filas.map((f) => ({ productoId: f.productoId, cantidad: f.aEnviar })),
      notas: notas.trim() || undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-0 sm:px-4"
      onClick={() => !mutacion.isPending && onCerrar()}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-background border shadow-2xl max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-start justify-between border-b px-5 py-4">
          <div>
            <h3 className="text-base font-bold">
              {esRegularizar ? "Regularizar" : "Despachar"} solicitud #{solicitud.id}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {solicitud.pdvNombre} · {solicitud.solicitante}
            </p>
          </div>
          <button
            onClick={onCerrar}
            disabled={mutacion.isPending}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {esRegularizar ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-400">
              Esta solicitud figura como entregada pero <strong>nunca movió inventario</strong>, así que
              la sucursal quedó sin ese stock. Al regularizar, las cantidades salen de bodega y entran
              al PDV ahora. El estado de la solicitud no cambia.
              <br />
              <strong>Ojo:</strong> si ya compensaste esta entrega con un despacho aparte, no la
              regularices — sumarías el stock dos veces.
            </p>
          ) : (
            <p className="rounded-xl border border-dashed bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
              Al despachar, el stock <strong>sale de bodega</strong> y se suma al inventario de la
              sucursal. Ajusta las cantidades si vas a enviar menos de lo pedido.
            </p>
          )}

          {cargandoStock ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Cargando stock de bodega…
            </div>
          ) : (
            <div className="rounded-xl border divide-y overflow-hidden">
              {filas.map((f) => (
                <div
                  key={f.productoId}
                  className={`flex items-center gap-3 px-3 py-2.5 ${f.excede ? "bg-red-50/60 dark:bg-red-950/10" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{f.producto}</p>
                    <p className="text-xs text-muted-foreground">
                      Pidió <span className="font-semibold tabular-nums">{f.pedido}</span>
                      {" · "}
                      Bodega: <span className="font-semibold tabular-nums">{f.disponible}</span>
                      {f.excede && (
                        <button
                          onClick={() => setCantidad(f.productoId, String(f.disponible))}
                          className="ml-2 font-semibold text-red-600 underline decoration-dotted"
                        >
                          solo hay {f.disponible} — ajustar
                        </button>
                      )}
                    </p>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={f.texto}
                    onChange={(e) => setCantidad(f.productoId, e.target.value)}
                    onFocus={(e) => e.target.select()}
                    className={`w-16 h-10 shrink-0 rounded-xl border bg-background text-center text-sm font-bold tabular-nums outline-none focus:ring-2 ${
                      f.excede ? "border-destructive focus:ring-destructive/40" : "border-input focus:ring-ring"
                    }`}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Nota del despacho (queda en la observación del despacho) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Nota para la sucursal (opcional)</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej: los líquidos van en la próxima entrega"
              rows={2}
              maxLength={500}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {esParcial && !hayExceso && conCantidad.length > 0 && !esRegularizar && (
            <p className="flex items-start gap-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Despacho parcial: enviarás menos de lo pedido. La solicitud queda cerrada como
              despachada — si falta, la sucursal deberá pedirlo de nuevo.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t px-5 py-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{esRegularizar ? "Total a regularizar" : "Total a despachar"}</span>
            <span className="font-bold tabular-nums">
              {totalUnidades} unid. · {conCantidad.length} producto{conCantidad.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCerrar}
              disabled={mutacion.isPending}
              className="flex-1 h-11 rounded-xl border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={enviar}
              disabled={!puedeEnviar}
              className="flex-1 h-11 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {mutacion.isPending ? (
                <><Loader2 size={16} className="animate-spin" /> {esRegularizar ? "Regularizando…" : "Despachando…"}</>
              ) : hayExceso ? (
                <><AlertTriangle size={16} /> Revisa el stock</>
              ) : conCantidad.length === 0 ? (
                <><PackageCheck size={16} /> Indica cantidades</>
              ) : (
                <><Truck size={16} /> {esRegularizar ? "Regularizar stock" : "Confirmar despacho"}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
