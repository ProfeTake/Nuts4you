// ─── SeguimientoVendedores ───────────────────────────────────────────────────
// Desempeño mensual por vendedora: turnos reales, ventas, diferencias de caja,
// PDVs rotados. Conectado a GET /api/rrhh/seguimiento?mes=YYYY-MM

import { useState } from "react";
import { useQuery }  from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, ChevronDown, ChevronUp,
  Loader2, Users, Banknote, AlertTriangle, Store,
  CalendarCheck, BarChart3, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Badge }      from "@/components/ui/badge";
import { Separator }  from "@/components/ui/separator";
import { apiGet }     from "@/lib/api";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface HistorialTurno {
  id:         number;
  fecha:      string;
  pdvNombre:  string;
  total:      number | null;
  diferencia: number | null;
  estado:     string;
}

interface PorPDV {
  pdvId:     number;
  pdvNombre: string;
  dias:      number;
  ventas:    number;
}

interface SeguimientoVendedor {
  id:               number;
  nombre:           string;
  rut:              string;
  pagoDiario:       number;
  activo:           boolean;
  totalTurnos:      number;
  turnosCerrados:   number;
  totalVentas:      number;
  promedioDiario:   number;
  faltantes:        number;
  sobrantes:        number;
  turnosConFaltante: number;
  porPDV:           PorPDV[];
  historial:        HistorialTurno[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function mesLabel(iso: string) {
  const [y, m] = iso.split("-");
  return `${MESES[Number(m) - 1]} ${y}`;
}

function navegarMes(iso: string, delta: number): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function iniciales(nombre: string) {
  return nombre.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

const COLORES_PDV = [
  "bg-violet-100 text-violet-700 border-violet-200",
  "bg-sky-100 text-sky-700 border-sky-200",
  "bg-amber-100 text-amber-700 border-amber-200",
  "bg-emerald-100 text-emerald-700 border-emerald-200",
  "bg-pink-100 text-pink-700 border-pink-200",
];

// ─── Tarjeta de vendedor ──────────────────────────────────────────────────────

function TarjetaVendedor({ v }: { v: SeguimientoVendedor }) {
  const [abierto, setAbierto] = useState(false);
  const netoDiferencia = v.sobrantes - v.faltantes;

  return (
    <div className={`rounded-2xl border bg-card shadow-sm overflow-hidden transition-all ${!v.activo ? "opacity-60" : ""}`}>
      {/* Header tarjeta */}
      <button
        className="w-full text-left px-4 pt-4 pb-3"
        onClick={() => setAbierto((p) => !p)}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Avatar + nombre */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
              {iniciales(v.nombre)}
            </div>
            <div className="min-w-0">
              <p className="font-bold truncate">{v.nombre}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{v.rut}</p>
            </div>
          </div>
          {/* Estado + flecha */}
          <div className="flex items-center gap-2 shrink-0">
            {!v.activo && (
              <Badge variant="outline" className="text-[10px]">Inactiva</Badge>
            )}
            {abierto
              ? <ChevronUp className="size-4 text-muted-foreground" />
              : <ChevronDown className="size-4 text-muted-foreground" />}
          </div>
        </div>

        {/* KPIs rápidos */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted/50 px-2 py-2">
            <p className="text-[10px] text-muted-foreground font-medium">Turnos</p>
            <p className="text-lg font-black tabular-nums">{v.totalTurnos}</p>
          </div>
          <div className="rounded-xl bg-muted/50 px-2 py-2">
            <p className="text-[10px] text-muted-foreground font-medium">Total ventas</p>
            <p className="text-sm font-bold tabular-nums truncate">{v.totalTurnos > 0 ? CLP(v.totalVentas) : "—"}</p>
          </div>
          <div className={`rounded-xl px-2 py-2 ${netoDiferencia < 0 ? "bg-red-50 dark:bg-red-950/20" : netoDiferencia > 0 ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-muted/50"}`}>
            <p className="text-[10px] text-muted-foreground font-medium">Diferencia</p>
            <p className={`text-sm font-bold tabular-nums ${netoDiferencia < 0 ? "text-red-600" : netoDiferencia > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
              {v.totalTurnos > 0 ? (netoDiferencia >= 0 ? "+" : "") + CLP(netoDiferencia) : "—"}
            </p>
          </div>
        </div>

        {/* PDVs rotados */}
        {v.porPDV.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {v.porPDV.map((p, i) => (
              <span
                key={p.pdvId}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${COLORES_PDV[i % COLORES_PDV.length]}`}
              >
                <Store size={9} />
                {p.pdvNombre.split(" ")[0]} · {p.dias}d
              </span>
            ))}
          </div>
        )}
      </button>

      {/* Detalle expandible */}
      {abierto && (
        <div className="border-t">
          {/* Por PDV */}
          {v.porPDV.length > 0 && (
            <div className="px-4 py-3 space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Desempeño por sucursal</p>
              {v.porPDV.map((p, i) => (
                <div key={p.pdvId} className="flex items-center gap-3">
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${COLORES_PDV[i % COLORES_PDV.length]}`}>
                    {p.pdvNombre.split(" ")[0]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{p.dias} día{p.dias !== 1 ? "s" : ""}</span>
                      <span className="font-semibold tabular-nums">{CLP(p.ventas)}</span>
                    </div>
                    {/* Mini barra proporcional */}
                    {v.totalVentas > 0 && (
                      <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/60"
                          style={{ width: `${Math.round((p.ventas / v.totalVentas) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Separator />

          {/* Estadísticas detalladas */}
          <div className="px-4 py-3 grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground">Turnos cerrados</p>
              <p className="text-sm font-bold">{v.turnosCerrados} / {v.totalTurnos}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground">Promedio diario</p>
              <p className="text-sm font-bold tabular-nums">{v.totalTurnos > 0 ? CLP(v.promedioDiario) : "—"}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground">Faltantes</p>
              <p className={`text-sm font-bold tabular-nums ${v.faltantes > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                {v.faltantes > 0 ? CLP(v.faltantes) : "—"}
                {v.turnosConFaltante > 0 && (
                  <span className="text-xs font-normal ml-1">({v.turnosConFaltante}t)</span>
                )}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground">Sobrantes</p>
              <p className={`text-sm font-bold tabular-nums ${v.sobrantes > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                {v.sobrantes > 0 ? CLP(v.sobrantes) : "—"}
              </p>
            </div>
          </div>

          <Separator />

          {/* Historial últimos turnos */}
          {v.historial.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Últimos turnos</p>
              <div className="space-y-1.5">
                {v.historial.map((t) => {
                  const [a, m, d] = t.fecha.split("-");
                  const fmtFecha = `${d}/${m}/${a.slice(2)}`;
                  const dif = t.diferencia;
                  return (
                    <div key={t.id} className="flex items-center gap-2 text-xs">
                      <span className="tabular-nums text-muted-foreground w-14 shrink-0">{fmtFecha}</span>
                      <span className="flex-1 truncate text-muted-foreground">{t.pdvNombre.split(" ")[0]}</span>
                      <span className="tabular-nums font-medium">{t.total != null ? CLP(t.total) : "—"}</span>
                      {dif != null && dif !== 0 && (
                        <span className={`tabular-nums font-bold ${dif < 0 ? "text-red-500" : "text-emerald-600"}`}>
                          {dif > 0 ? "+" : ""}{CLP(dif)}
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 py-0 ${t.estado === "CERRADO"
                          ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                          : "bg-amber-500/10 text-amber-700 border-amber-500/30"}`}
                      >
                        {t.estado === "CERRADO" ? "✓" : "•"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {v.historial.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Sin turnos registrados este mes
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function SeguimientoVendedores() {
  const mesActual = new Date().toISOString().slice(0, 7);
  const [mes, setMes] = useState(mesActual);

  const { data: vendedores = [], isLoading } = useQuery({
    queryKey: ["rrhh", "seguimiento", mes],
    queryFn:  () => apiGet<{ data: SeguimientoVendedor[] }>(`/rrhh/seguimiento?mes=${mes}`).then((r) => r.data),
  });

  // Totales del mes
  const totalVentas   = vendedores.reduce((s, v) => s + v.totalVentas, 0);
  const totalTurnos   = vendedores.reduce((s, v) => s + v.totalTurnos, 0);
  const totalFaltante = vendedores.reduce((s, v) => s + v.faltantes, 0);
  const activas       = vendedores.filter((v) => v.totalTurnos > 0).length;

  return (
    <div className="space-y-5">
      {/* ── Selector mes ── */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-base">Seguimiento de vendedores</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMes((m) => navegarMes(m, -1))}
            className="h-8 w-8 flex items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="px-2 text-sm font-semibold min-w-28 text-center">{mesLabel(mes)}</span>
          <button
            onClick={() => setMes((m) => navegarMes(m, 1))}
            disabled={mes >= mesActual}
            className="h-8 w-8 flex items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* ── KPIs del mes ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Activas el mes",   valor: `${activas} / ${vendedores.length}`,   icon: <Users size={15} />,          color: "text-primary" },
          { label: "Total turnos",     valor: String(totalTurnos),                     icon: <CalendarCheck size={15} />,  color: "text-sky-600" },
          { label: "Ventas del mes",   valor: totalTurnos > 0 ? CLP(totalVentas) : "—", icon: <BarChart3 size={15} />,   color: "text-emerald-600" },
          { label: "Faltantes mes",    valor: totalFaltante > 0 ? CLP(totalFaltante) : "—", icon: <AlertTriangle size={15} />, color: totalFaltante > 0 ? "text-red-600" : "text-muted-foreground" },
        ].map(({ label, valor, icon, color }) => (
          <div key={label} className="rounded-2xl border bg-card px-4 py-3">
            <div className={`flex items-center gap-1.5 text-xs font-medium mb-1 ${color}`}>
              {icon} {label}
            </div>
            <p className="text-xl font-black tabular-nums">{valor}</p>
          </div>
        ))}
      </div>

      <Separator />

      {/* ── Tarjetas por vendedora ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Cargando seguimiento…
        </div>
      ) : vendedores.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 border border-dashed rounded-2xl text-muted-foreground">
          <TrendingUp className="size-10 opacity-30" />
          <p className="text-sm">No hay vendedores registrados</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {vendedores
            .sort((a, b) => b.totalTurnos - a.totalTurnos)
            .map((v) => (
              <TarjetaVendedor key={v.id} v={v} />
            ))}
        </div>
      )}

      {/* ── Leyenda diferencias ── */}
      {vendedores.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
          <span className="flex items-center gap-1">
            <TrendingDown className="size-3 text-red-500" /> Faltante (diferencia negativa en caja)
          </span>
          <span className="flex items-center gap-1">
            <TrendingUp className="size-3 text-emerald-500" /> Sobrante (diferencia positiva en caja)
          </span>
          <span className="flex items-center gap-1">
            <Banknote className="size-3" /> Ventas = total calculado por stock flow
          </span>
        </div>
      )}
    </div>
  );
}
