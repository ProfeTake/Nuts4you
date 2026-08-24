// ─── ModalSolicitarGasto ───────────────────────────────────────────────────────
// El vendedor pide autorización de un gasto: monto, motivo, categoría y foto del
// boucher (comprimida a base64). Queda PENDIENTE hasta que un supervisor/admin lo
// apruebe o rechace. Al aprobar, el backend crea un GastoTurno vinculado al turno
// y el gasto aparece en el cierre de caja.
//
// Conectado a: POST /api/solicitudes-gasto

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Receipt, X, Camera, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { apiPost } from "@/lib/api";
import { comprimirImagen } from "@/lib/imagen";
import { CATEGORIAS_GASTO } from "@/lib/gastos";

export function ModalSolicitarGasto({ turnoId, onCerrar, onEnviado }: {
  turnoId: number;
  onCerrar: () => void;
  onEnviado: () => void;
}) {
  const [monto,  setMonto]  = useState("");
  const [motivo, setMotivo] = useState("");
  const [cat,    setCat]    = useState(CATEGORIAS_GASTO[0]);
  const [foto,   setFoto]   = useState<string | null>(null);
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const montoNum = parseInt(monto.replace(/\D/g, ""), 10) || 0;

  const elegirFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProcesandoFoto(true);
    try {
      setFoto(await comprimirImagen(file));
    } catch {
      toast.error("No se pudo procesar la imagen");
    } finally {
      setProcesandoFoto(false);
    }
  };

  const enviar = async () => {
    if (montoNum <= 0) { toast.warning("Ingresa el monto del gasto"); return; }
    if (motivo.trim().length < 3) { toast.warning("Describe el motivo del gasto"); return; }
    setEnviando(true);
    try {
      await apiPost("/solicitudes-gasto", {
        turnoId, monto: montoNum, motivo: motivo.trim(), categoria: cat,
        ...(foto ? { foto } : {}),
      });
      toast.success("Gasto enviado", { description: "Pendiente de autorización del supervisor" });
      onEnviado();
      onCerrar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar la solicitud");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-0 sm:px-4" onClick={onCerrar}>
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border bg-background shadow-2xl flex flex-col max-h-[90dvh]" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <Receipt size={18} className="text-red-500" />
            <h3 className="text-base font-bold">Solicitar gasto</h3>
          </div>
          <button onClick={onCerrar} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 px-5 py-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Monto gastado (CLP)</label>
            <Input inputMode="numeric" placeholder="$0"
              value={monto ? `$${montoNum.toLocaleString("es-CL")}` : ""}
              onChange={e => setMonto(e.target.value.replace(/\D/g, ""))}
              onFocus={e => e.target.select()} autoFocus />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Categoría</label>
            <select value={cat} onChange={e => setCat(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
              {CATEGORIAS_GASTO.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Motivo del gasto</label>
            <textarea placeholder="Ej: Compra de bolsas y cinta para el local"
              value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} maxLength={500}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>

          {/* Foto del boucher */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Foto del boucher / comprobante</label>
            {foto ? (
              <div className="flex items-center gap-3 rounded-2xl border bg-muted/30 px-3 py-3">
                <img src={foto} alt="Boucher" className="h-20 w-20 rounded-xl object-cover border" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">✓ Foto lista</p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => fileRef.current?.click()}
                      className="h-8 px-3 rounded-lg border text-xs font-semibold hover:bg-muted transition-colors">Cambiar</button>
                    <button onClick={() => setFoto(null)}
                      className="h-8 px-3 rounded-lg border border-destructive/30 text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors">Quitar</button>
                  </div>
                </div>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} disabled={procesandoFoto}
                className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl border-2 border-dashed text-sm font-semibold text-muted-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors">
                {procesandoFoto ? <><Loader2 size={16} className="animate-spin" /> Procesando…</> : <><Camera size={18} /> Adjuntar foto</>}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={elegirFoto} />
          </div>
        </div>

        <div className="shrink-0 flex gap-3 border-t bg-background px-5 py-4">
          <button onClick={onCerrar} className="flex-1 h-11 rounded-xl border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancelar</button>
          <button onClick={enviar} disabled={enviando || procesandoFoto}
            className="flex-1 h-11 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-bold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {enviando ? <><Loader2 size={16} className="animate-spin" /> Enviando…</> : "Enviar solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}
