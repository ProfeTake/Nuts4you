// Página: Cierre de Caja
//
// Lógica de caja (fiel al Excel del cliente):
//   Total Venta       = stock flow (vendidos × precio)
//   Gastos totales    = Tarjeta + Transferencia + Art Aseo + Líquidos + Otros
//   Esperado en caja  = Total Venta − Gastos totales − Retiros
//   Diferencia        = Efectivo contado − Esperado en caja
//   A DEPOSITAR       = Efectivo contado + Retiros
//
// Tarjeta y Transferencia son GASTOS porque esa plata no está físicamente en caja.

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMenuNav } from "@/componentes/layout/BarraLateral";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatearCLP } from "@/lib/money";
import { useCajaStore } from "@/store/caja.store";
import { useAuthStore } from "@/store/auth.store";
import { productosMock } from "@/datos/mock.datos";
import { Menu, X, Plus, Trash2, AlertTriangle, CreditCard, ArrowLeftRight, Banknote } from "lucide-react";
import type { MovimientoCaja } from "@/tipos/pos.tipos";
import type { CierrePayload } from "@/store/caja.store";
import { movimientoCajaSchema } from "@/validaciones/pos.schema";

// ─── Mapping mezcla → paquete producido ──────────────────────────────────────
// Cada unidad de mezcla cocinada produce N paquetes del tipo correspondiente.

const MEZCLA_A_PAQ: Record<number, { paqId: number; factor: number }> = {
  1: { paqId: 6,  factor: 19 },  // Mezcla Maní      → Paquetes Maní      (×19)
  2: { paqId: 7,  factor: 20 },  // Mezcla Almendras  → Paquetes Almendras (×20)
  3: { paqId: 8,  factor: 20 },  // Mezcla Nueces     → Paquetes Nueces    (×20)
  4: { paqId: 9,  factor: 10 },  // Mezcla Promo      → Promos             (×10)
};

const MEZCLA_IDS  = [1, 2, 3, 4]; // Mezclas que producen paquetes
const PAQUETE_IDS = [6, 7, 8, 9]; // Paquetes derivados de mezclas
const DIRECTO_IDS = [5, 10, 11, 12, 13, 14, 15]; // Mezcla Helado + Líquidos + Helados (venta directa)

// ─── Helpers ─────────────────────────────────────────────────────────────────

const nomProd   = (id: number) => productosMock.find(p => p.id === id)?.nombre ?? `Producto ${id}`;
const precioProd = (id: number) => productosMock.find(p => p.id === id)?.precioVenta ?? 0;

// ─── TIPO_CONFIG ─────────────────────────────────────────────────────────────

type TipoMov = MovimientoCaja["tipo"];

const TIPO_CONFIG: Record<TipoMov, { label: string; bg: string; text: string; signo: "+" | "-" }> = {
  gasto:   { label: "Gasto",   bg: "bg-red-100 dark:bg-red-950/40",         text: "text-red-700 dark:text-red-400",         signo: "-" },
  retiro:  { label: "Retiro",  bg: "bg-orange-100 dark:bg-orange-950/40",   text: "text-orange-700 dark:text-orange-400",   signo: "-" },
  ingreso: { label: "Ingreso", bg: "bg-emerald-100 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", signo: "+" },
};

const CATEGORIAS_GASTO = ["Insumos", "Transporte", "Alimentación", "Servicios", "Limpieza", "Otros"];

// ─── Modal: Gasto / Retiro / Ingreso manual ───────────────────────────────────

interface ModalMovProps {
  tipo: TipoMov;
  onCerrar: () => void;
  onGuardar: (mov: Omit<MovimientoCaja, "id" | "hora">) => void;
}

function ModalMovimiento({ tipo, onCerrar, onGuardar }: ModalMovProps) {
  const cfg = TIPO_CONFIG[tipo];
  const [desc,  setDesc]  = useState("");
  const [cat,   setCat]   = useState(tipo === "gasto" ? CATEGORIAS_GASTO[0] : tipo === "retiro" ? "Retiro de turno" : "Ingreso manual");
  const [monto, setMonto] = useState("");
  const [errores, setErrores] = useState<{ descripcion?: string; monto?: string }>({});

  const guardar = () => {
    const m = parseInt(monto.replace(/\D/g, ""), 10) || 0;
    const result = movimientoCajaSchema.safeParse({ descripcion: desc.trim(), monto: m, categoria: cat });
    if (!result.success) {
      const flat = result.error.flatten().fieldErrors;
      setErrores({
        descripcion: flat.descripcion?.[0],
        monto:       flat.monto?.[0],
      });
      return;
    }
    setErrores({});
    onGuardar({ tipo, descripcion: result.data.descripcion, categoria: result.data.categoria ?? cat, monto: result.data.monto });
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-0 sm:px-4" onClick={onCerrar}>
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border bg-background shadow-2xl flex flex-col max-h-[85dvh]" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-base font-bold">Nuevo {cfg.label}</h3>
          <button onClick={onCerrar} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-4 px-5 py-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Descripción</label>
            <Input
              placeholder={tipo === "gasto" ? "Ej: Bolsa de plástico" : tipo === "retiro" ? "Ej: Retiro para gastos" : "Ej: Ingreso adicional"}
              value={desc}
              onChange={e => { setDesc(e.target.value); setErrores(p => ({ ...p, descripcion: undefined })); }}
              className={errores.descripcion ? "border-destructive" : ""}
            />
            {errores.descripcion && (
              <p className="text-xs text-destructive">{errores.descripcion}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Categoría</label>
            {tipo === "gasto" ? (
              <select value={cat} onChange={e => setCat(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                {CATEGORIAS_GASTO.map(c => <option key={c}>{c}</option>)}
              </select>
            ) : (
              <Input value={cat} onChange={e => setCat(e.target.value)} />
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Monto (CLP)</label>
            <Input
              inputMode="numeric"
              placeholder="$0"
              value={monto ? `$${parseInt(monto.replace(/\D/g, "") || "0", 10).toLocaleString("es-CL")}` : ""}
              onChange={e => { setMonto(e.target.value.replace(/\D/g, "")); setErrores(p => ({ ...p, monto: undefined })); }}
              className={errores.monto ? "border-destructive" : ""}
            />
            {errores.monto && (
              <p className="text-xs text-destructive">{errores.monto}</p>
            )}
          </div>
        </div>
        <div className="shrink-0 flex gap-3 border-t bg-background px-5 py-4">
          <button onClick={onCerrar} className="flex-1 h-11 rounded-xl border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            Cancelar
          </button>
          <button onClick={guardar}
            className={`flex-1 h-11 rounded-xl text-sm font-bold text-white transition-colors ${tipo === "ingreso" ? "bg-emerald-600 hover:bg-emerald-700" : tipo === "retiro" ? "bg-orange-500 hover:bg-orange-600" : "bg-red-500 hover:bg-red-600"}`}>
            Registrar {cfg.label}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Confirmación de cierre ───────────────────────────────────────────

interface ModalCierreProps {
  esperadoCaja: number;
  totalRetiros: number;
  onCerrar: () => void;
  onConfirmar: (efectivoContado: number) => void;
}

function ModalCierre({ esperadoCaja, totalRetiros, onCerrar, onConfirmar }: ModalCierreProps) {
  const [efectivo, setEfectivo] = useState("");
  const [confirmarFaltante, setConfirmarFaltante] = useState(false);

  const efectivoNum  = parseInt(efectivo.replace(/\D/g, ""), 10) || 0;
  const diferencia   = efectivoNum > 0 ? efectivoNum - esperadoCaja : 0;
  const aDepositar   = efectivoNum + totalRetiros;
  const hayFaltante  = efectivoNum > 0 && diferencia < 0;

  const handleConfirmar = () => {
    if (hayFaltante && !confirmarFaltante) { setConfirmarFaltante(true); return; }
    onConfirmar(efectivoNum);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-0 sm:px-4" onClick={onCerrar}>
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border bg-background shadow-2xl max-h-[85dvh] flex flex-col" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
          <div>
            <p className="text-xs text-muted-foreground">Confirmar</p>
            <h3 className="text-base font-bold">Cierre de Turno</h3>
          </div>
          <button onClick={onCerrar} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X size={18} /></button>
        </div>

        {confirmarFaltante ? (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40">
                  <AlertTriangle size={32} className="text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h4 className="text-lg font-bold">¿Está bien contado el efectivo?</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Faltante de <span className="font-bold text-red-600">{formatearCLP(Math.abs(diferencia))}</span> vs. lo esperado en caja.
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border-2 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-4 space-y-2 text-sm">
                <FilaCierre label="Esperado en caja"  valor={formatearCLP(esperadoCaja)} />
                <FilaCierre label="Efectivo contado"  valor={formatearCLP(efectivoNum)} />
                <div className="border-t pt-2 flex justify-between font-bold text-red-600">
                  <span>Faltante</span>
                  <span className="tabular-nums">{formatearCLP(Math.abs(diferencia))}</span>
                </div>
              </div>
              <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-4 py-3">
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed font-medium">
                  El faltante quedará registrado y será reportado al supervisor o administrador.
                </p>
              </div>
            </div>
            <div className="flex gap-3 border-t px-5 py-4 shrink-0">
              <button onClick={() => setConfirmarFaltante(false)} className="flex-1 h-12 rounded-xl border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
                No, revisar
              </button>
              <button onClick={() => onConfirmar(efectivoNum)} className="flex-1 h-12 rounded-xl bg-red-600 text-sm font-bold text-white hover:bg-red-700 transition-colors">
                Sí, confirmar cierre
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

              {/* Referencia */}
              <div className="rounded-xl bg-muted/40 px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Esperado en caja</span>
                <span className="text-sm font-bold tabular-nums text-foreground">{formatearCLP(esperadoCaja)}</span>
              </div>

              {/* Efectivo contado */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/40">
                    <Banknote size={16} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <label className="text-sm font-bold text-foreground">Efectivo contado en caja</label>
                </div>
                <Input
                  inputMode="numeric" placeholder="$0"
                  className="text-right h-14 text-xl font-black"
                  value={efectivo ? `$${efectivoNum.toLocaleString("es-CL")}` : ""}
                  onChange={e => setEfectivo(e.target.value.replace(/\D/g, ""))}
                  onFocus={e => (e.target as HTMLInputElement).select()}
                  autoFocus
                />
              </div>

              {/* Resultado */}
              {efectivoNum > 0 && (
                <div className="space-y-2">
                  <div className={`rounded-xl border-2 p-4 ${!hayFaltante ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20" : "border-red-500 bg-red-50 dark:bg-red-950/20"}`}>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Diferencia</p>
                    <p className={`text-2xl font-extrabold tabular-nums ${!hayFaltante ? "text-emerald-600" : "text-red-600"}`}>
                      {diferencia >= 0 ? "+" : ""}{formatearCLP(diferencia)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {!hayFaltante ? "✓ Cuadre correcto" : "Faltante — se reportará al supervisor"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-primary/5 border-2 border-primary/20 p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">A depositar</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Efectivo ({formatearCLP(efectivoNum)}) + Retiros ({formatearCLP(totalRetiros)})</p>
                    </div>
                    <p className="text-2xl font-extrabold tabular-nums text-primary">{formatearCLP(aDepositar)}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 border-t px-5 py-4 shrink-0">
              <button onClick={onCerrar} className="flex-1 h-11 rounded-xl border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleConfirmar}
                disabled={efectivoNum === 0}
                className={`flex-1 h-11 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-40 ${hayFaltante ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-primary/90"}`}
              >
                {hayFaltante ? "Confirmar con faltante →" : "Confirmar Cierre"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FilaCierre({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{valor}</span>
    </div>
  );
}

function FilaResumen({ label, valor, claseValor = "text-foreground" }: { label: string; valor: string; claseValor?: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${claseValor}`}>{valor}</span>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CierreCaja() {
  const { abrirMenu } = useMenuNav();
  const navigate = useNavigate();

  const { inventarioInicial, movimientos, agregarMovimiento, eliminarMovimiento, cerrarTurno } = useCajaStore();
  const cerrarSesion = useAuthStore(s => s.cerrarSesion);

  const [modalAbierto, setModalAbierto] = useState<TipoMov | "cierre" | null>(null);

  // ── Pagos sin efectivo (se descuentan como gastos) ───────────────────────
  const [tarjeta,       setTarjeta]       = useState("");
  const [transferencia, setTransferencia] = useState("");

  const tarjetaNum       = parseInt(tarjeta.replace(/\D/g, ""), 10)       || 0;
  const transferenciaNum = parseInt(transferencia.replace(/\D/g, ""), 10) || 0;

  // ── Estado del conteo de cierre ───────────────────────────────────────────
  const [cocinadas, setCocinadas] = useState<Record<number, string>>(
    () => Object.fromEntries(MEZCLA_IDS.map(id => [id, ""]))
  );
  const [saldosFinales, setSaldosFinales] = useState<Record<number, string>>(
    () => Object.fromEntries([...PAQUETE_IDS, ...DIRECTO_IDS].map(id => [id, ""]))
  );

  const setCocStr  = (id: number, v: string) => setCocinadas(p => ({ ...p, [id]: v.replace(/\D/g, "") }));
  const setFinStr  = (id: number, v: string) => setSaldosFinales(p => ({ ...p, [id]: v.replace(/\D/g, "") }));

  // ── Cálculos derivados ────────────────────────────────────────────────────

  // Unidades de mezcla cocinadas (número)
  const cocinadasNums = useMemo(() =>
    MEZCLA_IDS.reduce((acc, id) => {
      acc[id] = parseInt(cocinadas[id] || "0", 10) || 0;
      return acc;
    }, {} as Record<number, number>)
  , [cocinadas]);

  // Paquetes producidos por mezcla
  const produccionPorPaq = useMemo(() =>
    MEZCLA_IDS.reduce((acc, mId) => {
      const { paqId, factor } = MEZCLA_A_PAQ[mId];
      acc[paqId] = cocinadasNums[mId] * factor;
      return acc;
    }, {} as Record<number, number>)
  , [cocinadasNums]);

  // Total disponible por producto al inicio del turno (incluyendo producción)
  const disponiblePorProd = useMemo(() => {
    const r: Record<number, number> = {};
    [...PAQUETE_IDS, ...DIRECTO_IDS].forEach(id => {
      const item = inventarioInicial.find(i => i.productoId === id);
      r[id] = (item?.inicio ?? 0) + (item?.ingreso ?? 0) + (produccionPorPaq[id] ?? 0);
    });
    return r;
  }, [inventarioInicial, produccionPorPaq]);

  // Unidades vendidas = disponible - saldo final (null si saldo no ingresado aún)
  const vendidosPorProd = useMemo(() => {
    const r: Record<number, number | null> = {};
    [...PAQUETE_IDS, ...DIRECTO_IDS].forEach(id => {
      const finStr = saldosFinales[id];
      const fin = finStr !== "" ? parseInt(finStr, 10) : NaN;
      r[id] = isNaN(fin) ? null : Math.max(0, disponiblePorProd[id] - fin);
    });
    return r;
  }, [disponiblePorProd, saldosFinales]);

  // Stock final por producto para persistir al cerrar (será el inicio del turno siguiente)
  const stockFinalArray = useMemo(() => {
    const items: { productoId: number; cantidad: number }[] = [];
    // Paquetes + directo: saldo final ingresado por el vendedor
    [...PAQUETE_IDS, ...DIRECTO_IDS].forEach(id => {
      const finStr = saldosFinales[id];
      if (finStr !== "") items.push({ productoId: id, cantidad: parseInt(finStr, 10) || 0 });
    });
    // Mezclas: saldo restante = disponible − cocinadas
    MEZCLA_IDS.forEach(mId => {
      const item = inventarioInicial.find(i => i.productoId === mId);
      const disp  = (item?.inicio ?? 0) + (item?.ingreso ?? 0);
      const saldo = Math.max(0, disp - cocinadasNums[mId]);
      items.push({ productoId: mId, cantidad: saldo });
    });
    return items;
  }, [saldosFinales, cocinadasNums, inventarioInicial]);

  // Total recaudado calculado
  const totalVentaCalculada = useMemo(() =>
    [...PAQUETE_IDS, ...DIRECTO_IDS].reduce((sum, id) => {
      const v = vendidosPorProd[id];
      return v !== null ? sum + v * precioProd(id) : sum;
    }, 0)
  , [vendidosPorProd]);

  // ── Movimientos ───────────────────────────────────────────────────────────

  const totalGastosLibres = movimientos.filter(m => m.tipo === "gasto").reduce((s, m) => s + m.monto, 0);
  const totalRetiros      = movimientos.filter(m => m.tipo === "retiro").reduce((s, m) => s + m.monto, 0);
  const totalGastos       = tarjetaNum + transferenciaNum + totalGastosLibres;
  const esperadoCaja      = totalVentaCalculada - totalGastos - totalRetiros;

  // ── Cierre ────────────────────────────────────────────────────────────────

  const confirmarCierre = (efectivoContado: number) => {
    const diferencia = efectivoContado - esperadoCaja;
    const payload: CierrePayload = {
      efectivoContado,
      ventaEfectivo:      Math.max(0, esperadoCaja),
      ventaTarjeta:       tarjetaNum,
      ventaTransferencia: transferenciaNum,
      totalCalculado:     totalVentaCalculada,
      diferenciaCaja:     diferencia,
      stockFinal:         stockFinalArray,
    };
    cerrarTurno(payload);
    toast.success("Turno cerrado correctamente", { description: "Redirigiendo al login…" });
    setTimeout(() => { cerrarSesion(); navigate("/login", { replace: true }); }, 1200);
  };

  const fechaHoy = new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "2-digit" });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">

      {/* Header móvil */}
      <header className="flex items-center gap-3 border-b bg-background px-4 py-3 lg:hidden shrink-0">
        <button onClick={abrirMenu} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
          <Menu size={20} />
        </button>
        <span className="text-base font-semibold">Cierre de Caja</span>
      </header>
      <div className="hidden lg:flex items-baseline px-6 pt-5 pb-1 shrink-0">
        <h1 className="text-xl font-bold">Cierre de Caja</h1>
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-5 pt-3">

        {/* ── SECCIÓN: CONTEO DE CIERRE ── */}
        <section>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            Conteo de Cierre
          </p>

          {/* Tabla mezclas (cocinadas) */}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/40">
                <td colSpan={4} className="border border-border px-2 py-1.5 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Fecha:</span> {fechaHoy}
                </td>
              </tr>
              <tr className="bg-muted/50">
                <td colSpan={4} className="border border-border px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Mezclas cocinadas
                </td>
              </tr>
              <tr className="bg-muted">
                <th className="border border-border px-2 py-1.5 text-left   text-[10px] font-bold uppercase">ITEM</th>
                <th className="w-14 border border-border px-1 py-1.5 text-center text-[10px] font-bold uppercase">DISP.</th>
                <th className="w-16 border border-border px-1 py-1.5 text-center text-[10px] font-bold uppercase">COCINADAS</th>
                <th className="w-14 border border-border px-1 py-1.5 text-center text-[10px] font-bold uppercase">SALDO</th>
              </tr>
            </thead>
            <tbody>
              {MEZCLA_IDS.map(id => {
                const item   = inventarioInicial.find(i => i.productoId === id);
                const disp   = (item?.inicio ?? 0) + (item?.ingreso ?? 0);
                const coc    = cocinadasNums[id];
                const saldo  = Math.max(0, disp - coc);
                return (
                  <tr key={id} className="bg-background">
                    <td className="border border-border px-2 py-1.5 font-medium text-foreground">{nomProd(id)}</td>
                    <td className="border border-border px-1 py-1.5 text-center text-sm tabular-nums text-muted-foreground bg-muted/20">{disp}</td>
                    <td className="border border-border p-0.5">
                      <input
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        value={cocinadas[id] ?? ""} placeholder="0"
                        onChange={e => setCocStr(id, e.target.value)}
                        className="w-full rounded bg-transparent py-1.5 text-center text-sm font-semibold tabular-nums outline-none focus:bg-primary/5 focus:ring-1 focus:ring-primary/40"
                      />
                    </td>
                    <td className="border border-border px-1 py-1.5 text-center text-sm tabular-nums font-semibold bg-muted/20">{saldo}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Tabla paquetes y promos (saldo final) */}
          <table className="w-full border-collapse text-sm mt-3">
            <thead>
              <tr className="bg-muted/50">
                <td colSpan={4} className="border border-border px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Paquetes y Promos
                </td>
              </tr>
              <tr className="bg-muted">
                <th className="border border-border px-2 py-1.5 text-left   text-[10px] font-bold uppercase">ITEM</th>
                <th className="w-14 border border-border px-1 py-1.5 text-center text-[10px] font-bold uppercase">DISP.</th>
                <th className="w-16 border border-border px-1 py-1.5 text-center text-[10px] font-bold uppercase">SALDO FIN.</th>
                <th className="w-16 border border-border px-1 py-1.5 text-center text-[10px] font-bold uppercase text-primary">VENDIDOS</th>
              </tr>
            </thead>
            <tbody>
              {PAQUETE_IDS.map(id => {
                const disp = disponiblePorProd[id];
                const vend = vendidosPorProd[id];
                const prod = produccionPorPaq[id] ?? 0;
                return (
                  <tr key={id} className="bg-background">
                    <td className="border border-border px-2 py-1.5">
                      <span className="font-medium text-foreground">{nomProd(id)}</span>
                      {prod > 0 && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">(+{prod} prod.)</span>
                      )}
                    </td>
                    <td className="border border-border px-1 py-1.5 text-center text-sm tabular-nums text-muted-foreground bg-muted/20">{disp}</td>
                    <td className="border border-border p-0.5">
                      <input
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        value={saldosFinales[id] ?? ""} placeholder="0"
                        onChange={e => setFinStr(id, e.target.value)}
                        className="w-full rounded bg-transparent py-1.5 text-center text-sm font-semibold tabular-nums outline-none focus:bg-primary/5 focus:ring-1 focus:ring-primary/40"
                      />
                    </td>
                    <td className={`border border-border px-1 py-1.5 text-center text-sm tabular-nums font-bold ${vend !== null ? "text-primary bg-primary/5" : "text-muted-foreground bg-muted/20"}`}>
                      {vend !== null ? vend : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Tabla líquidos y Mezcla Helado (saldo final) */}
          <table className="w-full border-collapse text-sm mt-3">
            <thead>
              <tr className="bg-muted/50">
                <td colSpan={4} className="border border-border px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Líquidos y Mezcla Directa
                </td>
              </tr>
              <tr className="bg-muted">
                <th className="border border-border px-2 py-1.5 text-left   text-[10px] font-bold uppercase">ITEM</th>
                <th className="w-14 border border-border px-1 py-1.5 text-center text-[10px] font-bold uppercase">DISP.</th>
                <th className="w-16 border border-border px-1 py-1.5 text-center text-[10px] font-bold uppercase">SALDO FIN.</th>
                <th className="w-16 border border-border px-1 py-1.5 text-center text-[10px] font-bold uppercase text-primary">VENDIDOS</th>
              </tr>
            </thead>
            <tbody>
              {DIRECTO_IDS.map(id => {
                const disp = disponiblePorProd[id];
                const vend = vendidosPorProd[id];
                return (
                  <tr key={id} className="bg-background">
                    <td className="border border-border px-2 py-1.5 font-medium text-foreground">{nomProd(id)}</td>
                    <td className="border border-border px-1 py-1.5 text-center text-sm tabular-nums text-muted-foreground bg-muted/20">{disp}</td>
                    <td className="border border-border p-0.5">
                      <input
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        value={saldosFinales[id] ?? ""} placeholder="0"
                        onChange={e => setFinStr(id, e.target.value)}
                        className="w-full rounded bg-transparent py-1.5 text-center text-sm font-semibold tabular-nums outline-none focus:bg-primary/5 focus:ring-1 focus:ring-primary/40"
                      />
                    </td>
                    <td className={`border border-border px-1 py-1.5 text-center text-sm tabular-nums font-bold ${vend !== null ? "text-primary bg-primary/5" : "text-muted-foreground bg-muted/20"}`}>
                      {vend !== null ? vend : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* ── SECCIÓN: RESUMEN DE VENTAS CALCULADAS ── */}
        <section>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            Ventas Calculadas
          </p>
          <div className="rounded-xl border bg-card overflow-hidden">
            {[...PAQUETE_IDS, ...DIRECTO_IDS].map(id => {
              const v = vendidosPorProd[id];
              if (!v) return null;
              const precio = precioProd(id);
              return (
                <div key={id} className="flex items-center justify-between px-3 py-2 border-b border-border/50 last:border-b-0">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-foreground">{nomProd(id)}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{v} × {formatearCLP(precio)}</span>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums ml-2">{formatearCLP(v * precio)}</span>
                </div>
              );
            })}
            {totalVentaCalculada === 0 && (
              <div className="flex h-12 items-center justify-center text-sm text-muted-foreground">
                Completa el conteo para ver las ventas
              </div>
            )}
            <div className="flex items-center justify-between px-3 py-3 bg-primary/5 border-t-2 border-primary/20">
              <span className="text-sm font-bold">Total recaudado</span>
              <span className="text-lg font-extrabold tabular-nums text-primary">{formatearCLP(totalVentaCalculada)}</span>
            </div>
          </div>
        </section>

        {/* ── SECCIÓN: PAGOS SIN EFECTIVO (se descuentan como gastos) ── */}
        <section>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            Pagos sin efectivo
          </p>
          <div className="rounded-xl border bg-card overflow-hidden divide-y divide-border/60">

            {/* Tarjeta */}
            <div className="flex items-center gap-3 px-3 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/40">
                <CreditCard size={15} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Tarjeta / Débito</p>
                <p className="text-[10px] text-muted-foreground">Se descuenta de la caja — no es efectivo físico</p>
              </div>
              <input
                type="text" inputMode="numeric"
                placeholder="$0"
                value={tarjeta ? `$${tarjetaNum.toLocaleString("es-CL")}` : ""}
                onChange={e => setTarjeta(e.target.value.replace(/\D/g, ""))}
                onFocus={e => e.target.select()}
                className="w-28 h-10 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 text-right px-3 text-sm font-bold tabular-nums text-blue-700 dark:text-blue-300 outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Transferencia */}
            <div className="flex items-center gap-3 px-3 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-950/40">
                <ArrowLeftRight size={15} className="text-violet-600 dark:text-violet-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Transferencia</p>
                <p className="text-[10px] text-muted-foreground">Se descuenta de la caja — no es efectivo físico</p>
              </div>
              <input
                type="text" inputMode="numeric"
                placeholder="$0"
                value={transferencia ? `$${transferenciaNum.toLocaleString("es-CL")}` : ""}
                onChange={e => setTransferencia(e.target.value.replace(/\D/g, ""))}
                onFocus={e => e.target.select()}
                className="w-28 h-10 rounded-xl border-2 border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20 text-right px-3 text-sm font-bold tabular-nums text-violet-700 dark:text-violet-300 outline-none focus:border-violet-500 transition-colors"
              />
            </div>
          </div>
        </section>

        {/* ── SECCIÓN: GASTOS Y RETIROS DEL TURNO ── */}
        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Gastos y Retiros</p>
            <div className="flex gap-1.5">
              <BtnMov label="Gasto"   color="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"       onClick={() => setModalAbierto("gasto")} />
              <BtnMov label="Retiro"  color="border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-400 dark:hover:bg-orange-950/30" onClick={() => setModalAbierto("retiro")} />
              <BtnMov label="Ingreso" color="border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/30" onClick={() => setModalAbierto("ingreso")} />
            </div>
          </div>

          {movimientos.length === 0 && (
            <div className="flex h-12 items-center justify-center text-sm text-muted-foreground border border-dashed rounded-xl">
              Sin movimientos registrados
            </div>
          )}

          <div className="space-y-1.5">
            {[...movimientos].reverse().map(m => {
              const cfg = TIPO_CONFIG[m.tipo];
              return (
                <div key={m.id} className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-card px-3 py-2">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{m.descripcion}</p>
                    <p className="text-[10px] text-muted-foreground">{m.categoria} · {m.hora}</p>
                  </div>
                  <span className={`shrink-0 tabular-nums text-sm font-bold ${cfg.text}`}>
                    {cfg.signo}{formatearCLP(m.monto)}
                  </span>
                  {m.id !== 1 && (
                    <button onClick={() => { eliminarMovimiento(m.id); toast.info("Movimiento eliminado"); }}
                      className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── SECCIÓN: RESUMEN CUADRE ── */}
        {totalVentaCalculada > 0 && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">
              Cuadre de Caja
            </p>
            <div className="rounded-xl border bg-card overflow-hidden divide-y divide-border/60 text-sm">
              <FilaResumen label="Total venta (stock flow)"  valor={formatearCLP(totalVentaCalculada)} />
              {tarjetaNum > 0       && <FilaResumen label="− Tarjeta / Débito"     valor={`-${formatearCLP(tarjetaNum)}`}       claseValor="text-blue-600" />}
              {transferenciaNum > 0 && <FilaResumen label="− Transferencia"        valor={`-${formatearCLP(transferenciaNum)}`} claseValor="text-violet-600" />}
              {totalGastosLibres > 0 && <FilaResumen label="− Gastos (Art Aseo, etc.)" valor={`-${formatearCLP(totalGastosLibres)}`} claseValor="text-red-600" />}
              {totalRetiros > 0     && <FilaResumen label="− Retiros"              valor={`-${formatearCLP(totalRetiros)}`}      claseValor="text-orange-600" />}
              <div className="flex items-center justify-between px-3 py-3 bg-primary/5">
                <span className="font-bold text-foreground">Esperado en caja</span>
                <span className={`font-extrabold tabular-nums text-base ${esperadoCaja >= 0 ? "text-primary" : "text-destructive"}`}>
                  {formatearCLP(esperadoCaja)}
                </span>
              </div>
            </div>
          </section>
        )}

      </div>

      {/* Botón cierre (fijo abajo) */}
      <div className="shrink-0 border-t bg-background px-4 py-4">
        <button
          onClick={() => setModalAbierto("cierre")}
          className="w-full h-12 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 active:scale-[.98] transition-all shadow"
        >
          Cerrar Caja
        </button>
      </div>

      {/* Modales */}
      {(modalAbierto === "gasto" || modalAbierto === "retiro" || modalAbierto === "ingreso") && (
        <ModalMovimiento
          tipo={modalAbierto}
          onCerrar={() => setModalAbierto(null)}
          onGuardar={mov => {
            agregarMovimiento(mov);
            toast.success(`${TIPO_CONFIG[mov.tipo].label} registrado`, {
              description: `${mov.descripcion} · ${formatearCLP(mov.monto)}`,
            });
          }}
        />
      )}
      {modalAbierto === "cierre" && (
        <ModalCierre
          esperadoCaja={esperadoCaja}
          totalRetiros={totalRetiros}
          onCerrar={() => setModalAbierto(null)}
          onConfirmar={confirmarCierre}
        />
      )}
    </div>
  );
}

// ─── Componente auxiliar ─────────────────────────────────────────────────────

function BtnMov({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1 h-8 px-2.5 rounded-lg border text-xs font-semibold transition-colors ${color}`}>
      <Plus size={13} strokeWidth={2.5} />
      {label}
    </button>
  );
}
