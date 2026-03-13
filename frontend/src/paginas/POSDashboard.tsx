// Pantalla principal del Punto de Venta (POS) - Rol Vendedor

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useCarrito, formatearCLP } from "@/hooks/useCarrito";
import { useMenuNav } from "@/componentes/SideNav";
import { categoriasMock, productosMock } from "@/datos/mock.datos";
import type { Producto } from "@/tipos/pos.tipos";

type MetodoPago = "efectivo" | "debito" | "credito" | "transferencia";

const METODOS_PAGO: { value: MetodoPago; label: string; emoji: string }[] = [
  { value: "efectivo",      label: "Efectivo",          emoji: "💵" },
  { value: "debito",        label: "Débito",             emoji: "💳" },
  { value: "credito",       label: "Crédito",            emoji: "💳" },
  { value: "transferencia", label: "Transferencia",      emoji: "📲" },
];

// ─── Iconos SVG inline (evita dependencia extra) ───────────────────────────
function IconoMenu() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
}

function IconoBuscar() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function IconoMenos() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M5 12h14" />
    </svg>
  );
}

function IconoMas() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

function IconoBasura() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function IconoCarrito() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  );
}

// ─── Componente: Tarjeta de Producto ────────────────────────────────────────
interface TarjetaProductoProps {
  producto: Producto;
  alAgregar: (producto: Producto) => void;
}

function TarjetaProducto({ producto, alAgregar }: TarjetaProductoProps) {
  // Emoji según categoría para darle vida visual
  const obtenerEmoji = (categoriaId: number): string => {
    const emojis: Record<number, string> = { 1: "🥜", 2: "🥤", 3: "🌰" };
    return emojis[categoriaId] ?? "📦";
  };

  return (
    <Card
      className="cursor-pointer select-none border-2 border-transparent transition-all duration-150 hover:border-primary/30 hover:shadow-lg active:scale-[0.97] active:shadow-sm"
      onClick={() => {
        alAgregar(producto);
        toast.success(`${producto.nombre} agregado al carrito`, {
          description: formatearCLP(producto.precioVenta),
        });
      }}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 p-4 sm:p-5">
        <span className="text-3xl sm:text-4xl">
          {obtenerEmoji(producto.categoriaId)}
        </span>
        <span className="text-center text-sm font-semibold leading-tight text-foreground sm:text-base">
          {producto.nombre}
        </span>
        <Badge
          variant="secondary"
          className="mt-1 text-base font-bold tabular-nums sm:text-lg"
        >
          {formatearCLP(producto.precioVenta)}
        </Badge>
      </CardContent>
    </Card>
  );
}

// ─── Componente Principal: POSDashboard ─────────────────────────────────────
export default function POSDashboard() {
  const { abrirMenu } = useMenuNav();
  const [busqueda, setBusqueda] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState<number | null>(null);
  const [carritoVisible, setCarritoVisible] = useState(false);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo");

  const {
    carrito,
    cantidadTotal,
    agregarProducto,
    incrementarCantidad,
    decrementarCantidad,
    eliminarProducto,
    vaciarCarrito,
  } = useCarrito();

  // ── Filtrado de productos ──
  const productosFiltrados = productosMock.filter((p) => {
    const coincideNombre = p.nombre
      .toLowerCase()
      .includes(busqueda.toLowerCase());
    const coincideCategoria =
      categoriaActiva === null || p.categoriaId === categoriaActiva;
    return p.activo && coincideNombre && coincideCategoria;
  });

  // ── Sección: Catálogo de productos ──
  const seccionCatalogo = (
    <div className="flex flex-col gap-4 lg:h-full">
      {/* Header: misma estructura que el resto de páginas */}
      <header className="flex items-center gap-3 border-b bg-background px-4 py-3">
        {/* Botón abrir menú — solo en mobile */}
        <button
          onClick={abrirMenu}
          aria-label="Abrir menú"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
        >
          <IconoMenu />
        </button>

        {/* Título — clic abre el menú */}
        <div className="flex-1 min-w-0">
          <button
            onClick={abrirMenu}
            className="text-base font-semibold text-foreground hover:text-primary transition-colors"
          >
            Punto de Venta
          </button>
        </div>

        {/* Botón carrito — solo en mobile */}
        <Button
          variant="outline"
          size="icon"
          className="relative shrink-0 lg:hidden"
          onClick={() => setCarritoVisible(!carritoVisible)}
        >
          <IconoCarrito />
          {cantidadTotal > 0 && (
            <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
              {cantidadTotal}
            </span>
          )}
        </Button>
      </header>

      {/* Buscador */}
      <div className="relative">
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <IconoBuscar />
        </div>
        <Input
          type="text"
          placeholder="Buscar producto..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="h-11 pl-10 text-base"
        />
      </div>

      {/* Filtros de categoría */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={categoriaActiva === null ? "default" : "outline"}
          size="sm"
          className="rounded-full"
          onClick={() => setCategoriaActiva(null)}
        >
          Todos
        </Button>
        {categoriasMock.map((cat) => (
          <Button
            key={cat.id}
            variant={categoriaActiva === cat.id ? "default" : "outline"}
            size="sm"
            className="rounded-full"
            onClick={() => setCategoriaActiva(cat.id)}
          >
            {cat.nombre}
          </Button>
        ))}
      </div>

      {/* Grid de productos */}
      {/* En mobile: scroll nativo del wrapper. En desktop: ScrollArea con flex-1 */}
      <div className="lg:hidden">
        {productosFiltrados.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            No se encontraron productos
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-6 sm:grid-cols-3">
            {productosFiltrados.map((producto) => (
              <TarjetaProducto
                key={producto.id}
                producto={producto}
                alAgregar={agregarProducto}
              />
            ))}
          </div>
        )}
      </div>
      <ScrollArea className="hidden flex-1 pr-1 lg:block">
        {productosFiltrados.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            No se encontraron productos
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-3 xl:grid-cols-4">
            {productosFiltrados.map((producto) => (
              <TarjetaProducto
                key={producto.id}
                producto={producto}
                alAgregar={agregarProducto}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  // ── Sección: Carrito / Ticket ──
  const seccionCarrito = (
    <div className="flex flex-col rounded-xl border bg-card shadow-sm">
      {/* Header carrito */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <IconoCarrito />
          <h2 className="text-lg font-bold text-foreground">Ticket</h2>
          {cantidadTotal > 0 && (
            <Badge variant="secondary" className="tabular-nums">
              {cantidadTotal} {cantidadTotal === 1 ? "item" : "items"}
            </Badge>
          )}
        </div>
        {carrito.items.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-destructive hover:text-destructive"
            onClick={vaciarCarrito}
          >
            Vaciar
          </Button>
        )}
      </div>

      {/* Items del carrito — máx 4 visibles, scroll interno */}
      <ScrollArea className="px-4" style={{ height: carrito.items.length === 0 ? "180px" : `${Math.min(carrito.items.length, 4) * 68}px` }}>
        {carrito.items.length === 0 ? (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-muted-foreground">
            <IconoCarrito />
            <p className="text-sm">El ticket está vacío</p>
            <p className="text-xs">Toca un producto para agregarlo</p>
          </div>
        ) : (
          <div className="divide-y">
            {carrito.items.map((item) => (
              <div
                key={item.producto.id}
                className="flex items-center gap-3 py-3"
              >
                {/* Info del producto */}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.producto.nombre}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatearCLP(item.producto.precioVenta)} c/u
                  </p>
                </div>

                {/* Controles de cantidad */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => decrementarCantidad(item.producto.id)}
                  >
                    <IconoMenos />
                  </Button>
                  <span className="w-8 text-center text-sm font-bold tabular-nums">
                    {item.cantidad}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => incrementarCantidad(item.producto.id)}
                  >
                    <IconoMas />
                  </Button>
                </div>

                {/* Subtotal + eliminar */}
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatearCLP(item.subtotal)}
                  </span>
                  <button
                    onClick={() => eliminarProducto(item.producto.id)}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <IconoBasura />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer: Total y botón Cobrar */}
      <div className="border-t p-4">
        <Separator className="mb-4" />

        <div className="mb-4 flex items-baseline justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            Total a pagar
          </span>
          <span className="text-3xl font-extrabold tabular-nums tracking-tight text-foreground">
            {formatearCLP(carrito.total)}
          </span>
        </div>

        {/* Selector de método de pago */}
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Método de pago</p>
          <div className="grid grid-cols-2 gap-1.5">
            {METODOS_PAGO.map((m) => (
              <button
                key={m.value}
                onClick={() => setMetodoPago(m.value)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  metodoPago === m.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                <span>{m.emoji}</span>
                <span className="truncate">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <Button
          className="h-14 w-full rounded-xl bg-emerald-600 text-lg font-bold text-white shadow-lg transition-all hover:bg-emerald-700 hover:shadow-xl active:scale-[0.98] disabled:opacity-50"
          disabled={carrito.items.length === 0}
          onClick={() => {
            const metodo = METODOS_PAGO.find((m) => m.value === metodoPago)!;
            // TODO: Implementar flujo de cobro real
            alert(
              `Cobrar ${formatearCLP(carrito.total)} — ${metodo.label} — Funcionalidad próximamente`
            );
          }}
        >
          <span className="mr-2">{METODOS_PAGO.find((m) => m.value === metodoPago)?.emoji}</span>
          Cobrar {carrito.total > 0 && formatearCLP(carrito.total)}
        </Button>
      </div>
    </div>
  );

  // ── Layout principal ──
  return (
    <div className="relative flex h-full flex-col lg:flex-row">
      {/* Catálogo (izquierda en desktop, arriba en mobile) */}
      <div className="flex-1 overflow-y-auto p-4 lg:w-[70%] lg:flex-none lg:overflow-hidden">
        {seccionCatalogo}
      </div>

      {/* Carrito desktop (siempre visible en lg+) */}
      <div className="hidden w-[30%] min-w-[340px] border-l p-4 lg:block">
        {seccionCarrito}
      </div>

      {/* Carrito mobile (panel deslizable desde abajo) */}
      {carritoVisible && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Fondo oscuro */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setCarritoVisible(false)}
          />
          {/* Panel del carrito */}
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] animate-in slide-in-from-bottom duration-300">
            <div className="rounded-t-2xl bg-background p-4">
              {/* Indicador de arrastre */}
              <div className="mb-3 flex justify-center">
                <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
              </div>
              {seccionCarrito}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
