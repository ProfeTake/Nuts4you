// Página: Historial de Ventas del turno activo
// Fuente primaria: GET /api/pos/ventas?turnoId= (API real)
// Fallback: ventas locales del store (offline o sin turno activo)

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMenuNav } from "@/componentes/layout/BarraLateral";
import { Input } from "@/components/ui/input";
import { formatearCLP } from "@/lib/money";
import { useCajaStore } from "@/store/caja.store";
import { apiGet } from "@/lib/api";
import { Loader2, Menu, X, ChevronLeft, ChevronRight } from "lucide-react";
import type { MetodoPago, VentaLocal } from "@/tipos/pos.tipos";

// ─── Tipos de la API ──────────────────────────────────────────────────────────

interface VentaAPI {
  id:         number;
  turnoId:    number;
  total:      number;
  folioSII:   number | null;
  metodoPago: string;
  horaVenta:  string;
  items: {
    productoId:     number;
    nombre:         string;
    categoria:      string;
    cantidad:       number;
    precioUnitario: number;
  }[];
}

function mapearVentaAPI(v: VentaAPI): VentaLocal {
  return {
    id:             v.id,
    turnoId:        v.turnoId,
    vendedorNombre: "—",
    total:          v.total,
    folioSII:       v.folioSII,
    metodoPago:     v.metodoPago as MetodoPago,
    horaVenta:      v.horaVenta,
    items:          v.items,
  };
}

// ─── Constantes visuales ─────────────────────────────────────────────────────

const METODO_LABELS: Record<MetodoPago, string> = {
  efectivo:      "Efectivo",
  debito:        "Débito",
  credito:       "Crédito",
  transferencia: "Transferencia",
};

const METODO_COLORES: Record<MetodoPago, string> = {
  efectivo:      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  debito:        "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  credito:       "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  transferencia: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
};

function resumenItems(items: VentaLocal["items"]): string {
  const primeros = items.slice(0, 2).map((it) => `${it.cantidad}× ${it.nombre}`).join(", ");
  if (items.length <= 2) return primeros;
  return `${primeros} +${items.length - 2} más`;
}

const POR_PAGINA = 25;

// ─── Componente principal ─────────────────────────────────────────────────────

export default function HistorialVentas() {
  const { abrirMenu } = useMenuNav();
  const turnoId     = useCajaStore((s) => s.turno?.id);
  const ventasLocal = useCajaStore((s) => s.ventas);

  const [busqueda, setBusqueda]               = useState("");
  const [filtroMetodo, setFiltroMetodo]       = useState<MetodoPago | "">("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [pagina, setPagina]                   = useState(1);
  const [ventaSeleccionada, setVentaSeleccionada] = useState<VentaLocal | null>(null);

  // ── Fetch desde API real ──
  const { data: ventasAPI, isLoading } = useQuery({
    queryKey:  ["pos", "ventas", turnoId],
    queryFn:   () =>
      apiGet<{ data: VentaAPI[] }>(`/pos/ventas?turnoId=${turnoId}`)
        .then((r) => r.data.map(mapearVentaAPI)),
    enabled:   !!turnoId,
    staleTime: 10_000,
  });

  // Usar API cuando está disponible; sino, store local
  const ventas: VentaLocal[] = ventasAPI ?? [...ventasLocal].reverse();

  const categorias = useMemo(
    () => [...new Set(ventas.flatMap((v) => v.items.map((it) => it.categoria)))],
    [ventas]
  );

  const ventasFiltradas = useMemo(() => {
    const texto = busqueda.toLowerCase();
    return ventas.filter((v) => {
      if (busqueda && !v.items.some((it) => it.nombre.toLowerCase().includes(texto)) &&
          !v.vendedorNombre.toLowerCase().includes(texto)) return false;
      if (filtroMetodo && v.metodoPago !== filtroMetodo) return false;
      if (filtroCategoria && !v.items.some((it) => it.categoria === filtroCategoria)) return false;
      return true;
    });
  }, [ventas, busqueda, filtroMetodo, filtroCategoria]);

  const totalPaginas  = Math.max(1, Math.ceil(ventasFiltradas.length / POR_PAGINA));
  const paginaActual  = Math.min(pagina, totalPaginas);
  const ventasPagina  = ventasFiltradas.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA);
  const totalFiltrado = ventasFiltradas.reduce((s, v) => s + v.total, 0);

  const limpiarFiltros = () => {
    setBusqueda(""); setFiltroMetodo(""); setFiltroCategoria(""); setPagina(1);
  };
  const hayFiltros = busqueda || filtroMetodo || filtroCategoria;

  return (
    <div className="flex h-full flex-col">
      {/* Header móvil */}
      <header className="flex items-center gap-3 border-b bg-background px-4 py-3 lg:hidden">
        <button onClick={abrirMenu} aria-label="Abrir menú"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
          <Menu size={20} />
        </button>
        <span className="text-base font-semibold text-foreground">Historial de Ventas</span>
      </header>

      {/* Título desktop */}
      <div className="hidden lg:flex items-baseline gap-3 px-6 pt-5 pb-1">
        <h1 className="text-xl font-bold text-foreground">Historial de Ventas</h1>
        <span className="text-sm text-muted-foreground">{ventasFiltradas.length} registros</span>
        {ventasAPI && (
          <span className="text-xs text-emerald-600 font-medium">● en línea</span>
        )}
      </div>

      {/* Filtros */}
      <div className="shrink-0 px-4 py-3 space-y-2 border-b">
        <div className="flex gap-2">
          <Input
            placeholder="Buscar producto…"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
            className="flex-1 h-9 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={filtroMetodo}
            onChange={(e) => { setFiltroMetodo(e.target.value as MetodoPago | ""); setPagina(1); }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todos los métodos</option>
            <option value="efectivo">Efectivo</option>
            <option value="debito">Débito</option>
            <option value="credito">Crédito</option>
            <option value="transferencia">Transferencia</option>
          </select>
          {categorias.length > 0 && (
            <select
              value={filtroCategoria}
              onChange={(e) => { setFiltroCategoria(e.target.value); setPagina(1); }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Todas las categorías</option>
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {hayFiltros && (
            <button onClick={limpiarFiltros}
              className="h-9 rounded-md border border-border px-3 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
              Limpiar
            </button>
          )}
          {ventasFiltradas.length > 0 && (
            <span className="ml-auto self-center text-sm font-semibold tabular-nums text-foreground">
              Total: {formatearCLP(totalFiltrado)}
            </span>
          )}
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={18} className="animate-spin" />
            Cargando ventas…
          </div>
        ) : ventas.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground border border-dashed rounded-xl">
            Aún no hay ventas en este turno
          </div>
        ) : ventasPagina.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            No se encontraron ventas con los filtros aplicados.
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted">
                <th className="border border-border px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider">#</th>
                <th className="border border-border px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider">Hora</th>
                <th className="border border-border px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wider hidden sm:table-cell">Boleta</th>
                <th className="border border-border px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider">Items</th>
                <th className="border border-border px-2 py-2 text-right text-[11px] font-bold uppercase tracking-wider">Total</th>
                <th className="border border-border px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wider">Pago</th>
              </tr>
            </thead>
            <tbody>
              {ventasPagina.map((v) => (
                <tr key={v.id} onClick={() => setVentaSeleccionada(v)}
                  className="cursor-pointer bg-background hover:bg-muted/40 transition-colors">
                  <td className="border border-border px-2 py-2 text-xs tabular-nums text-muted-foreground">{v.id}</td>
                  <td className="border border-border px-2 py-2 text-xs tabular-nums whitespace-nowrap text-muted-foreground">{v.horaVenta}</td>
                  <td className="border border-border px-2 py-2 text-center text-xs tabular-nums hidden sm:table-cell">
                    {v.folioSII ? (
                      <span className="font-medium text-foreground">{v.folioSII}</span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="border border-border px-2 py-2">
                    <span className="block text-sm font-medium text-foreground leading-snug">{resumenItems(v.items)}</span>
                    {v.items.length > 1 && (
                      <span className="text-[10px] text-muted-foreground">{v.items.length} productos · click para ver detalle</span>
                    )}
                  </td>
                  <td className="border border-border px-2 py-2 text-right font-semibold tabular-nums">{formatearCLP(v.total)}</td>
                  <td className="border border-border px-2 py-2 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${METODO_COLORES[v.metodoPago]}`}>
                      {METODO_LABELS[v.metodoPago]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="shrink-0 flex items-center justify-between border-t px-4 py-3">
          <span className="text-xs text-muted-foreground">
            Página {paginaActual} de {totalPaginas} · {ventasFiltradas.length} registros
          </span>
          <div className="flex items-center gap-1">
            <button disabled={paginaActual === 1} onClick={() => setPagina((p) => p - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPaginas }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPaginas || Math.abs(n - paginaActual) <= 1)
              .reduce<(number | "…")[]>((acc, n, i, arr) => {
                if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push("…");
                acc.push(n);
                return acc;
              }, [])
              .map((n, i) =>
                n === "…" ? (
                  <span key={`e-${i}`} className="px-1 text-muted-foreground text-sm">…</span>
                ) : (
                  <button key={n} onClick={() => setPagina(n as number)}
                    className={`h-8 w-8 rounded-lg border text-sm font-medium transition-colors ${
                      paginaActual === n
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}>
                    {n}
                  </button>
                )
              )}
            <button disabled={paginaActual === totalPaginas} onClick={() => setPagina((p) => p + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Modal detalle de venta */}
      {ventaSeleccionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setVentaSeleccionada(null)}>
          <div className="w-full max-w-sm rounded-2xl border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <p className="text-xs text-muted-foreground">Venta #{ventaSeleccionada.id} · {ventaSeleccionada.horaVenta}</p>
                <h3 className="text-base font-bold text-foreground">Detalle de venta</h3>
              </div>
              <button onClick={() => setVentaSeleccionada(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Productos vendidos</p>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Item</span>
                <span className="text-right">Cant.</span>
                <span className="text-right">Subtotal</span>
              </div>
              {ventaSeleccionada.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_auto_auto] gap-x-3 py-1.5 text-sm border-b border-border/40 last:border-0">
                  <div>
                    <span className="font-medium text-foreground">{it.nombre}</span>
                    <span className="block text-[10px] text-muted-foreground uppercase tracking-wide">{it.categoria}</span>
                  </div>
                  <span className="text-right tabular-nums self-center text-muted-foreground">{it.cantidad}</span>
                  <span className="text-right tabular-nums font-semibold self-center">
                    {formatearCLP(it.cantidad * it.precioUnitario)}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t px-5 py-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-xl font-extrabold tabular-nums text-foreground">{formatearCLP(ventaSeleccionada.total)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Método de pago</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${METODO_COLORES[ventaSeleccionada.metodoPago]}`}>
                  {METODO_LABELS[ventaSeleccionada.metodoPago]}
                </span>
              </div>
              {ventaSeleccionada.folioSII && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Boleta SII</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    N° {ventaSeleccionada.folioSII}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
