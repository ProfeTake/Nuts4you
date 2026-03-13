// Página: Movimiento de Caja

import { useState, useRef, useCallback } from "react";
import { useMenuNav } from "@/componentes/SideNav";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatearCLP } from "@/hooks/useCarrito";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TipoMov = "gasto" | "retiro" | "ingreso";

interface Movimiento {
  id: number;
  tipo: TipoMov;
  descripcion: string;
  categoria: string;
  monto: number;
  hora: string;
}

interface BoletaPOS {
  maquina: string;
  archivo: File | null;
  preview: string | null;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const TIPO_CONFIG: Record<TipoMov, { label: string; bg: string; text: string; signo: "+" | "-" }> = {
  gasto:   { label: "Gasto",   bg: "bg-red-100 dark:bg-red-950/40",     text: "text-red-700 dark:text-red-400",     signo: "-" },
  retiro:  { label: "Retiro",  bg: "bg-orange-100 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-400", signo: "-" },
  ingreso: { label: "Ingreso", bg: "bg-emerald-100 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", signo: "+" },
};

const CATEGORIAS_GASTO = ["Insumos", "Transporte", "Alimentación", "Servicios", "Limpieza", "Otros"];
const SALDO_APERTURA = 50000;
const MAQUINAS_POS = ["Mercado Pago", "Garnet", "Banco Estado", "Otro"];

let nextId = 10;

const MOVIMIENTOS_BASE: Movimiento[] = [
  { id: 1, tipo: "ingreso", descripcion: "Saldo apertura de caja", categoria: "Apertura", monto: SALDO_APERTURA, hora: "09:00" },
];

// ─── Iconos ───────────────────────────────────────────────────────────────────

function IconoMenu() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" />
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

function IconoPlus() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  );
}

function IconoCamera() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function IconoTrash() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

// ─── Modal genérico (gasto / retiro / ingreso) ────────────────────────────────

interface ModalMovProps {
  tipo: TipoMov;
  onCerrar: () => void;
  onGuardar: (mov: Omit<Movimiento, "id" | "hora">) => void;
}

function ModalMovimiento({ tipo, onCerrar, onGuardar }: ModalMovProps) {
  const cfg = TIPO_CONFIG[tipo];
  const [desc, setDesc]   = useState("");
  const [cat, setCat]     = useState(tipo === "gasto" ? CATEGORIAS_GASTO[0] : tipo === "retiro" ? "Retiro de turno" : "Ingreso manual");
  const [monto, setMonto] = useState("");

  const guardar = () => {
    const m = parseInt(monto.replace(/\D/g, ""), 10);
    if (!desc.trim()) { toast.error("Ingresa una descripción"); return; }
    if (!m || m <= 0)  { toast.error("Ingresa un monto válido"); return; }
    onGuardar({ tipo, descripcion: desc.trim(), categoria: cat, monto: m });
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-0 sm:px-4" onClick={onCerrar}>
      <div
        className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border bg-background shadow-2xl flex flex-col max-h-[85dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header fijo */}
        <div className="shrink-0 flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-base font-bold">Nuevo {cfg.label}</h3>
          <button onClick={onCerrar} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><IconoCerrar /></button>
        </div>
        {/* Cuerpo scrollable — sube con el teclado */}
        <div className="flex-1 overflow-y-auto overscroll-contain space-y-4 px-5 py-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Descripción</label>
            <Input placeholder={tipo === "gasto" ? "Ej: Bolsa de plástico" : tipo === "retiro" ? "Ej: Retiro para gastos" : "Ej: Venta fuera de sistema"} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Categoría</label>
            {tipo === "gasto" ? (
              <select value={cat} onChange={(e) => setCat(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                {CATEGORIAS_GASTO.map((c) => <option key={c}>{c}</option>)}
              </select>
            ) : (
              <Input value={cat} onChange={(e) => setCat(e.target.value)} />
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Monto (CLP)</label>
            <Input
              inputMode="numeric"
              placeholder="$0"
              value={monto ? `$${parseInt(monto.replace(/\D/g, "") || "0", 10).toLocaleString("es-CL")}` : ""}
              onChange={(e) => setMonto(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>
        {/* Footer fijo — siempre visible sobre el teclado */}
        <div className="shrink-0 flex gap-3 border-t bg-background px-5 py-4">
          <button onClick={onCerrar} className="flex-1 h-11 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancelar</button>
          <button onClick={guardar} className={`flex-1 h-11 rounded-xl text-sm font-bold text-white transition-colors ${tipo === "ingreso" ? "bg-emerald-600 hover:bg-emerald-700" : tipo === "retiro" ? "bg-orange-500 hover:bg-orange-600" : "bg-red-500 hover:bg-red-600"}`}>
            Registrar {cfg.label}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Cierre de Caja ────────────────────────────────────────────────────

interface ModalCierreProps {
  saldoEsperado: number;
  onCerrar: () => void;
  onConfirmar: () => void;
}

function ModalCierre({ saldoEsperado, onCerrar, onConfirmar }: ModalCierreProps) {
  const [efectivo, setEfectivo] = useState("");
  const [boletas, setBoletas]   = useState<BoletaPOS[]>(
    MAQUINAS_POS.map((m) => ({ maquina: m, archivo: null, preview: null }))
  );
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const efectivoNum = parseInt(efectivo.replace(/\D/g, ""), 10) || 0;
  const diferencia  = efectivoNum - saldoEsperado;

  const handleFile = useCallback((idx: number, file: File | null) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setBoletas((prev) => prev.map((b, i) => i === idx ? { ...b, archivo: file, preview } : b));
  }, []);

  const quitarImg = useCallback((idx: number) => {
    setBoletas((prev) => prev.map((b, i) => {
      if (i !== idx) return b;
      if (b.preview) URL.revokeObjectURL(b.preview);
      return { ...b, archivo: null, preview: null };
    }));
  }, []);

  const confirmar = () => {
    if (!efectivo) { toast.error("Ingresa el efectivo contado"); return; }
    onConfirmar();
    toast.success("Caja cerrada correctamente");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-0 sm:px-4" onClick={onCerrar}>
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border bg-background shadow-2xl max-h-[85dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
          <div>
            <p className="text-xs text-muted-foreground">Turno activo</p>
            <h3 className="text-base font-bold">Cierre de Caja</h3>
          </div>
          <button onClick={onCerrar} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><IconoCerrar /></button>
        </div>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Efectivo */}
          <div className="space-y-3">
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Efectivo en caja</p>
            <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
              <FilaCierre label="Saldo esperado" valor={formatearCLP(saldoEsperado)} />
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground shrink-0">Efectivo contado</span>
                <Input
                  inputMode="numeric"
                  placeholder="$0"
                  className="text-right h-9 max-w-[140px]"
                  value={efectivo ? `$${parseInt(efectivo.replace(/\D/g, "") || "0", 10).toLocaleString("es-CL")}` : ""}
                  onChange={(e) => setEfectivo(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              {efectivoNum > 0 && (
                <div className={`flex items-center justify-between font-bold text-sm border-t pt-2 ${diferencia >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  <span>{diferencia >= 0 ? "Sobrante" : "Faltante"}</span>
                  <span>{diferencia >= 0 ? "+" : ""}{formatearCLP(diferencia)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Boletas POS */}
          <div className="space-y-3">
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Boleta resumen máquinas POS</p>
            <div className="grid grid-cols-2 gap-3">
              {boletas.map((b, idx) => (
                <div key={b.maquina} className="rounded-xl border border-dashed border-border/60 bg-muted/20 overflow-hidden">
                  {b.preview ? (
                    <div className="relative">
                      <img src={b.preview} alt={b.maquina} className="w-full h-28 object-cover" />
                      <button onClick={() => quitarImg(idx)}
                        className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
                        <IconoCerrar />
                      </button>
                      <p className="text-center text-[10px] font-semibold py-1 text-foreground bg-background/80">{b.maquina}</p>
                    </div>
                  ) : (
                    <button
                      onClick={() => inputsRef.current[idx]?.click()}
                      className="w-full flex flex-col items-center justify-center gap-1.5 py-4 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                    >
                      <IconoCamera />
                      <span className="text-[11px] font-medium leading-tight text-center px-1">{b.maquina}</span>
                      <span className="text-[10px] text-muted-foreground/70">Subir foto</span>
                    </button>
                  )}
                  <input
                    ref={(el) => { inputsRef.current[idx] = el; }}
                    type="file" accept="image/*" capture="environment"
                    className="hidden"
                    onChange={(e) => handleFile(idx, e.target.files?.[0] ?? null)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t px-5 py-4 shrink-0">
          <button onClick={onCerrar} className="flex-1 h-11 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            Cancelar
          </button>
          <button onClick={confirmar} className="flex-1 h-11 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors">
            Confirmar Cierre
          </button>
        </div>
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

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CierreCaja() {
  const { abrirMenu } = useMenuNav();
  const [movimientos, setMovimientos] = useState<Movimiento[]>(MOVIMIENTOS_BASE);
  const [modalAbierto, setModalAbierto] = useState<TipoMov | "cierre" | null>(null);

  const ahora = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const agregarMovimiento = (mov: Omit<Movimiento, "id" | "hora">) => {
    const nuevo: Movimiento = { ...mov, id: nextId++, hora: ahora() };
    setMovimientos((prev) => [...prev, nuevo]);
    const label = TIPO_CONFIG[mov.tipo].label;
    toast.success(`${label} registrado`, { description: `${mov.descripcion} · ${formatearCLP(mov.monto)}` });
  };

  const eliminarMovimiento = (id: number) => {
    setMovimientos((prev) => prev.filter((m) => m.id !== id));
    toast.info("Movimiento eliminado");
  };

  // Cálculos
  const totalEgresos  = movimientos.filter((m) => m.tipo !== "ingreso").reduce((s, m) => s + m.monto, 0);
  const totalIngresos = movimientos.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
  const totalGastos   = movimientos.filter((m) => m.tipo === "gasto").reduce((s, m) => s + m.monto, 0);
  const totalRetiros  = movimientos.filter((m) => m.tipo === "retiro").reduce((s, m) => s + m.monto, 0);
  const saldoActual   = totalIngresos - totalEgresos;

  return (
    <div className="flex h-full flex-col">
      {/* Header móvil */}
      <header className="flex items-center gap-3 border-b bg-background px-4 py-3 lg:hidden">
        <button onClick={abrirMenu} aria-label="Abrir menú"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
          <IconoMenu />
        </button>
        <button onClick={abrirMenu} className="text-base font-semibold text-foreground hover:text-primary transition-colors">
          Movimiento de Caja
        </button>
      </header>

      {/* Título desktop */}
      <div className="hidden lg:flex items-baseline gap-3 px-6 pt-5 pb-1">
        <h1 className="text-xl font-bold text-foreground">Movimiento de Caja</h1>
      </div>

      {/* Resumen tarjetas */}
      <div className="shrink-0 grid grid-cols-3 gap-2 px-4 pt-4 pb-2">
        <TarjetaResumen label="Saldo" monto={saldoActual} color="text-foreground" />
        <TarjetaResumen label="Gastos" monto={totalGastos}  color="text-red-600 dark:text-red-400" />
        <TarjetaResumen label="Retiros" monto={totalRetiros} color="text-orange-600 dark:text-orange-400" />
      </div>

      {/* Botones de acción */}
      <div className="shrink-0 grid grid-cols-3 gap-2 px-4 py-2">
        <BtnAccion label="Gasto"   color="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"     onClick={() => setModalAbierto("gasto")} />
        <BtnAccion label="Retiro"  color="border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-400 dark:hover:bg-orange-950/40" onClick={() => setModalAbierto("retiro")} />
        <BtnAccion label="Ingreso" color="border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40" onClick={() => setModalAbierto("ingreso")} />
      </div>

      {/* Lista de movimientos */}
      <div className="flex-1 overflow-auto px-4 pb-4 space-y-1.5 mt-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground py-1">Movimientos del turno</p>
        {movimientos.length === 0 && (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground border border-dashed rounded-xl">
            Sin movimientos registrados
          </div>
        )}
        {[...movimientos].reverse().map((m) => {
          const cfg = TIPO_CONFIG[m.tipo];
          return (
            <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-3 py-2.5">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>
                {cfg.label}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{m.descripcion}</p>
                <p className="text-[10px] text-muted-foreground">{m.categoria} · {m.hora}</p>
              </div>
              <span className={`shrink-0 tabular-nums text-sm font-bold ${cfg.text}`}>
                {cfg.signo}{formatearCLP(m.monto)}
              </span>
              {m.id !== 1 && (
                <button onClick={() => eliminarMovimiento(m.id)}
                  className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-red-500 transition-colors">
                  <IconoTrash />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Botón cierre de caja */}
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
          onGuardar={agregarMovimiento}
        />
      )}
      {modalAbierto === "cierre" && (
        <ModalCierre
          saldoEsperado={saldoActual}
          onCerrar={() => setModalAbierto(null)}
          onConfirmar={() => setModalAbierto(null)}
        />
      )}
    </div>
  );
}

function TarjetaResumen({ label, monto, color }: { label: string; monto: number; color: string }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5 space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold tabular-nums leading-tight ${color}`}>{formatearCLP(monto)}</p>
    </div>
  );
}

function BtnAccion({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 h-9 rounded-lg border text-xs font-semibold transition-colors ${color}`}
    >
      <IconoPlus />
      {label}
    </button>
  );
}
