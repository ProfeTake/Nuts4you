// ─── FormularioDespacho ───────────────────────────────────────────────────────
// Bodeguero registra el envío de insumos a una sucursal.
// Conectado a:
//   GET  /api/admin/pdvs        → lista de puntos de venta destino
//   GET  /api/bodega/stock      → stock actual en bodega (para validar cantidades)
//   POST /api/bodega/despachos  → registrar el traspaso
//   GET  /api/bodega/despachos  → historial de traspasos

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Truck, History, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGet, apiPost } from "@/lib/api";
import { compararCategorias, compararProductos } from "@/lib/categorias";
import type { PDVItem } from "@/tipos/admin.tipos";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ItemStock {
  inventarioId: number;
  productoId:   number;
  nombre:       string;
  categoria:    string;
  stockActual:  number;
}

interface HistorialItem {
  id:       number;
  producto: string;
  origen:   string;
  destino:  string;
  cantidad: number;
  fecha:    string;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function FormularioDespacho() {
  const queryClient = useQueryClient();
  const [pdvDestinoId, setPdvDestinoId] = useState<string>("");
  // Cantidades a despachar indexadas por inventarioId (identidad única por fila de
  // stock). Las filas se derivan siempre del stock fresco; aquí solo viven las
  // cantidades escritas. Así dos filas nunca se "contagian" el valor.
  const [cantidades, setCantidades]     = useState<Record<number, string>>({});
  const [mostrarHistorial, setMostrarHistorial] = useState(false);

  // ── Carga de datos ────────────────────────────────────────────────────────

  const { data: pdvs = [], isLoading: cargandoPdvs } = useQuery({
    queryKey: ["admin", "pdvs"],
    queryFn:  () => apiGet<{ data: PDVItem[] }>("/admin/pdvs").then((r) => r.data),
  });

  // Query propio (key distinto) para no colisionar con el inventario, que comparte
  // el endpoint pero transforma los datos a otra forma. La invalidación por prefijo
  // de ["bodega","stock"] sigue refrescando este query tras guardar/despachar.
  const { data: stock = [], isLoading: cargandoStock } = useQuery({
    queryKey: ["bodega", "stock", "despacho"],
    queryFn:  () =>
      apiGet<{ data: ItemStock[] }>("/bodega/stock").then((r) =>
        // Normaliza por si el backend omite algún campo (evita NaN/blank en la UI)
        r.data.map((s) => ({
          inventarioId: s.inventarioId,
          productoId:   s.productoId,
          nombre:       s.nombre ?? "—",
          categoria:    s.categoria ?? "Otros",
          stockActual:  Number(s.stockActual) || 0,
        }))
      ),
  });

  const { data: historial = [], isLoading: cargandoHistorial } = useQuery({
    queryKey: ["bodega", "despachos"],
    queryFn:  () =>
      apiGet<{ data: HistorialItem[] }>("/bodega/despachos").then((r) => r.data),
    enabled: mostrarHistorial,
  });

  // ── Mutación ──────────────────────────────────────────────────────────────

  const mutacion = useMutation({
    mutationFn: (payload: { pdvDestinoId: number; items: { productoId: number; cantidad: number }[] }) =>
      apiPost<{ data: { mensaje: string; destino: string } }>("/bodega/despachos", payload),
    onSuccess: (res) => {
      toast.success("Despacho registrado", {
        description: `Enviado a ${res.data.destino}`,
      });
      // Limpiar cantidades
      setCantidades({});
      setPdvDestinoId("");
      // Refrescar stock y historial
      queryClient.invalidateQueries({ queryKey: ["bodega", "stock"] });
      queryClient.invalidateQueries({ queryKey: ["bodega", "despachos"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Error al registrar el despacho";
      toast.error(msg);
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────

  const setCantidad = (inventarioId: number, valor: string) => {
    setCantidades((prev) => ({ ...prev, [inventarioId]: valor.replace(/\D/g, "") }));
  };

  // Filas con cantidad > 0, derivadas del stock fresco + el mapa de cantidades.
  const itemsConCantidad = stock
    .map((s) => ({ ...s, cantidad: parseInt(cantidades[s.inventarioId] ?? "", 10) || 0 }))
    .filter((s) => s.cantidad > 0)
    .sort(compararProductos); // el resumen sigue el mismo orden que la tabla

  const erroresStock = itemsConCantidad.filter((i) => i.cantidad > i.stockActual);

  const puedeEnviar =
    !!pdvDestinoId &&
    itemsConCantidad.length > 0 &&
    erroresStock.length === 0 &&
    !mutacion.isPending;

  const handleEnviar = () => {
    if (!puedeEnviar) return;
    mutacion.mutate({
      pdvDestinoId: parseInt(pdvDestinoId, 10),
      items: itemsConCantidad.map((i) => ({
        productoId: i.productoId,
        cantidad:   i.cantidad,
      })),
    });
  };

  // ── Agrupar items por categoría ───────────────────────────────────────────
  // Mismo orden que el Turno Activo del vendedor (Mezclas → Paquetes → Líquidos):
  // la API los devuelve alfabéticos y quien despacha buscaba a ciegas.

  const categorias = [...new Set(stock.map((s) => s.categoria))].sort(compararCategorias);

  const cargando = cargandoPdvs || cargandoStock;

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Cargando datos de bodega…
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Registrar Despacho</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ingresa las cantidades a enviar y selecciona el destino
          </p>
        </div>
        <Truck className="size-5 text-muted-foreground mt-0.5" />
      </div>

      <Separator />

      {/* ── Selector de destino ── */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Sucursal destino</label>
        <Select value={pdvDestinoId} onValueChange={v => setPdvDestinoId(v ?? "")}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue placeholder="Seleccionar sucursal…">
              {pdvDestinoId ? pdvs.find(p => String(p.id) === pdvDestinoId)?.nombre : undefined}
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

      {/* ── Tabla de items ── */}
      <div className="space-y-4">
        {categorias.map((cat) => {
          const grupo = stock.filter((s) => s.categoria === cat).sort(compararProductos);
          return (
            <div key={cat} className="rounded-xl border overflow-hidden">
              <div className="bg-muted px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {cat}
              </div>
              <div className="divide-y">
                {grupo.map((item) => {
                  const cantStr   = cantidades[item.inventarioId] ?? "";
                  const cant      = parseInt(cantStr, 10) || 0;
                  const sinStock  = item.stockActual <= 0;
                  const excede    = cant > item.stockActual;
                  const hayCant   = cant > 0;

                  return (
                    <div
                      key={item.inventarioId}
                      className={`flex items-center justify-between gap-3 px-4 py-3 ${
                        excede ? "bg-red-50/60 dark:bg-red-950/10" : sinStock ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {item.nombre}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Stock bodega: <span className="font-medium tabular-nums">{item.stockActual}</span>
                          {sinStock && (
                            <span className="ml-2 text-muted-foreground font-medium">— sin stock para despachar</span>
                          )}
                          {!sinStock && hayCant && !excede && (
                            <span className="ml-2 text-emerald-600 font-medium">
                              → quedan {item.stockActual - cant}
                            </span>
                          )}
                          {excede && (
                            <span className="ml-2 text-red-600 font-medium">
                              ⚠ Máximo {item.stockActual}
                            </span>
                          )}
                        </p>
                      </div>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={cantStr}
                        disabled={sinStock}
                        onChange={(e) => setCantidad(item.inventarioId, e.target.value)}
                        className={`w-20 text-center font-semibold tabular-nums ${
                          excede ? "border-destructive focus-visible:ring-destructive" : ""
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Resumen pre-envío ── */}
      {itemsConCantidad.length > 0 && (
        <div className="rounded-xl border bg-muted/40 px-4 py-3 space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Resumen del despacho
          </p>
          {itemsConCantidad.map((i) => (
            <div key={i.inventarioId} className="flex items-center justify-between text-sm">
              <span className="text-foreground">{i.nombre}</span>
              <Badge variant="secondary" className="tabular-nums font-semibold">
                {i.cantidad} unid.
              </Badge>
            </div>
          ))}
          {!pdvDestinoId && (
            <p className="flex items-center gap-1.5 text-xs text-amber-600 pt-1">
              <AlertTriangle className="size-3.5" />
              Selecciona una sucursal destino
            </p>
          )}
        </div>
      )}

      {/* ── Botón enviar ── */}
      <Button
        size="lg"
        className="w-full gap-2"
        disabled={!puedeEnviar}
        onClick={handleEnviar}
      >
        {mutacion.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Enviando…
          </>
        ) : (
          <>
            <Truck className="size-4" />
            Confirmar Despacho
            {itemsConCantidad.length > 0 && ` (${itemsConCantidad.length} ítem${itemsConCantidad.length > 1 ? "s" : ""})`}
          </>
        )}
      </Button>

      <Separator />

      {/* ── Historial de despachos ── */}
      <button
        onClick={() => setMostrarHistorial((v) => !v)}
        className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-2">
          <History className="size-4" />
          Historial de despachos recientes
        </span>
        {mostrarHistorial ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>

      {mostrarHistorial && (
        <div className="rounded-xl border overflow-hidden">
          {cargandoHistorial ? (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : historial.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No hay despachos registrados aún
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-left">
                  <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Producto</th>
                  <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Destino</th>
                  <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-right text-muted-foreground">Cant.</th>
                  <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id} className="border-t">
                    <td className="px-3 py-2.5 font-medium text-foreground">{h.producto}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{h.destino}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{h.cantidad}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(h.fecha).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
