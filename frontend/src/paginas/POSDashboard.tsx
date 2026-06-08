// Página: Turno Activo
//
// Pantalla principal del vendedor — dos zonas:
//   1. Scroll: conteo de stock (mezclas, paquetes, líquidos)
//   2. Barra fija inferior: total calculado + botón "Cuadrar Caja"
//
// Al tocar "Cuadrar Caja" sube un panel (bottom sheet) con:
//   efectivo, tarjeta, transferencia, gastos/retiros y cuadre en tiempo real.

import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMenuNav } from "@/componentes/layout/BarraLateral";
import { formatearCLP } from "@/lib/money";
import { useCajaStore } from "@/store/caja.store";
import type { CierrePayload } from "@/store/caja.store";
import { useAuthStore } from "@/store/auth.store";
import { productosMock } from "@/datos/mock.datos";
import { movimientoCajaSchema } from "@/validaciones/pos.schema";
import type { MovimientoCaja } from "@/tipos/pos.tipos";
import { toast } from "sonner";
import {
  Menu, Minus, Plus, ChevronDown, ChevronUp,
  CreditCard, ArrowLeftRight, Banknote,
  X, Trash2, AlertTriangle, Camera, ZoomIn,
  Calculator,
} from "lucide-react";
import { Input } from "@/components/ui/input";

// ─── Constantes ───────────────────────────────────────────────────────────────

const MEZCLA_A_PAQ: Record<number, { paqId: number; factor: number }> = {
  1: { paqId: 6,  factor: 19 },
  2: { paqId: 7,  factor: 20 },
  3: { paqId: 8,  factor: 20 },
  4: { paqId: 9,  factor: 10 },
};

const MEZCLA_IDS  = [1, 2, 3, 4];
const PAQUETE_IDS = [6, 7, 8, 9];
const DIRECTO_IDS = [5, 10, 11, 12, 13, 14, 15];

const nomProd    = (id: number) => productosMock.find(p => p.id === id)?.nombre ?? `#${id}`;
const precioProd = (id: number) => productosMock.find(p => p.id === id)?.precioVenta ?? 0;

type TipoMov = MovimientoCaja["tipo"];

const TIPO_CONFIG: Record<TipoMov, { label: string; bg: string; text: string; signo: "+" | "-" }> = {
  gasto:   { label: "Gasto",   bg: "bg-red-100 dark:bg-red-950/40",         text: "text-red-700 dark:text-red-400",         signo: "-" },
  retiro:  { label: "Retiro",  bg: "bg-orange-100 dark:bg-orange-950/40",   text: "text-orange-700 dark:text-orange-400",   signo: "-" },
  ingreso: { label: "Ingreso", bg: "bg-emerald-100 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", signo: "+" },
};

const CATEGORIAS_GASTO = ["Art Aseo", "Líquidos", "Alimentación", "Transporte", "Otros"];

// ─── Componente principal ─────────────────────────────────────────────────────

export default function POSDashboard() {
  const { abrirMenu }  = useMenuNav();
  const navigate       = useNavigate();
  const cerrarSesion   = useAuthStore(s => s.cerrarSesion);
  const usuario        = useAuthStore(s => s.usuario);
  const puedeEliminar  = usuario?.rol === "ADMIN" || usuario?.rol === "SUPERVISOR";

  const {
    inventarioInicial, turno,
    movimientos, agregarMovimiento, eliminarMovimiento, cerrarTurno,
    cargarGastosDesdeAPI,
  } = useCajaStore();

  // Carga gastos persistidos en BD al montar (recupera estado si el vendedor refresca)
  useEffect(() => {
    if (turno?.id) cargarGastosDesdeAPI(turno.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turno?.id]);

  // ── Stock ────────────────────────────────────────────────────────────────
  const [cocinadasHoy, setCocinadasHoy] = useState<Record<number, number>>(
    () => Object.fromEntries(MEZCLA_IDS.map(id => [id, 0]))
  );
  const [stockActual, setStockActual] = useState<Record<number, string>>(
    () => Object.fromEntries([...PAQUETE_IDS, ...DIRECTO_IDS].map(id => [id, ""]))
  );
  const [seccionExpand, setSeccionExpand] = useState<Record<string, boolean>>({
    mezclas: true, paquetes: true, liquidos: true,
  });

  // ── Panel cuadre ─────────────────────────────────────────────────────────
  const [cuadreAbierto, setCuadreAbierto] = useState(false);

  // ── Campos del cuadre ────────────────────────────────────────────────────
  const [efectivo,      setEfectivo]      = useState("");
  const [tarjeta,       setTarjeta]       = useState("");
  const [transferencia, setTransferencia] = useState("");
  const [boucherUrl,    setBoucherUrl]    = useState<string | null>(null);
  const [verBoucher,    setVerBoucher]    = useState(false);
  const [modalMov,      setModalMov]      = useState<TipoMov | null>(null);
  const [confirmando,   setConfirmando]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const efectivoNum      = parseInt(efectivo.replace(/\D/g, ""), 10)       || 0;
  const tarjetaNum       = parseInt(tarjeta.replace(/\D/g, ""), 10)        || 0;
  const transferenciaNum = parseInt(transferencia.replace(/\D/g, ""), 10)  || 0;

  const toggleSeccion = (k: string) => setSeccionExpand(p => ({ ...p, [k]: !p[k] }));

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (boucherUrl) URL.revokeObjectURL(boucherUrl);
    setBoucherUrl(URL.createObjectURL(file));
    e.target.value = "";
  };

  const fmtCLP = (v: string) => {
    const n = parseInt(v.replace(/\D/g, ""), 10);
    return n > 0 ? `$${n.toLocaleString("es-CL")}` : "";
  };

  // ── Cálculos de inventario ────────────────────────────────────────────────

  const invItem = (id: number) =>
    inventarioInicial.find(i => i.productoId === id) ?? { inicio: 0, ingreso: 0 };

  const produccionPorPaq = useMemo(() =>
    MEZCLA_IDS.reduce((acc, mId) => {
      const { paqId, factor } = MEZCLA_A_PAQ[mId];
      acc[paqId] = cocinadasHoy[mId] * factor;
      return acc;
    }, {} as Record<number, number>)
  , [cocinadasHoy]);

  const disponible = useMemo(() => {
    const r: Record<number, number> = {};
    [...PAQUETE_IDS, ...DIRECTO_IDS].forEach(id => {
      const it = invItem(id);
      r[id] = it.inicio + it.ingreso + (produccionPorPaq[id] ?? 0);
    });
    return r;
  }, [inventarioInicial, produccionPorPaq]);

  const estVendidos = useMemo(() => {
    const r: Record<number, number | null> = {};
    [...PAQUETE_IDS, ...DIRECTO_IDS].forEach(id => {
      const s = stockActual[id];
      const n = s !== "" ? parseInt(s, 10) : NaN;
      r[id] = isNaN(n) ? null : Math.max(0, disponible[id] - n);
    });
    return r;
  }, [disponible, stockActual]);

  const estTotal = useMemo(() =>
    [...PAQUETE_IDS, ...DIRECTO_IDS].reduce((sum, id) => {
      const v = estVendidos[id];
      return v !== null ? sum + v * precioProd(id) : sum;
    }, 0)
  , [estVendidos]);

  // ── Cálculos de caja ──────────────────────────────────────────────────────

  const totalGastosLibres = movimientos.filter(m => m.tipo === "gasto").reduce((s, m) => s + m.monto, 0);
  const totalRetiros      = movimientos.filter(m => m.tipo === "retiro").reduce((s, m) => s + m.monto, 0);
  const totalIngresos     = movimientos.filter(m => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
  const totalGastos       = tarjetaNum + transferenciaNum + totalGastosLibres;
  // ventaEfectivoPura = solo la porción de ventas cobrada en efectivo (para contabilidad)
  const ventaEfectivoPura = Math.max(0, estTotal - totalGastos - totalRetiros);
  // esperadoCaja = todo el efectivo físico que debería haber en caja (ventas + saldo apertura + otros ingresos)
  const esperadoCaja      = ventaEfectivoPura + totalIngresos;
  const diferencia        = efectivoNum > 0 ? efectivoNum - esperadoCaja : null;
  const aDepositar        = efectivoNum > 0 ? efectivoNum + totalRetiros : null;
  const hayFaltante       = diferencia !== null && diferencia < 0;

  // ── Stock final para cerrar ───────────────────────────────────────────────

  const stockFinalArray = useMemo(() => {
    const items: { productoId: number; cantidad: number }[] = [];
    [...PAQUETE_IDS, ...DIRECTO_IDS].forEach(id => {
      const s = stockActual[id];
      if (s !== "") items.push({ productoId: id, cantidad: parseInt(s, 10) || 0 });
    });
    MEZCLA_IDS.forEach(mId => {
      const it    = invItem(mId);
      const saldo = Math.max(0, it.inicio + it.ingreso - cocinadasHoy[mId]);
      items.push({ productoId: mId, cantidad: saldo });
    });
    return items;
  }, [stockActual, cocinadasHoy, inventarioInicial]);

  // ── Cierre ────────────────────────────────────────────────────────────────

  const ejecutarCierre = () => {
    const payload: CierrePayload = {
      efectivoContado:    efectivoNum,
      ventaEfectivo:      ventaEfectivoPura,
      ventaTarjeta:       tarjetaNum,
      ventaTransferencia: transferenciaNum,
      totalCalculado:     estTotal,
      diferenciaCaja:     diferencia ?? 0,
      stockFinal:         stockFinalArray,
    };
    cerrarTurno(payload);
    toast.success("Turno cerrado correctamente", { description: "Redirigiendo al login…" });
    setTimeout(() => { cerrarSesion(); navigate("/login", { replace: true }); }, 1200);
  };

  const horaApertura = turno?.fechaApertura
    ? new Date(turno.fechaApertura).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
    : "—";

  const setSto = (id: number, v: string) =>
    setStockActual(p => ({ ...p, [id]: v.replace(/\D/g, "") }));

  const cambiarCocinadas = (id: number, delta: number) => {
    const item = invItem(id);
    const max  = item.inicio + item.ingreso;
    setCocinadasHoy(p => ({ ...p, [id]: Math.min(max, Math.max(0, (p[id] ?? 0) + delta)) }));
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-muted/30">

      {/* Header */}
      <header className="flex items-center gap-3 border-b bg-background px-4 py-3 shrink-0">
        <button onClick={abrirMenu} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted lg:hidden">
          <Menu size={22} />
        </button>
        <span className="text-base font-bold text-foreground lg:hidden">Turno Activo</span>
        <h1 className="hidden lg:block text-xl font-bold">Turno Activo</h1>
      </header>

      {/* Info strip */}
      <div className="bg-background border-b px-4 py-3 shrink-0">
        <div className="flex items-center gap-4 text-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Apertura</p>
            <p className="font-bold tabular-nums text-foreground">{horaApertura}</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Turno</p>
            <p className="font-bold text-foreground">{turno?.id ? `#${turno.id}` : "—"}</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Saldo inicio</p>
            <p className="font-bold tabular-nums text-foreground">{formatearCLP(turno?.saldoInicial ?? 0)}</p>
          </div>
        </div>
      </div>

      {/* ── ZONA DE CONTEO (scrollable) ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-4 space-y-4 pb-4">

          {/* Mezclas cocinadas */}
          <div className="rounded-2xl bg-background border overflow-hidden shadow-sm">
            <button onClick={() => toggleSeccion("mezclas")} className="w-full flex items-center justify-between px-4 py-3.5 border-b">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-sm font-bold uppercase tracking-wide">Mezclas cocinadas hoy</span>
              </div>
              {seccionExpand.mezclas ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {seccionExpand.mezclas && (
              <div className="divide-y">
                {MEZCLA_IDS.map(id => {
                  const item  = invItem(id);
                  const disp  = item.inicio + item.ingreso;
                  const coc   = cocinadasHoy[id];
                  const mapa  = MEZCLA_A_PAQ[id];
                  const prod  = coc * mapa.factor;
                  const saldo = Math.max(0, disp - coc);
                  return (
                    <div key={id} className="px-4 py-4 space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-foreground">{nomProd(id)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{disp} disponibles para cocinar</p>
                        </div>
                        {prod > 0 && (
                          <div className="rounded-full bg-amber-100 dark:bg-amber-950/40 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-400">
                            → {prod} paq.
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <button onClick={() => cambiarCocinadas(id, -1)} disabled={coc === 0}
                          className="h-14 w-14 shrink-0 rounded-2xl border-2 border-border flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform">
                          <Minus size={22} strokeWidth={2.5} />
                        </button>
                        <div className="flex-1 text-center">
                          <p className="text-5xl font-black tabular-nums leading-none">{coc}</p>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mt-1">cocinadas</p>
                        </div>
                        <button onClick={() => cambiarCocinadas(id, 1)} disabled={coc >= disp}
                          className="h-14 w-14 shrink-0 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-30 active:scale-95 transition-transform shadow-md">
                          <Plus size={22} strokeWidth={2.5} />
                        </button>
                      </div>
                      {coc > 0 && (
                        <div className="flex gap-2">
                          <div className="flex-1 rounded-xl bg-muted/60 px-3 py-2 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Saldo mezcla</p>
                            <p className="text-lg font-bold tabular-nums">{saldo}</p>
                          </div>
                          <div className="flex-1 rounded-xl bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-center">
                            <p className="text-[10px] text-amber-700 dark:text-amber-400 uppercase font-semibold">Paq. producidos</p>
                            <p className="text-lg font-bold text-amber-700 dark:text-amber-400 tabular-nums">{prod}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Paquetes y Promos */}
          <StockSection
            titulo="Paquetes y Promos" colorDot="bg-primary" ids={PAQUETE_IDS}
            expandido={seccionExpand.paquetes} onToggle={() => toggleSeccion("paquetes")}
            disponible={disponible} produccionPorPaq={produccionPorPaq}
            estVendidos={estVendidos} stockActual={stockActual} setSto={setSto}
          />

          {/* Líquidos y Mezcla Directa */}
          <StockSection
            titulo="Líquidos y Mezcla Directa" colorDot="bg-sky-500" ids={DIRECTO_IDS}
            expandido={seccionExpand.liquidos} onToggle={() => toggleSeccion("liquidos")}
            disponible={disponible} produccionPorPaq={produccionPorPaq}
            estVendidos={estVendidos} stockActual={stockActual} setSto={setSto}
          />

        </div>
      </div>

      {/* ── BARRA INFERIOR FIJA ── */}
      <div className="shrink-0 border-t bg-background px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {!puedeEliminar && estTotal > 0 ? (
            <p className="text-sm text-muted-foreground">Stock contado · listo para cuadrar</p>
          ) : puedeEliminar && estTotal > 0 ? (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total venta</p>
              <p className="text-xl font-black tabular-nums text-emerald-600">{formatearCLP(estTotal)}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Ingresa el saldo final de cada producto</p>
          )}
        </div>
        <button
          onClick={() => setCuadreAbierto(true)}
          className="flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow active:scale-[.97] transition-transform"
        >
          <Calculator size={18} />
          Cuadrar Caja
        </button>
      </div>

      {/* ── BOTTOM SHEET: CUADRE DE CAJA ── */}
      {cuadreAbierto && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/50"
          onClick={() => { setCuadreAbierto(false); setConfirmando(false); }}
        >
          <div
            className="w-full max-h-[92dvh] rounded-t-3xl bg-background shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-300"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle + Header */}
            <div className="shrink-0 px-5 pt-4 pb-3 border-b">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Cuadre de Caja</h2>
                  {puedeEliminar && estTotal > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">Venta calculada: {formatearCLP(estTotal)}</p>
                  )}
                </div>
                <button onClick={() => { setCuadreAbierto(false); setConfirmando(false); }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Contenido scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

              {/* Efectivo en caja */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/40">
                    <Banknote size={16} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <label className="text-sm font-bold text-foreground">Efectivo en caja</label>
                </div>
                <Input
                  inputMode="numeric" placeholder="$0"
                  className="h-14 text-right text-xl font-black focus:border-emerald-500"
                  value={efectivo ? `$${efectivoNum.toLocaleString("es-CL")}` : ""}
                  onChange={e => setEfectivo(e.target.value.replace(/\D/g, ""))}
                  onFocus={e => (e.target as HTMLInputElement).select()}
                  autoFocus
                />
              </div>

              {/* Pagos sin efectivo */}
              <div className="rounded-2xl border bg-muted/30 overflow-hidden divide-y">
                {/* Tarjeta */}
                <div className="px-4 pt-3.5 pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/40">
                      <CreditCard size={15} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">Tarjeta / Débito</p>
                      <p className="text-[10px] text-muted-foreground">Se descuenta — no es efectivo físico</p>
                    </div>
                    <input type="text" inputMode="numeric" placeholder="$0"
                      value={fmtCLP(tarjeta)}
                      onChange={e => setTarjeta(e.target.value.replace(/\D/g, ""))}
                      onFocus={e => e.target.select()}
                      className="w-28 h-10 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 text-right px-3 text-sm font-bold tabular-nums text-blue-700 dark:text-blue-300 outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  {/* Boucher */}
                  <div className="mt-2">
                    {boucherUrl ? (
                      <div className="flex items-center gap-4 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-4 py-3">
                        <button onClick={() => setVerBoucher(true)}
                          className="relative shrink-0 h-20 w-20 rounded-xl overflow-hidden border-2 border-blue-300 dark:border-blue-700 shadow-md active:scale-95 transition-transform">
                          <img src={boucherUrl} alt="Boucher" className="h-full w-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
                            <ZoomIn size={22} className="text-white" />
                          </div>
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">✓ Boucher adjunto</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Toca la imagen para verla completa</p>
                          <div className="flex gap-3 mt-2">
                            <button onClick={() => fileInputRef.current?.click()}
                              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-blue-300 dark:border-blue-700 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                              <Camera size={13} /> Cambiar
                            </button>
                            <button onClick={() => { URL.revokeObjectURL(boucherUrl); setBoucherUrl(null); }}
                              className="h-8 px-3 rounded-lg border border-destructive/30 text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors">
                              Eliminar
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-3 h-12 rounded-2xl border-2 border-dashed border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/10 text-blue-600 dark:text-blue-400 text-sm font-semibold hover:bg-blue-50 dark:hover:bg-blue-950/20 active:scale-[.98] transition-all">
                        <Camera size={18} /> Adjuntar foto del boucher
                      </button>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFoto} />
                  </div>
                </div>

                {/* Transferencia */}
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-950/40">
                    <ArrowLeftRight size={15} className="text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Transferencia</p>
                    <p className="text-[10px] text-muted-foreground">Se descuenta — no es efectivo físico</p>
                  </div>
                  <input type="text" inputMode="numeric" placeholder="$0"
                    value={fmtCLP(transferencia)}
                    onChange={e => setTransferencia(e.target.value.replace(/\D/g, ""))}
                    onFocus={e => e.target.select()}
                    className="w-28 h-10 rounded-xl border-2 border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20 text-right px-3 text-sm font-bold tabular-nums text-violet-700 dark:text-violet-300 outline-none focus:border-violet-500 transition-colors"
                  />
                </div>
              </div>

              {/* Gastos y Retiros */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-foreground">Gastos y Retiros</p>
                  {puedeEliminar && (
                    <div className="flex gap-1.5">
                      <BtnMov label="Gasto"   color="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400"           onClick={() => setModalMov("gasto")} />
                      <BtnMov label="Retiro"  color="border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-400" onClick={() => setModalMov("retiro")} />
                      <BtnMov label="Ingreso" color="border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400" onClick={() => setModalMov("ingreso")} />
                    </div>
                  )}
                </div>
                {movimientos.length === 0 ? (
                  <div className="flex h-10 items-center justify-center text-sm text-muted-foreground border border-dashed rounded-xl">
                    Sin movimientos
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {[...movimientos].reverse().map(m => {
                      const cfg = TIPO_CONFIG[m.tipo];
                      return (
                        <div key={m.id} className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-background px-3 py-2">
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{m.descripcion}</p>
                            <p className="text-[10px] text-muted-foreground">{m.categoria} · {m.hora}</p>
                          </div>
                          <span className={`shrink-0 tabular-nums text-sm font-bold ${cfg.text}`}>{cfg.signo}{formatearCLP(m.monto)}</span>
                          {puedeEliminar && (
                            <button onClick={() => { void eliminarMovimiento(m.id); toast.info("Movimiento eliminado"); }}
                              className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-red-500 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Cuadre en tiempo real — solo visible para ADMIN/SUPERVISOR */}
              {puedeEliminar && (
                <div className="rounded-2xl border-2 bg-card overflow-hidden divide-y">
                  <FilaCuadre label="Total venta"        valor={formatearCLP(estTotal)} />
                  {tarjetaNum > 0        && <FilaCuadre label="− Tarjeta"        valor={`-${formatearCLP(tarjetaNum)}`}       claseValor="text-blue-600" />}
                  {transferenciaNum > 0  && <FilaCuadre label="− Transferencia"  valor={`-${formatearCLP(transferenciaNum)}`} claseValor="text-violet-600" />}
                  {totalGastosLibres > 0 && <FilaCuadre label="− Gastos"         valor={`-${formatearCLP(totalGastosLibres)}`} claseValor="text-red-600" />}
                  {totalRetiros > 0      && <FilaCuadre label="− Retiros"        valor={`-${formatearCLP(totalRetiros)}`}      claseValor="text-orange-600" />}
                  {totalIngresos > 0     && <FilaCuadre label="+ Ingresos / Apertura" valor={`+${formatearCLP(totalIngresos)}`} claseValor="text-emerald-600" />}
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/40">
                    <span className="text-sm font-bold">Esperado en caja</span>
                    <span className={`font-extrabold tabular-nums ${esperadoCaja >= 0 ? "text-foreground" : "text-destructive"}`}>{formatearCLP(esperadoCaja)}</span>
                  </div>
                  {efectivoNum > 0 && (
                    <>
                      <FilaCuadre label="Efectivo contado" valor={formatearCLP(efectivoNum)} claseValor="text-emerald-600" />
                      <div className={`flex items-center justify-between px-4 py-3 ${hayFaltante ? "bg-red-50 dark:bg-red-950/20" : "bg-emerald-50 dark:bg-emerald-950/20"}`}>
                        <span className={`text-sm font-bold ${hayFaltante ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                          {hayFaltante ? "Faltante" : "Sobrante"}
                        </span>
                        <span className={`text-lg font-extrabold tabular-nums ${hayFaltante ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                          {diferencia! >= 0 ? "+" : ""}{formatearCLP(diferencia!)}
                        </span>
                      </div>
                      {aDepositar !== null && (
                        <div className="flex items-center justify-between px-4 py-3 bg-primary/5">
                          <div>
                            <p className="text-sm font-bold text-foreground">A depositar</p>
                            <p className="text-[10px] text-muted-foreground">Efectivo + Retiros</p>
                          </div>
                          <span className="text-lg font-extrabold tabular-nums text-primary">{formatearCLP(aDepositar)}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Alerta faltante — solo para ADMIN/SUPERVISOR */}
              {puedeEliminar && confirmando && hayFaltante && (
                <div className="rounded-2xl border-2 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-red-700 dark:text-red-400">¿Está bien contado el efectivo?</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                        Hay un faltante de {formatearCLP(Math.abs(diferencia!))}. El monto quedará registrado y reportado al supervisor.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmando(false)}
                      className="flex-1 h-10 rounded-xl border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
                      No, revisar
                    </button>
                    <button onClick={ejecutarCierre}
                      className="flex-1 h-10 rounded-xl bg-red-600 text-sm font-bold text-white hover:bg-red-700 transition-colors">
                      Sí, confirmar
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Botón cerrar turno */}
            <div className="shrink-0 border-t bg-background px-5 py-4">
              <button
                onClick={() => {
                  if (efectivoNum === 0) { toast.warning("Ingresa el efectivo en caja antes de cerrar"); return; }
                  if (puedeEliminar && hayFaltante && !confirmando) { setConfirmando(true); return; }
                  ejecutarCierre();
                }}
                disabled={efectivoNum === 0}
                className={`w-full h-13 py-3.5 rounded-2xl font-bold text-sm text-white transition-colors disabled:opacity-40 active:scale-[.98] ${
                  puedeEliminar && hayFaltante && confirmando ? "bg-red-600 hover:bg-red-700" : puedeEliminar && hayFaltante ? "bg-red-500 hover:bg-red-600" : "bg-primary hover:bg-primary/90"
                }`}
              >
                {efectivoNum === 0 ? "Ingresa el efectivo para cerrar" : puedeEliminar && hayFaltante ? "Cerrar con faltante →" : "Cerrar Turno"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal boucher grande */}
      {verBoucher && boucherUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setVerBoucher(false)}>
          <div className="relative max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <img src={boucherUrl} alt="Boucher tarjeta" className="w-full rounded-2xl shadow-2xl" />
            <button onClick={() => setVerBoucher(false)} className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-background border shadow">
              <X size={16} />
            </button>
            <p className="text-center text-xs text-white/70 mt-3">Toca fuera para cerrar</p>
          </div>
        </div>
      )}

      {/* Modal gasto/retiro/ingreso */}
      {modalMov && (
        <ModalMovimiento
          tipo={modalMov}
          onCerrar={() => setModalMov(null)}
          onGuardar={mov => {
            void agregarMovimiento(mov);
            toast.success(`${TIPO_CONFIG[mov.tipo].label} registrado`, { description: `${mov.descripcion} · ${formatearCLP(mov.monto)}` });
          }}
        />
      )}
    </div>
  );
}

// ─── ModalMovimiento ─────────────────────────────────────────────────────────

function ModalMovimiento({ tipo, onCerrar, onGuardar }: {
  tipo: TipoMov
  onCerrar: () => void
  onGuardar: (mov: Omit<MovimientoCaja, "id" | "hora">) => void
}) {
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
      setErrores({ descripcion: flat.descripcion?.[0], monto: flat.monto?.[0] });
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
            <Input placeholder={tipo === "gasto" ? "Ej: Bolsa de plástico" : tipo === "retiro" ? "Ej: Retiro para gastos" : "Ej: Ingreso adicional"}
              value={desc} onChange={e => { setDesc(e.target.value); setErrores(p => ({ ...p, descripcion: undefined })); }}
              className={errores.descripcion ? "border-destructive" : ""} autoFocus />
            {errores.descripcion && <p className="text-xs text-destructive">{errores.descripcion}</p>}
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
            <Input inputMode="numeric" placeholder="$0"
              value={monto ? `$${parseInt(monto.replace(/\D/g, "") || "0", 10).toLocaleString("es-CL")}` : ""}
              onChange={e => { setMonto(e.target.value.replace(/\D/g, "")); setErrores(p => ({ ...p, monto: undefined })); }}
              onFocus={e => e.target.select()}
              className={errores.monto ? "border-destructive" : ""} />
            {errores.monto && <p className="text-xs text-destructive">{errores.monto}</p>}
          </div>
        </div>
        <div className="shrink-0 flex gap-3 border-t bg-background px-5 py-4">
          <button onClick={onCerrar} className="flex-1 h-11 rounded-xl border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancelar</button>
          <button onClick={guardar}
            className={`flex-1 h-11 rounded-xl text-sm font-bold text-white transition-colors ${tipo === "ingreso" ? "bg-emerald-600 hover:bg-emerald-700" : tipo === "retiro" ? "bg-orange-500 hover:bg-orange-600" : "bg-red-500 hover:bg-red-600"}`}>
            Registrar {cfg.label}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function BtnMov({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1 h-8 px-2.5 rounded-lg border text-xs font-semibold transition-colors ${color}`}>
      <Plus size={13} strokeWidth={2.5} /> {label}
    </button>
  );
}

function FilaCuadre({ label, valor, claseValor = "text-foreground" }: { label: string; valor: string; claseValor?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${claseValor}`}>{valor}</span>
    </div>
  );
}

// ─── StockSection ─────────────────────────────────────────────────────────────

interface StockSectionProps {
  titulo: string; colorDot: string; ids: number[];
  expandido: boolean; onToggle: () => void;
  disponible: Record<number, number>; produccionPorPaq: Record<number, number>;
  estVendidos: Record<number, number | null>; stockActual: Record<number, string>;
  setSto: (id: number, v: string) => void;
}

function StockSection({ titulo, colorDot, ids, expandido, onToggle, disponible, produccionPorPaq, estVendidos, stockActual, setSto }: StockSectionProps) {
  return (
    <div className="rounded-2xl bg-background border overflow-hidden shadow-sm">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3.5 border-b">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${colorDot}`} />
          <span className="text-sm font-bold uppercase tracking-wide text-foreground">{titulo}</span>
        </div>
        {expandido ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>

      {expandido && (
        <div className="divide-y">
          {ids.map(id => {
            const disp   = disponible[id];
            const prod   = produccionPorPaq[id] ?? 0;
            const vend   = estVendidos[id];
            const valNum  = stockActual[id] !== "" ? parseInt(stockActual[id], 10) : NaN;
            const sobrestock = !isNaN(valNum) && valNum > disp;

            return (
              <div key={id} className="px-4 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-foreground">{nomProd(id)}</p>
                  {sobrestock ? (
                    <p className="text-xs font-semibold text-red-600">máx {disp}</p>
                  ) : prod > 0 ? (
                    <p className="text-xs font-semibold text-muted-foreground tabular-nums">
                      <span>{disp - prod}</span>
                      <span className="text-amber-600 dark:text-amber-400"> +{prod} prod.</span>
                      <span className="text-foreground font-bold"> = {disp}</span>
                    </p>
                  ) : (
                    <p className="text-xs font-semibold text-muted-foreground">{disp} disp.</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Saldo final</p>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0"
                      value={stockActual[id] ?? ""}
                      onChange={e => setSto(id, e.target.value)}
                      onFocus={e => e.target.select()}
                      className={`h-14 w-full rounded-xl border-2 bg-muted/30 text-center text-2xl font-black tabular-nums outline-none transition-colors ${
                        sobrestock ? "border-red-500 bg-red-50 dark:bg-red-950/20 focus:border-red-500" : "border-border focus:border-primary focus:bg-background"
                      }`}
                    />
                    {sobrestock && <p className="text-xs font-semibold text-red-600">⚠ Máx: {disp}</p>}
                  </div>
                  <div className={`shrink-0 w-24 rounded-xl px-2 py-2 text-center ${sobrestock ? "bg-red-50 dark:bg-red-950/20" : vend !== null ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-muted/40"}`}>
                    <p className={`text-3xl font-black tabular-nums leading-none ${sobrestock ? "text-red-600" : vend !== null ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                      {sobrestock ? "!" : vend !== null ? vend : "—"}
                    </p>
                    <p className={`text-[10px] font-semibold uppercase mt-1 ${sobrestock ? "text-red-600" : vend !== null ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                      {sobrestock ? "error" : "vendidos"}
                    </p>
                    </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
