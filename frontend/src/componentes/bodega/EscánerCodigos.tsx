// ─── EscánerCodigos ──────────────────────────────────────────────────────────
// FAB (botón flotante) que abre un bottom sheet con escáner + generador.
// Diseñado mobile-first: el sheet ocupa casi toda la pantalla, deslizable.
//
// Formatos: EAN-13, EAN-8, Code 128, QR, UPC, ITF, Data Matrix, Aztec.
// Generador: crea EAN-13 con prefijo 780 (Chile) + descarga/impresión.

import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, NotFoundException } from "@zxing/library";
import JsBarcode from "jsbarcode";
import {
  ScanBarcode, Barcode, X, Download, Printer,
  RefreshCw, CheckCircle2, AlertCircle, Loader2,
  ChevronDown, Camera, FlaskConical, Package,
  Droplets, ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Tab = "escanear" | "generar";
type TipoProducto = "Mezcla" | "Paquete" | "Líquido" | "Insumo" | "Otro";

interface ResultadoScan { texto: string; formato: string; hora: string }
interface FormGen {
  codigo: string; nombre: string;
  tipo: TipoProducto; info: string; cantidad: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const FORMATOS_SCAN = [
  BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128, BarcodeFormat.UPC_A,
];

const TIPOS: { valor: TipoProducto; icono: React.ReactNode; desc: string }[] = [
  { valor: "Mezcla",  icono: <FlaskConical size={15} />, desc: "MM, MA, MN, MPr, MH" },
  { valor: "Paquete", icono: <Package      size={15} />, desc: "pm, pa, pn, pp" },
  { valor: "Líquido", icono: <Droplets     size={15} />, desc: "AM CG, AM SG, ENE, BEB, KAPO" },
  { valor: "Insumo",  icono: <ShoppingBag  size={15} />, desc: "Art Aseo, Conos, otros" },
  { valor: "Otro",    icono: <Barcode       size={15} />, desc: "Producto genérico" },
];

function fmtBadge(f: string) {
  const m: Record<string, string> = {
    EAN_13:"EAN-13", EAN_8:"EAN-8", CODE_128:"Code 128",
    CODE_39:"Code 39", QR_CODE:"QR", UPC_A:"UPC-A",
    UPC_E:"UPC-E", ITF:"ITF", DATA_MATRIX:"Data Matrix",
  };
  return m[f] ?? f;
}

function validarEAN13(c: string) {
  if (!/^\d{13}$/.test(c)) return false;
  const d = c.split("").map(Number);
  const s = d.slice(0,12).reduce((a,v,i) => a + v*(i%2===0?1:3), 0);
  return (10-(s%10))%10 === d[12];
}

function genEAN13() {
  const base = "780" + Array.from({length:9},()=>Math.floor(Math.random()*10)).join("");
  const d    = base.split("").map(Number);
  const s    = d.reduce((a,v,i)=>a+v*(i%2===0?1:3),0);
  return base + ((10-(s%10))%10);
}

// ─── Modal completo ───────────────────────────────────────────────────────────

interface ModalEscánerProps {
  onCodigoDetectado?: (codigo: string) => void;
}

export function ModalEscáner({ onCodigoDetectado }: ModalEscánerProps = {}) {
  const [abierto, setAbierto] = useState(false);
  const [tab,     setTab]     = useState<Tab>("escanear");

  const cerrar = () => setAbierto(false);

  return (
    <>
      {/* FAB flotante */}
      <button
        onClick={() => setAbierto(true)}
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 active:scale-95 transition-all"
        title="Escáner / Generador de códigos"
      >
        <ScanBarcode size={24} />
      </button>

      {/* Overlay + bottom sheet */}
      {abierto && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/60"
          onClick={cerrar}
        >
          <div
            className="w-full max-h-[94dvh] rounded-t-3xl bg-background shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-300"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle + Header */}
            <div className="shrink-0 px-5 pt-3 pb-2">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Códigos de Barra</h2>
                <button
                  onClick={cerrar}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Tabs internos */}
              <div className="flex gap-1 rounded-xl bg-muted p-1 mt-3">
                <button
                  onClick={() => setTab("escanear")}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors ${
                    tab === "escanear" ? "bg-background shadow text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <Camera size={15} /> Escanear
                </button>
                <button
                  onClick={() => setTab("generar")}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors ${
                    tab === "generar" ? "bg-background shadow text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <Barcode size={15} /> Generar
                </button>
              </div>
            </div>

            {/* Contenido scrollable */}
            <div className="flex-1 overflow-y-auto px-5 pb-8 pt-3">
              {tab === "escanear" && <PanelEscanear onCodigoDetectado={onCodigoDetectado} onCerrarModal={cerrar} />}
              {tab === "generar"  && <PanelGenerar />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Panel Escanear ───────────────────────────────────────────────────────────

function PanelEscanear({ onCodigoDetectado, onCerrarModal }: { onCodigoDetectado?: (codigo: string) => void; onCerrarModal?: () => void }) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const readerRef  = useRef<BrowserMultiFormatReader | null>(null);
  const [activo,   setActivo]   = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [ultimo,   setUltimo]   = useState<ResultadoScan | null>(null);
  const [historial,setHistorial]= useState<ResultadoScan[]>([]);
  const [camaras,  setCamaras]  = useState<MediaDeviceInfo[]>([]);
  const [camaraId, setCamaraId] = useState<string | undefined>();
  const [verHist,  setVerHist]  = useState(false);

  const detener = useCallback(() => {
    BrowserMultiFormatReader.releaseAllStreams();
    readerRef.current = null;
    setActivo(false);
    setCargando(false);
  }, []);

  const iniciar = useCallback(async () => {
    setError(null);
    setCargando(true);

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATOS_SCAN);
    readerRef.current = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 400 });

    try {
      const dispositivos = await BrowserMultiFormatReader.listVideoInputDevices();
      setCamaras(dispositivos);
      const trasera = dispositivos.find(d => /back|rear|environment/i.test(d.label));
      const idCamara = camaraId ?? trasera?.deviceId ?? dispositivos[0]?.deviceId;

      if (!readerRef.current || !videoRef.current) return;

      await readerRef.current.decodeFromVideoDevice(idCamara, videoRef.current, (result, err) => {
        if (result) {
          const r: ResultadoScan = {
            texto:  result.getText(),
            formato: BarcodeFormat[result.getBarcodeFormat()],
            hora:   new Date().toLocaleTimeString("es-CL", { hour:"2-digit", minute:"2-digit", second:"2-digit" }),
          };
          setUltimo(r);
          setHistorial(prev => [r, ...prev.filter(x => x.texto !== r.texto)].slice(0, 20));
          toast.success(r.texto, { description: fmtBadge(r.formato) });
          // Detener escáner tras lectura exitosa para evitar lecturas accidentales
          BrowserMultiFormatReader.releaseAllStreams();
          readerRef.current = null;
          setActivo(false);
          if (onCodigoDetectado) {
            onCerrarModal?.();
            onCodigoDetectado(r.texto);
          }
        }
        if (err && !(err instanceof NotFoundException)) console.warn(err);
      });
      setActivo(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(
        /Permission|NotAllowed/i.test(msg)
          ? "Permiso de cámara denegado. Autoriza el acceso en la configuración del navegador."
          : /NotFound|DevicesNotFound/i.test(msg)
          ? "No se encontró ninguna cámara."
          : `Error de cámara: ${msg}`
      );
    } finally {
      setCargando(false);
    }
  }, [camaraId]);

  useEffect(() => { return () => detener(); }, [detener]);

  return (
    <div className="space-y-4">

      {/* Visor */}
      <div className="relative overflow-hidden rounded-2xl bg-black aspect-[4/3] flex items-center justify-center">
        <video ref={videoRef} className={`w-full h-full object-cover transition-opacity ${activo ? "opacity-100" : "opacity-0"}`} muted playsInline autoPlay />

        {!activo && !cargando && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
            <Camera size={44} className="opacity-30" />
            <p className="text-sm opacity-50">Cámara desactivada</p>
          </div>
        )}

        {cargando && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="flex flex-col items-center gap-2 text-white">
              <Loader2 size={32} className="animate-spin" />
              <p className="text-sm">Iniciando cámara…</p>
            </div>
          </div>
        )}

        {/* Marco de escaneo */}
        {activo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-56 h-28">
              {[["top-0 left-0 border-t border-l rounded-tl-lg",""],
                ["top-0 right-0 border-t border-r rounded-tr-lg",""],
                ["bottom-0 left-0 border-b border-l rounded-bl-lg",""],
                ["bottom-0 right-0 border-b border-r rounded-br-lg",""]
              ].map(([cls],i)=>(
                <div key={i} className={`absolute w-6 h-6 border-white ${cls}`} style={{borderWidth:3}} />
              ))}
              <div className="absolute left-1 right-1 h-0.5 bg-emerald-400/80 animate-scan-line" />
            </div>
          </div>
        )}

        {/* Badge resultado */}
        {ultimo && activo && (
          <div className="absolute bottom-3 inset-x-3 rounded-xl bg-emerald-600/95 backdrop-blur px-3 py-2 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[10px] text-emerald-100 font-bold">{fmtBadge(ultimo.formato)}</p>
              <p className="text-base font-black text-white truncate tabular-nums">{ultimo.texto}</p>
            </div>
            <button onClick={() => setUltimo(null)} className="ml-2 h-7 w-7 flex items-center justify-center rounded-lg bg-white/20 text-white">
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertCircle size={15} className="text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Controles */}
      <div className="flex flex-wrap gap-2">
        {!activo ? (
          <button onClick={iniciar} disabled={cargando}
            className="flex items-center gap-2 h-11 flex-1 rounded-2xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors justify-center">
            <Camera size={16} /> Activar cámara
          </button>
        ) : (
          <>
            <button onClick={detener}
              className="flex items-center gap-2 h-11 px-5 rounded-2xl border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
              <X size={15} /> Detener
            </button>
            <button onClick={() => { detener(); setTimeout(iniciar, 200); }}
              className="flex items-center gap-2 h-11 px-4 rounded-2xl border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
              <RefreshCw size={14} /> Reiniciar
            </button>
          </>
        )}
        {camaras.length > 1 && (
          <select
            value={camaraId ?? ""}
            onChange={e => { setCamaraId(e.target.value); if (activo) { detener(); setTimeout(iniciar, 200); }}}
            className="h-11 rounded-2xl border border-input bg-background px-3 text-sm outline-none flex-1"
          >
            {camaras.map(c => (
              <option key={c.deviceId} value={c.deviceId}>{c.label || `Cámara ${c.deviceId.slice(0,6)}`}</option>
            ))}
          </select>
        )}
      </div>

      {/* Último resultado (sin cámara activa) */}
      {ultimo && !activo && (
        <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3 flex items-center gap-3">
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-semibold">{fmtBadge(ultimo.formato)} · {ultimo.hora}</p>
            <p className="text-lg font-black tabular-nums">{ultimo.texto}</p>
            {ultimo.formato === "EAN_13" && (
              <p className="text-[10px] text-muted-foreground">
                {validarEAN13(ultimo.texto)
                  ? <span className="text-emerald-600">✓ EAN-13 válido{ultimo.texto.startsWith("780") ? " · Prefijo Chile (780)" : ""}</span>
                  : <span className="text-amber-600">⚠ Checksum incorrecto</span>
                }
              </p>
            )}
          </div>
        </div>
      )}

      {/* Historial */}
      {historial.length > 0 && (
        <div className="rounded-2xl border overflow-hidden">
          <button onClick={() => setVerHist(p => !p)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/40 transition-colors">
            <span>Historial ({historial.length})</span>
            <ChevronDown size={15} className={`text-muted-foreground transition-transform ${verHist ? "rotate-180" : ""}`} />
          </button>
          {verHist && (
            <div className="border-t divide-y max-h-52 overflow-y-auto">
              {historial.map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{fmtBadge(r.formato)}</span>
                  <span className="flex-1 font-mono text-sm tabular-nums truncate">{r.texto}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{r.hora}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Panel Generar ────────────────────────────────────────────────────────────

function PanelGenerar() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [form, setForm] = useState<FormGen>({ codigo: genEAN13(), nombre: "", tipo: "Paquete", info: "", cantidad: "" });
  const [generado,    setGenerado]    = useState(false);
  const [errorCodigo, setErrorCodigo] = useState("");

  const set = (k: keyof FormGen, v: string) => {
    setForm(p => ({ ...p, [k]: v }));
    setGenerado(false);
    if (k === "codigo") setErrorCodigo("");
  };

  const generar = () => {
    if (!svgRef.current) return;
    const c = form.codigo;
    if (c.length === 13 && !validarEAN13(c)) { setErrorCodigo("Dígito verificador incorrecto"); return; }

    const formato = /^\d{13}$/.test(c) ? "EAN13" : /^\d{8}$/.test(c) ? "EAN8" : "CODE128";
    try {
      JsBarcode(svgRef.current, c, {
        format: formato, lineColor: "#000", background: "#fff",
        width: 2.5, height: 88, displayValue: true,
        fontSize: 13, margin: 10, textMargin: 6, fontOptions: "bold",
        text: form.nombre
          ? `${c}  ${form.nombre}${form.cantidad ? ` (${form.cantidad})` : ""}`
          : c,
      });
      setGenerado(true);
      toast.success("Código generado");
    } catch { toast.error("Verifica el formato del código"); }
  };

  const descargarPNG = () => {
    if (!svgRef.current) return;
    const svg    = svgRef.current;
    const svgStr = new XMLSerializer().serializeToString(svg);
    const scale  = 3;
    const canvas = document.createElement("canvas");
    canvas.width  = svg.width.baseVal.value  * scale;
    canvas.height = svg.height.baseVal.value * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.download = `barcode-${form.codigo}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = url;
  };

  const imprimir = () => {
    if (!svgRef.current) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>${form.codigo}</title><style>
      body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;padding:20px}
      .info{text-align:center;margin-bottom:12px}.info strong{font-size:18px;display:block}
      .info span{font-size:13px;color:#555;display:block}svg{max-width:100%}
    </style></head><body>
      <div class="info">
        ${form.nombre ? `<strong>${form.nombre}</strong>` : ""}
        ${form.tipo ? `<span>${form.tipo}${form.cantidad ? ` · ${form.cantidad}` : ""}</span>` : ""}
        ${form.info ? `<span style="color:#999;font-size:11px">${form.info}</span>` : ""}
      </div>
      ${new XMLSerializer().serializeToString(svgRef.current)}
      <script>window.onload=()=>window.print()</script>
    </body></html>`);
    win.document.close();
  };

  return (
    <div className="space-y-4">

      {/* Tipo */}
      <div>
        <p className="text-sm font-semibold mb-2">Tipo de producto</p>
        <div className="flex flex-wrap gap-2">
          {TIPOS.map(t => (
            <button key={t.valor} onClick={() => set("tipo", t.valor)}
              className={`flex items-center gap-1.5 h-9 px-3 rounded-xl border text-sm font-semibold transition-colors ${
                form.tipo === t.valor ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/40"
              }`}>
              {t.icono} {t.valor}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 pl-0.5">{TIPOS.find(t=>t.valor===form.tipo)?.desc}</p>
      </div>

      {/* Campos */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Nombre del producto</label>
          <input type="text" placeholder="Ej: Mezcla Maní, Paquete Almendras…"
            value={form.nombre} onChange={e => set("nombre", e.target.value)}
            className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Código EAN-13</label>
            <div className="flex gap-1.5">
              <input type="text" inputMode="numeric" maxLength={13} placeholder="13 dígitos"
                value={form.codigo} onChange={e => set("codigo", e.target.value.replace(/\D/g,"").slice(0,13))}
                className={`flex-1 h-11 rounded-xl border bg-background px-3 text-sm font-mono outline-none focus:ring-2 focus:ring-ring min-w-0 ${errorCodigo ? "border-destructive" : "border-input"}`} />
              <button onClick={() => set("codigo", genEAN13())} title="Generar código"
                className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl border border-input text-muted-foreground hover:bg-muted transition-colors">
                <RefreshCw size={14} />
              </button>
            </div>
            {errorCodigo && <p className="text-xs text-destructive">{errorCodigo}</p>}
            {!errorCodigo && form.codigo.length === 13 && (
              <p className="text-[10px]">
                {validarEAN13(form.codigo)
                  ? <span className="text-emerald-600">✓ Válido{form.codigo.startsWith("780") ? " · Chile" : ""}</span>
                  : <span className="text-amber-600">⚠ Checksum incorrecto</span>}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Cantidad / Unidad</label>
            <input type="text" placeholder="500g, 1L, 19 uds…"
              value={form.cantidad} onChange={e => set("cantidad", e.target.value)}
              className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Info adicional</label>
          <input type="text" placeholder="Lote, proveedor, vencimiento…"
            value={form.info} onChange={e => set("info", e.target.value)}
            className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>

      {/* Generar */}
      <button onClick={generar} disabled={!form.codigo}
        className="w-full h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
        <Barcode size={18} /> Generar código de barras
      </button>

      {/* Preview */}
      <div className={`rounded-2xl border-2 overflow-hidden ${generado ? "border-emerald-500/30 bg-white dark:bg-card" : "border-dashed border-border bg-muted/20"}`}>
        {!generado ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
            <Barcode size={32} className="opacity-20" />
            <p className="text-sm">El código aparecerá aquí</p>
          </div>
        ) : (
          <div className="p-4">
            <div className="text-center mb-3">
              {form.nombre && <p className="font-bold">{form.nombre}</p>}
              <div className="flex items-center justify-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-semibold">{form.tipo}</span>
                {form.cantidad && <span className="text-xs text-muted-foreground">{form.cantidad}</span>}
                {form.info && <span className="text-xs text-muted-foreground">{form.info}</span>}
              </div>
            </div>
            <div className="flex justify-center overflow-x-auto">
              <svg ref={svgRef} className="max-w-full" />
            </div>
            <div className="flex gap-2 mt-4 justify-center">
              <button onClick={descargarPNG}
                className="flex items-center gap-2 h-10 px-4 rounded-xl border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
                <Download size={14} /> PNG
              </button>
              <button onClick={imprimir}
                className="flex items-center gap-2 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
                <Printer size={14} /> Imprimir
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        13 dígitos → EAN-13 · 8 dígitos → EAN-8 · texto → Code 128 · Prefijo 780 = Chile
      </p>
    </div>
  );
}
