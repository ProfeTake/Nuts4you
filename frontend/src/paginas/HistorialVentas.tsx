// Página: Historial de Ventas

import { useState, useMemo } from "react";
import { useMenuNav } from "@/componentes/SideNav";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatearCLP } from "@/hooks/useCarrito";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type MetodoPago = "efectivo" | "debito" | "credito" | "transferencia";

interface ItemVenta {
  nombre: string;
  categoria: string;
  cantidad: number;
  precioUnitario: number;
}

interface VentaHistorial {
  id: number;
  fecha: string;   // "2026-03-12"
  hora: string;    // "14:20"
  items: ItemVenta[];
  total: number;
  metodoPago: MetodoPago;
  vendedor: string;
}

// ─── Mock de ventas ───────────────────────────────────────────────────────────

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

/** Texto compacto para la columna Item: "2× Paq de Maní, 1× Kapo" (máx 2, luego "+N más") */
function resumenItems(items: ItemVenta[]): string {
  const primeros = items.slice(0, 2).map((it) => `${it.cantidad}× ${it.nombre}`).join(", ");
  if (items.length <= 2) return primeros;
  return `${primeros} +${items.length - 2} más`;
}

function generarVentas(): VentaHistorial[] {
  const catalogo = [
    { nombre: "M de Maní",        categoria: "Granel",   precio: 1500 },
    { nombre: "M de Almendras",   categoria: "Granel",   precio: 3500 },
    { nombre: "M de Nueces",      categoria: "Granel",   precio: 3000 },
    { nombre: "M de Promo",       categoria: "Granel",   precio: 2000 },
    { nombre: "Paq de Maní",      categoria: "Paquetes", precio: 2500 },
    { nombre: "Paq de Almendras", categoria: "Paquetes", precio: 4500 },
    { nombre: "Paq de Nueces",    categoria: "Paquetes", precio: 4000 },
    { nombre: "Paq de Promo",     categoria: "Paquetes", precio: 3000 },
    { nombre: "Agua Con Gas",     categoria: "Bebidas",  precio: 1200 },
    { nombre: "Agua Sin Gas",     categoria: "Bebidas",  precio: 1000 },
    { nombre: "Energéticas",      categoria: "Bebidas",  precio: 2000 },
    { nombre: "Bebidas",          categoria: "Bebidas",  precio: 1500 },
    { nombre: "Kapo",             categoria: "Bebidas",  precio:  800 },
  ];
  const metodos: MetodoPago[] = ["efectivo", "debito", "credito", "transferencia"];
  const vendedores = ["Carlos Muñoz", "Ana Torres"];
  const fechas = ["2026-03-12", "2026-03-11", "2026-03-10", "2026-03-09", "2026-03-08"];
  const horas  = ["09:15","09:42","10:03","10:27","11:00","11:33","12:05","12:48",
                   "13:10","13:55","14:20","14:47","15:13","15:40","16:00","16:30"];

  return Array.from({ length: 40 }, (_, i) => {
    // 1–3 productos distintos por venta
    const nItems = (i % 3) + 1;
    const items: ItemVenta[] = Array.from({ length: nItems }, (__, j) => {
      const prod = catalogo[(i * 3 + j * 7) % catalogo.length];
      const cant = (j % 2) + 1;
      return { nombre: prod.nombre, categoria: prod.categoria, cantidad: cant, precioUnitario: prod.precio };
    });
    const total = items.reduce((s, it) => s + it.cantidad * it.precioUnitario, 0);
    return {
      id: i + 1,
      fecha: fechas[i % fechas.length],
      hora:  horas[i % horas.length],
      items,
      total,
      metodoPago: metodos[i % metodos.length],
      vendedor:   vendedores[i % vendedores.length],
    };
  }).sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
}

const VENTAS_MOCK = generarVentas();
const POR_PAGINA = 25;

// ─── Iconos ───────────────────────────────────────────────────────────────────

function IconoMenu() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
}

function IconoCerrar() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

function IconoChevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {dir === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function HistorialVentas() {
  const { abrirMenu } = useMenuNav();

  const [busqueda, setBusqueda]               = useState("");
  const [filtroFecha, setFiltroFecha]          = useState("");
  const [filtroMetodo, setFiltroMetodo]        = useState<MetodoPago | "">("");
  const [filtroCategoria, setFiltroCategoria]  = useState("");
  const [pagina, setPagina]                    = useState(1);
  const [ventaSeleccionada, setVentaSeleccionada] = useState<VentaHistorial | null>(null);

  const categorias = [...new Set(VENTAS_MOCK.flatMap((v) => v.items.map((it) => it.categoria)))];

  const ventasFiltradas = useMemo(() => {
    const texto = busqueda.toLowerCase();
    return VENTAS_MOCK.filter((v) => {
      if (busqueda && !v.items.some((it) => it.nombre.toLowerCase().includes(texto)) &&
          !v.vendedor.toLowerCase().includes(texto)) return false;
      if (filtroFecha && v.fecha !== filtroFecha) return false;
      if (filtroMetodo && v.metodoPago !== filtroMetodo) return false;
      if (filtroCategoria && !v.items.some((it) => it.categoria === filtroCategoria)) return false;
      return true;
    });
  }, [busqueda, filtroFecha, filtroMetodo, filtroCategoria]);

  const totalPaginas = Math.max(1, Math.ceil(ventasFiltradas.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const ventasPagina = ventasFiltradas.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA);

  const totalFiltrado = ventasFiltradas.reduce((s, v) => s + v.total, 0);

  const limpiarFiltros = () => {
    setBusqueda(""); setFiltroFecha(""); setFiltroMetodo(""); setFiltroCategoria(""); setPagina(1);
  };

  const hayFiltros = busqueda || filtroFecha || filtroMetodo || filtroCategoria;

  return (
    <div className="flex h-full flex-col">
      {/* Header móvil */}
      <header className="flex items-center gap-3 border-b bg-background px-4 py-3 lg:hidden">
        <button onClick={abrirMenu} aria-label="Abrir menú"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
          <IconoMenu />
        </button>
        <button onClick={abrirMenu} className="text-base font-semibold text-foreground hover:text-primary transition-colors">
          Historial de Ventas
        </button>
      </header>

      {/* Título desktop */}
      <div className="hidden lg:flex items-baseline gap-3 px-6 pt-5 pb-1">
        <h1 className="text-xl font-bold text-foreground">Historial de Ventas</h1>
        <span className="text-sm text-muted-foreground">{ventasFiltradas.length} registros</span>
      </div>

      {/* Filtros */}
      <div className="shrink-0 px-4 py-3 space-y-2 border-b">
        {/* Fila 1: búsqueda + fecha */}
        <div className="flex gap-2">
          <Input
            placeholder="Buscar producto o vendedor…"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
            className="flex-1 h-9 text-sm"
          />
          <input
            type="date"
            value={filtroFecha}
            onChange={(e) => { setFiltroFecha(e.target.value); setPagina(1); }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {/* Fila 2: método de pago + categoría + limpiar */}
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
          <select
            value={filtroCategoria}
            onChange={(e) => { setFiltroCategoria(e.target.value); setPagina(1); }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
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

      {/* Tabla — scrollable */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {ventasPagina.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            No se encontraron ventas con los filtros aplicados.
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted">
                <th className="border border-border px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider">#</th>
                <th className="border border-border px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider">Fecha</th>
                <th className="border border-border px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider">Item</th>
                <th className="border border-border px-2 py-2 text-right text-[11px] font-bold uppercase tracking-wider">Total</th>
                <th className="border border-border px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wider">Pago</th>
              </tr>
            </thead>
            <tbody>
              {ventasPagina.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => setVentaSeleccionada(v)}
                  className="cursor-pointer bg-background hover:bg-muted/40 transition-colors"
                >
                  <td className="border border-border px-2 py-2 text-xs tabular-nums text-muted-foreground">{v.id}</td>
                  <td className="border border-border px-2 py-2 text-xs tabular-nums whitespace-nowrap">
                    <span className="block">{v.fecha.split("-").reverse().join("/")}</span>
                    <span className="text-muted-foreground">{v.hora}</span>
                  </td>
                  <td className="border border-border px-2 py-2">
                    <span className="block text-sm font-medium text-foreground leading-snug">
                      {resumenItems(v.items)}
                    </span>
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
            <button
              disabled={paginaActual === 1}
              onClick={() => setPagina((p) => p - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <IconoChevron dir="left" />
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
                  <button
                    key={n}
                    onClick={() => setPagina(n as number)}
                    className={`h-8 w-8 rounded-lg border text-sm font-medium transition-colors ${
                      paginaActual === n
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {n}
                  </button>
                )
              )}
            <button
              disabled={paginaActual === totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <IconoChevron dir="right" />
            </button>
          </div>
        </div>
      )}
      {/* Modal detalle de venta */}
      {ventaSeleccionada && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setVentaSeleccionada(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <p className="text-xs text-muted-foreground">
                  Venta #{ventaSeleccionada.id} · {ventaSeleccionada.fecha.split("-").reverse().join("/")} {ventaSeleccionada.hora}
                </p>
                <h3 className="text-base font-bold text-foreground">Detalle de venta</h3>
              </div>
              <button
                onClick={() => setVentaSeleccionada(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <IconoCerrar />
              </button>
            </div>

            {/* Lista de productos */}
            <div className="px-5 py-4 space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Productos vendidos</p>
              {/* Cabecera columnas */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Item</span>
                <span className="text-right">Cant.</span>
                <span className="text-right">Subtotal</span>
              </div>
              {/* Filas */}
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

            {/* Footer: total + método + vendedor */}
            <div className="border-t px-5 py-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-xl font-extrabold tabular-nums text-foreground">
                  {formatearCLP(ventaSeleccionada.total)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Método de pago</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${METODO_COLORES[ventaSeleccionada.metodoPago]}`}>
                  {METODO_LABELS[ventaSeleccionada.metodoPago]}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Vendedor</span>
                <span className="text-sm font-medium text-foreground">{ventaSeleccionada.vendedor}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


