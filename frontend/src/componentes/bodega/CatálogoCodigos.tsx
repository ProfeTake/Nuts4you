/* eslint-disable react-refresh/only-export-components --
   El archivo exporta UN solo componente (CatálogoCodigos); TarjetaBarcode es un
   sub-componente privado que solo tiene sentido acá. Sacarlo a otro archivo solo
   para satisfacer la frontera de Fast Refresh dispersaría código muy acoplado a
   cambio de un beneficio de dev, no de runtime. */
// ─── CatálogoCodigos ─────────────────────────────────────────────────────────
// Catálogo fijo de los 15 productos del sistema con códigos EAN-13 pre-asignados
// (prefijo Chile 780). Permite descarga PNG e impresión individual o total.
// Los códigos son deterministas y se reemplazarán por los códigos reales en prod.

import { useEffect, useRef, useCallback } from "react";
import JsBarcode from "jsbarcode";
import { Download, Printer, PrinterCheck } from "lucide-react";
import { toast } from "sonner";
import { compararCategorias, compararProductos } from "@/lib/categorias";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Categoria = "Mezclas" | "Paquetes" | "Promos" | "Líquidos" | "Helados";

interface ProductoCatalogo {
  id:          number;
  sigla:       string;
  nombre:      string;
  categoria:   Categoria;
  codigo:      string; // EAN-13 válido
  precioVenta: number;
}

// ─── Catálogo fijo ────────────────────────────────────────────────────────────
// Todos los códigos tienen prefijo 780 (Chile) y dígito verificador calculado.

const CATALOGO: ProductoCatalogo[] = [
  // ── Mezclas (materia prima — no se venden directamente) ──
  { id: 1,  sigla: "MM",    nombre: "Mezcla Maní",         categoria: "Mezclas",  codigo: "7800000000016", precioVenta: 0    },
  { id: 2,  sigla: "MA",    nombre: "Mezcla Almendras",     categoria: "Mezclas",  codigo: "7800000000023", precioVenta: 0    },
  { id: 3,  sigla: "MN",    nombre: "Mezcla Nueces",        categoria: "Mezclas",  codigo: "7800000000030", precioVenta: 0    },
  { id: 4,  sigla: "MPr",   nombre: "Mezcla Promo",         categoria: "Mezclas",  codigo: "7800000000047", precioVenta: 0    },
  { id: 5,  sigla: "MH",    nombre: "Mezcla Helado",        categoria: "Mezclas",  codigo: "7800000000054", precioVenta: 0    },
  // ── Paquetes ──
  { id: 6,  sigla: "pm",    nombre: "Paquetes Maní",        categoria: "Paquetes", codigo: "7800000000061", precioVenta: 800  },
  { id: 7,  sigla: "pa",    nombre: "Paquetes Almendras",   categoria: "Paquetes", codigo: "7800000000078", precioVenta: 1000 },
  { id: 8,  sigla: "pn",    nombre: "Paquetes Nueces",      categoria: "Paquetes", codigo: "7800000000085", precioVenta: 1000 },
  // ── Promos ──
  { id: 9,  sigla: "pp",    nombre: "Paquetes Promo",       categoria: "Promos",   codigo: "7800000000092", precioVenta: 1500 },
  // ── Líquidos ──
  { id: 10, sigla: "AM CG", nombre: "Agua Mineral Con Gas", categoria: "Líquidos", codigo: "7800000000108", precioVenta: 800  },
  { id: 11, sigla: "AM SG", nombre: "Agua Mineral Sin Gas", categoria: "Líquidos", codigo: "7800000000115", precioVenta: 800  },
  { id: 12, sigla: "ENE",   nombre: "Energéticas",          categoria: "Líquidos", codigo: "7800000000122", precioVenta: 1500 },
  { id: 13, sigla: "BEB",   nombre: "Bebidas",              categoria: "Líquidos", codigo: "7800000000139", precioVenta: 1500 },
  { id: 14, sigla: "KAPO",  nombre: "Jugos Kapo",           categoria: "Líquidos", codigo: "7800000000146", precioVenta: 500  },
  // ── Helados ──
  { id: 15, sigla: "HLD",   nombre: "Helados",              categoria: "Helados",  codigo: "7800000000153", precioVenta: 1000 },
];

// Derivado del catálogo y ordenado con la regla compartida, en vez de repetir la
// secuencia a mano: una lista hardcodeada acá se despega de lib/categorias apenas
// alguien agrega o renombra una categoría.
const CATEGORIAS_ORDEN: Categoria[] = [...new Set(CATALOGO.map((p) => p.categoria))]
  .sort(compararCategorias);

const COLOR_CAT: Record<Categoria, string> = {
  Mezclas:  "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/40",
  Paquetes: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700/40",
  Promos:   "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700/40",
  Líquidos: "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-700/40",
  Helados:  "bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-700/40",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function svgToPNG(svg: SVGSVGElement): Promise<string> {
  return new Promise(resolve => {
    const svgStr = new XMLSerializer().serializeToString(svg);
    const scale  = 3;
    const canvas = document.createElement("canvas");
    canvas.width  = svg.width.baseVal.value  * scale;
    canvas.height = svg.height.baseVal.value * scale;
    const ctx  = canvas.getContext("2d")!;
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = url;
  });
}

// ─── Tarjeta individual ───────────────────────────────────────────────────────

interface TarjetaProps {
  producto: ProductoCatalogo;
  onMount:  (id: number, el: SVGSVGElement | null) => void;
}

function TarjetaBarcode({ producto: p, onMount }: TarjetaProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    JsBarcode(svgRef.current, p.codigo, {
      format:       "EAN13",
      lineColor:    "#000",
      background:   "#fff",
      width:        2,
      height:       65,
      displayValue: true,
      fontSize:     12,
      margin:       8,
      textMargin:   4,
      fontOptions:  "bold",
    });
    onMount(p.id, svgRef.current);
    return () => onMount(p.id, null);
  }, [p.id, p.codigo, onMount]);

  const descargarPNG = async () => {
    if (!svgRef.current) return;
    try {
      const dataUrl = await svgToPNG(svgRef.current);
      const a = document.createElement("a");
      a.download = `${p.sigla.replace(/\s+/g, "-")}-${p.codigo}.png`;
      a.href     = dataUrl;
      a.click();
      toast.success(`${p.sigla} descargado`);
    } catch { toast.error("Error al generar PNG"); }
  };

  const imprimir = () => {
    if (!svgRef.current) return;
    const svgStr = new XMLSerializer().serializeToString(svgRef.current);
    const win = window.open("", "_blank");
    if (!win) { toast.error("Navegador bloqueó la ventana emergente"); return; }
    win.document.write(`<html>
      <head><title>${p.sigla} — ${p.codigo}</title><style>
        body{margin:0;display:flex;flex-direction:column;align-items:center;
          justify-content:center;min-height:100vh;font-family:sans-serif;padding:20px;background:#fff}
        .sigla{font-size:28px;font-weight:900;text-align:center;margin-bottom:4px}
        .nombre{font-size:14px;color:#555;text-align:center;margin-bottom:2px}
        .cat{font-size:11px;color:#888;text-align:center;margin-bottom:12px}
        .precio{font-size:16px;font-weight:700;text-align:center;margin-top:8px}
        svg{max-width:100%}
      </style></head>
      <body>
        <p class="sigla">${p.sigla}</p>
        <p class="nombre">${p.nombre}</p>
        <p class="cat">${p.categoria}</p>
        ${svgStr}
        ${p.precioVenta > 0 ? `<p class="precio">$${p.precioVenta.toLocaleString("es-CL")}</p>` : ""}
        <script>window.onload=()=>window.print()</script>
      </body></html>`);
    win.document.close();
  };

  return (
    <div className="rounded-2xl border bg-card flex flex-col gap-3 p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-2xl font-black leading-none tabular-nums">{p.sigla}</p>
          <p className="mt-1 text-sm text-muted-foreground truncate">{p.nombre}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${COLOR_CAT[p.categoria]}`}>
          {p.categoria}
        </span>
      </div>

      {/* Código de barras */}
      <div className="flex justify-center overflow-x-auto rounded-xl bg-white p-2">
        <svg ref={svgRef} className="max-w-full" />
      </div>

      {/* Precio */}
      {p.precioVenta > 0 && (
        <p className="text-center text-sm font-bold tabular-nums">
          ${p.precioVenta.toLocaleString("es-CL")} CLP
        </p>
      )}

      {/* Acciones */}
      <div className="flex gap-2">
        <button
          onClick={descargarPNG}
          className="flex flex-1 items-center justify-center gap-1.5 h-9 rounded-xl border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
        >
          <Download size={13} /> PNG
        </button>
        <button
          onClick={imprimir}
          className="flex flex-1 items-center justify-center gap-1.5 h-9 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Printer size={13} /> Imprimir
        </button>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function CatálogoCodigos() {
  const svgRefs = useRef<Map<number, SVGSVGElement>>(new Map());

  const registrar = useCallback((id: number, el: SVGSVGElement | null) => {
    if (el) svgRefs.current.set(id, el);
    else svgRefs.current.delete(id);
  }, []);

  const imprimirTodos = async () => {
    const win = window.open("", "_blank");
    if (!win) { toast.error("Navegador bloqueó la ventana emergente"); return; }

    const id = toast.loading("Generando catálogo completo…");
    try {
      const tarjetas: string[] = [];
      for (const p of CATALOGO) {
        const svg = svgRefs.current.get(p.id);
        if (!svg) continue;
        const dataUrl = await svgToPNG(svg);
        tarjetas.push(`
          <div class="card">
            <p class="sigla">${p.sigla}</p>
            <p class="nombre">${p.nombre}</p>
            <span class="cat">${p.categoria}</span>
            <img src="${dataUrl}" alt="${p.codigo}" />
            ${p.precioVenta > 0 ? `<p class="precio">$${p.precioVenta.toLocaleString("es-CL")}</p>` : ""}
          </div>`);
      }

      win.document.write(`<html>
        <head><title>Nuts 4 You — Catálogo Códigos de Barra</title><style>
          *{margin:0;padding:0;box-sizing:border-box}
          body{font-family:sans-serif;padding:12mm;background:#fff}
          h1{font-size:16px;margin-bottom:8mm;color:#111}
          .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm}
          .card{border:1px solid #ddd;border-radius:8px;padding:10px;text-align:center;break-inside:avoid;page-break-inside:avoid}
          .sigla{font-size:22px;font-weight:900;margin-bottom:2px}
          .nombre{font-size:10px;color:#555;margin-bottom:3px}
          .cat{font-size:9px;color:#999;background:#f5f5f5;border-radius:99px;padding:1px 8px;display:inline-block;margin-bottom:6px}
          img{max-width:100%;height:auto}
          .precio{font-size:12px;font-weight:700;margin-top:5px}
          @media print{body{padding:0}}
        </style></head>
        <body>
          <h1>Nuts 4 You — Catálogo de Códigos de Barra (prefijo 780 Chile)</h1>
          <div class="grid">${tarjetas.join("")}</div>
          <script>window.onload=()=>window.print()</script>
        </body></html>`);
      win.document.close();
      toast.success("Catálogo listo", { id });
    } catch {
      toast.error("Error generando catálogo", { id });
      win.close();
    }
  };

  return (
    <div className="space-y-8">
      {/* Cabecera */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {CATALOGO.length} productos · Prefijo EAN-13 Chile (780) · Temporal hasta producción
        </p>
        <button
          onClick={imprimirTodos}
          className="flex items-center gap-2 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors shrink-0"
        >
          <PrinterCheck size={16} /> Imprimir catálogo completo
        </button>
      </div>

      {/* Grupos por categoría */}
      {CATEGORIAS_ORDEN.map(cat => {
        // Mismo orden que el resto de la app dentro de cada categoría.
        const items = CATALOGO.filter(p => p.categoria === cat)
          .sort((a, b) => compararProductos(
            { productoId: a.id, categoria: a.categoria },
            { productoId: b.id, categoria: b.categoria },
          ));
        return (
          <section key={cat}>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="font-bold">{cat}</h3>
              <span className="text-xs text-muted-foreground">({items.length} ítem{items.length !== 1 ? "s" : ""})</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(p => (
                <TarjetaBarcode key={p.id} producto={p} onMount={registrar} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
