// Página: Mis Cierres
//
// Historial propio de turnos cerrados del vendedor (C15/A36): fecha, sucursal,
// totales declarados y — lo central — la diferencia de caja de cada cierre.
// Es el mismo dato que el admin ve en Seguimiento y que afecta la nómina;
// esta pantalla le da a la vendedora la contraparte para auditarlo/disputarlo.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Menu, History, TrendingUp, TrendingDown, CheckCircle2, Clock, Equal, ShieldAlert, Banknote } from "lucide-react";
import { useMenuNav } from "@/componentes/layout/contexto-menu";
import { apiGet } from "@/lib/api";
import { formatearCLP } from "@/lib/money";

interface TurnoCerrado {
  id: number;
  pdvNombre: string;
  fechaApertura: string;
  fechaCierre: string | null;
  totalCalculado: number;
  ventaEfectivo: number;
  ventaTarjeta: number;
  ventaTransferencia: number;
  efectivoDeclarado: number;
  diferenciaCaja: number;
  recepcionConfirmada: boolean;
  dineroRecibido: number | null;
}

// Cierre preventivo ocurrido durante un turno del vendedor (visita del admin).
interface CierrePreventivoMio {
  id: number;
  pdvNombre: string;
  autor: string;
  fecha: string;
  montoRetiro: number;
  notasVendedor: string | null;
  checklist: { label: string; marcado: boolean }[];
}

// Entrada unificada del historial (turno cerrado o cierre preventivo), para
// mostrarlos en una sola línea de tiempo ordenada por fecha.
type EntradaHistorial =
  | { tipo: "turno"; fecha: string; turno: TurnoCerrado }
  | { tipo: "preventivo"; fecha: string; cierre: CierrePreventivoMio };

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", {
    weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit",
  });
}

// Chip de diferencia: verde sobrante, rojo faltante, neutro cuadrado exacto.
function ChipDiferencia({ valor }: { valor: number }) {
  if (valor > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
        <TrendingUp size={12} /> +{formatearCLP(valor)}
      </span>
    );
  }
  if (valor < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700 dark:bg-red-950/40 dark:text-red-400">
        <TrendingDown size={12} /> −{formatearCLP(Math.abs(valor))}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
      <Equal size={12} /> Cuadrado
    </span>
  );
}

export default function MisCierres() {
  const { abrirMenu } = useMenuNav();

  const { data: turnos = [], isLoading } = useQuery({
    queryKey: ["pos", "turnos-mios"],
    queryFn: () =>
      apiGet<{ data: TurnoCerrado[] }>("/pos/turnos/mios").then((r) => r.data),
    throwOnError: false,
  });

  const { data: preventivos = [] } = useQuery({
    queryKey: ["pos", "mis-cierres-preventivos"],
    queryFn: () =>
      apiGet<{ data: CierrePreventivoMio[] }>("/cierres-preventivos/mios").then((r) => r.data),
    throwOnError: false,
  });

  const resumen = useMemo(() => {
    const acumulado = turnos.reduce((s, t) => s + t.diferenciaCaja, 0);
    const conFaltante = turnos.filter((t) => t.diferenciaCaja < 0).length;
    return { acumulado, conFaltante };
  }, [turnos]);

  // Línea de tiempo unificada: turnos cerrados + cierres preventivos, por fecha desc.
  const entradas = useMemo<EntradaHistorial[]>(() => {
    const t: EntradaHistorial[] = turnos.map((x) => ({
      tipo: "turno", fecha: x.fechaCierre ?? x.fechaApertura, turno: x,
    }));
    const p: EntradaHistorial[] = preventivos.map((x) => ({
      tipo: "preventivo", fecha: x.fecha, cierre: x,
    }));
    return [...t, ...p].sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
    );
  }, [turnos, preventivos]);

  return (
    <div className="flex h-full flex-col bg-muted/30">
      {/* ── Header ── */}
      <header className="flex items-center gap-3 border-b bg-background px-4 py-3 shrink-0">
        <button
          onClick={abrirMenu}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted lg:hidden"
        >
          <Menu size={22} />
        </button>
        <div>
          <h1 className="text-base font-bold text-foreground lg:text-xl">Mis Cierres</h1>
          <p className="text-xs text-muted-foreground hidden lg:block">
            Historial de tus turnos cerrados y diferencias de caja
          </p>
        </div>
      </header>

      {/* ── Contenido ── */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {/* Resumen acumulado */}
        {turnos.length > 0 && (
          <div className="mb-4 rounded-2xl border bg-background p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Diferencia acumulada ({turnos.length} turno{turnos.length !== 1 ? "s" : ""})
            </p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className={`text-2xl font-extrabold tabular-nums ${
                resumen.acumulado < 0 ? "text-red-600" : resumen.acumulado > 0 ? "text-emerald-600" : "text-foreground"
              }`}>
                {resumen.acumulado < 0 ? "−" : resumen.acumulado > 0 ? "+" : ""}
                {formatearCLP(Math.abs(resumen.acumulado))}
              </p>
              {resumen.conFaltante > 0 && (
                <p className="text-xs text-muted-foreground text-right">
                  {resumen.conFaltante} cierre{resumen.conFaltante !== 1 ? "s" : ""} con faltante
                </p>
              )}
            </div>
          </div>
        )}

        {/* Lista de cierres (turnos + cierres preventivos) */}
        {isLoading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : entradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
            <History className="mb-3 size-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Aún no tienes cierres registrados</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Aquí verás cada cierre con su diferencia de caja
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {entradas.map((e) =>
              e.tipo === "turno" ? (
                <TarjetaTurno key={`t-${e.turno.id}`} t={e.turno} />
              ) : (
                <TarjetaPreventivo key={`p-${e.cierre.id}`} c={e.cierre} />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tarjeta: turno cerrado ─────────────────────────────────────────────────
function TarjetaTurno({ t }: { t: TurnoCerrado }) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {formatearFecha(t.fechaCierre ?? t.fechaApertura)}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {t.pdvNombre} · Turno #{t.id}
          </p>
        </div>
        <ChipDiferencia valor={t.diferenciaCaja} />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
        <div>
          <p className="text-muted-foreground">Venta total</p>
          <p className="font-semibold tabular-nums">{formatearCLP(t.totalCalculado)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Efectivo declarado</p>
          <p className="font-semibold tabular-nums">{formatearCLP(t.efectivoDeclarado)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Recepción</p>
          {t.recepcionConfirmada ? (
            <p className="inline-flex items-center gap-1 font-semibold text-emerald-600">
              <CheckCircle2 size={12} /> Confirmada
            </p>
          ) : (
            <p className="inline-flex items-center gap-1 font-semibold text-amber-600">
              <Clock size={12} /> Pendiente
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tarjeta: cierre preventivo (visita del admin durante el turno) ─────────
function TarjetaPreventivo({ c }: { c: CierrePreventivoMio }) {
  const hechas = c.checklist.filter((i) => i.marcado).length;
  const total  = c.checklist.length;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 shadow-sm dark:border-amber-800/40 dark:bg-amber-950/20">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <ShieldAlert size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
            Cierre preventivo
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {c.pdvNombre} · {c.autor} · {formatearFecha(c.fecha)}
          </p>
        </div>
        {c.montoRetiro > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700 dark:bg-red-950/40 dark:text-red-400">
            <Banknote size={12} /> Retiro {formatearCLP(c.montoRetiro)}
          </span>
        )}
      </div>

      {c.notasVendedor && (
        <div className="mt-2 rounded-lg bg-background/60 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Tareas dejadas
          </p>
          <p className="mt-0.5 whitespace-pre-line break-words text-xs text-foreground/90">
            {c.notasVendedor}
          </p>
        </div>
      )}

      {total > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Checklist: {hechas}/{total} completadas
        </p>
      )}
    </div>
  );
}
