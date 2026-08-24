// ─── PanelAdmin ───
// Dashboard del administrador.
// Muestra KPIs del día/mes, gráfico de ventas por sucursal,
// desglose por categoría, proyección y últimos 7 días.

import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign, AlertTriangle, PackageX, TrendingUp,
  ArrowUpRight, ArrowDownRight, Loader2, ChevronDown,
  ChevronUp, CalendarDays, Target, AlertCircle, Receipt, ShieldAlert,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { apiGet } from "@/lib/api";
import { formatearCLP } from "@/lib/money";
import { useNavigate } from "react-router-dom";
import type { ResumenFacturasMes } from "@/tipos/admin.tipos";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface VentaMensualSucursal {
  pdvId: number;
  sucursal: string;
  ventaTotal: number;
  ventaPorCategoria: Record<string, number>;
  promedioDiario: number;
  proyeccionMes: number;
  diasConVenta: number;
}

interface VentaDia { dia: string; fecha: string; monto: number }

interface SucursalHoy {
  pdvId: number;
  nombre: string;
  ventaHoy: number;
  depositoPendiente: number;
  estado: "Al día" | "Pendiente" | "Sin reporte";
  vendedor: string | null;
}

interface ResumenDiarioAPI {
  ventaTotalDia: number;
  pendienteDeposito: number;
  faltantesMes: number;
  turnosFaltante: number;
  alertasBodega: number;
  itemsSinStock: string[];
  ventasMensualesPorSucursal: VentaMensualSucursal[];
  ventasUltimos7Dias: VentaDia[];
  sucursalesHoy: SucursalHoy[];
  mes: string;
  totalMes: number;
  promedioDiarioTotal: number;
  proyeccionTotalMes: number;
  diasMes: number;
  diasTranscurridos: number;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const COLORES = [
  "var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)",
  "var(--color-chart-4)", "var(--color-chart-5)",
];

const COLORES_CAT: Record<string, string> = {
  "Mezclas":   "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  "Paquetes":  "bg-primary/10 text-primary",
  "Promos":    "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  "Líquidos":  "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400",
};

function fmtK(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

function mesLabel(mes: string) {
  const [anio, m] = mes.split('-');
  return new Date(Number(anio), Number(m) - 1, 1)
    .toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
}

// ─── Selector de mes ─────────────────────────────────────────────────────────

function obtenerMesesDisponibles(): string[] {
  const meses: string[] = [];
  const hoy = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return meses;
}

// ─── Tooltip gráfico ─────────────────────────────────────────────────────────

function TooltipGrafico({ active, payload }: { active?: boolean; payload?: { value: number; payload: { sucursal: string } }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground">{payload[0].payload.sucursal}</p>
      <p className="text-sm font-bold">{formatearCLP(payload[0].value)}</p>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function PanelAdmin() {
  const navigate = useNavigate();
  const mesActual = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [mesSeleccionado, setMesSeleccionado] = useState(mesActual);
  const [expandidosSuc, setExpandidosSuc] = useState<Set<number>>(new Set());

  // Fecha para el resumen diario = último día del mes seleccionado (o hoy si es el mes actual)
  const fechaConsulta = mesSeleccionado === mesActual
    ? new Date().toISOString().split('T')[0]
    : (() => {
        const [a, m] = mesSeleccionado.split('-').map(Number);
        const ultimoDia = new Date(a, m, 0).getDate();
        return `${mesSeleccionado}-${String(ultimoDia).padStart(2, '0')}`;
      })();

  const { data: datos, isLoading, error } = useQuery({
    queryKey: ['admin', 'resumen-diario', mesSeleccionado],
    queryFn: () =>
      apiGet<{ data: ResumenDiarioAPI }>(`/admin/resumen-diario?fecha=${fechaConsulta}`).then(r => r.data),
  });

  const { data: resumenFacturas } = useQuery({
    queryKey: ['admin', 'resumen-facturas', mesSeleccionado],
    queryFn: () =>
      apiGet<{ data: ResumenFacturasMes }>(`/proveedores/facturas/resumen?mes=${mesSeleccionado}`).then(r => r.data),
  });

  const { data: cierresHoy = [] } = useQuery({
    queryKey: ['cierres-preventivos', 'hoy'],
    queryFn: () => apiGet<{ data: number[] }>('/cierres-preventivos/hoy').then(r => r.data),
    refetchInterval: 60_000,
  });

  const toggleSucursal = (id: number) =>
    setExpandidosSuc(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (isLoading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (error || !datos) return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
      <AlertTriangle className="size-10 text-amber-500/60" />
      <p className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : 'No se pudo cargar el dashboard'}
      </p>
    </div>
  );

  const ultimos = datos.ventasUltimos7Dias;
  const montoHoy  = ultimos.at(-1)?.monto ?? 0;
  const montoAyer = ultimos.at(-2)?.monto ?? 0;
  const variacion = montoAyer > 0 ? ((montoHoy - montoAyer) / montoAyer) * 100 : 0;
  const progreso  = datos.proyeccionTotalMes > 0 ? Math.min(100, (datos.totalMes / datos.proyeccionTotalMes) * 100) : 0;

  return (
    <div className="space-y-6">

      {/* ── Header con selector de mes ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground capitalize">{mesLabel(mesSeleccionado)}</p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <select
            value={mesSeleccionado}
            onChange={e => setMesSeleccionado(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-ring capitalize"
          >
            {obtenerMesesDisponibles().map(m => (
              <option key={m} value={m} className="capitalize">{mesLabel(m)}</option>
            ))}
          </select>
        </div>
      </div>

      <Separator />

      {/* ── KPI Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

        {/* Venta del día */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Venta Hoy</CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatearCLP(datos.ventaTotalDia)}</p>
            <div className="mt-1 flex items-center gap-1 text-xs">
              {variacion >= 0
                ? <><ArrowUpRight className="size-3 text-emerald-500" /><span className="text-emerald-500">+{variacion.toFixed(1)}% vs ayer</span></>
                : <><ArrowDownRight className="size-3 text-red-500" /><span className="text-red-500">{variacion.toFixed(1)}% vs ayer</span></>
              }
            </div>
          </CardContent>
        </Card>

        {/* Total del mes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total del Mes</CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatearCLP(datos.totalMes)}</p>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Proyección</span>
                <span className="font-medium text-foreground">{formatearCLP(datos.proyeccionTotalMes)}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progreso}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground">{datos.diasTranscurridos} de {datos.diasMes} días · Prom. {formatearCLP(datos.promedioDiarioTotal)}/día</p>
            </div>
          </CardContent>
        </Card>

        {/* Pendiente de depósito */}
        <Card className={datos.pendienteDeposito > 0 ? "border-red-500/40 bg-red-500/5" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pendiente Depósito</CardTitle>
            <AlertTriangle className={`size-4 ${datos.pendienteDeposito > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${datos.pendienteDeposito > 0 ? "text-red-600" : ""}`}>
              {formatearCLP(datos.pendienteDeposito)}
            </p>
            {datos.pendienteDeposito > 0 && (
              <Badge variant="destructive" className="mt-2 text-xs">Requiere atención</Badge>
            )}
          </CardContent>
        </Card>

        {/* Faltantes del mes */}
        <Card className={datos.faltantesMes > 0 ? "border-amber-500/40 bg-amber-500/5" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Faltantes del Mes</CardTitle>
            <AlertCircle className={`size-4 ${datos.faltantesMes > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${datos.faltantesMes > 0 ? "text-amber-600" : ""}`}>
              {formatearCLP(datos.faltantesMes)}
            </p>
            {datos.turnosFaltante > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">{datos.turnosFaltante} turno{datos.turnosFaltante !== 1 ? 's' : ''} con diferencia</p>
            )}
            {datos.alertasBodega > 0 && (
              <div className="mt-2 flex items-center gap-1">
                <PackageX className="size-3 text-amber-500" />
                <span className="text-xs text-amber-600">{datos.alertasBodega} ítems sin stock</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Resumen de compras (Facturas) ── */}
      {resumenFacturas && (resumenFacturas.totalFacturas > 0 || true) && (
        <button
          onClick={() => navigate('/admin/facturas')}
          className="w-full text-left"
        >
          <Card className="hover:border-primary/40 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Receipt className="size-4" />
                Compras a Proveedores — {mesLabel(mesSeleccionado)}
              </CardTitle>
              <span className="text-xs text-muted-foreground">Ver todo →</span>
            </CardHeader>
            <CardContent>
              {resumenFacturas.totalFacturas === 0 ? (
                <p className="text-sm text-muted-foreground">Sin facturas registradas este mes</p>
              ) : (
                <div className="flex flex-wrap items-center gap-6">
                  <div>
                    <p className="text-2xl font-bold tabular-nums">{formatearCLP(resumenFacturas.montoTotal)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{resumenFacturas.totalFacturas} factura{resumenFacturas.totalFacturas !== 1 ? 's' : ''} en el mes</p>
                  </div>
                  {resumenFacturas.pendiente > 0 && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5">
                      <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 tabular-nums">{formatearCLP(resumenFacturas.pendiente)}</p>
                      <p className="text-xs text-amber-600 dark:text-amber-500">por pagar</p>
                    </div>
                  )}
                  {resumenFacturas.pagada > 0 && (
                    <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5">
                      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">{formatearCLP(resumenFacturas.pagada)}</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-500">pagadas</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </button>
      )}

      {/* ── Gráficos ── */}
      <div className="grid gap-4 lg:grid-cols-5">

        {/* Barras: ventas del mes por sucursal */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Ventas del Mes por Sucursal</CardTitle>
                <p className="text-xs text-muted-foreground capitalize">{mesLabel(mesSeleccionado)}</p>
              </div>
              <TrendingUp className="size-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={datos.ventasMensualesPorSucursal} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="sucursal" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<TooltipGrafico />} />
                  <Bar dataKey="ventaTotal" radius={[6, 6, 0, 0]} maxBarSize={56}>
                    {datos.ventasMensualesPorSucursal.map((_, i) => (
                      <Cell key={i} fill={COLORES[i % COLORES.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Proyecciones */}
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {datos.ventasMensualesPorSucursal.map((s, i) => {
                const pct = s.proyeccionMes > 0 ? Math.min(100, (s.ventaTotal / s.proyeccionMes) * 100) : 0;
                return (
                  <div key={s.pdvId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground truncate">{s.sucursal}</span>
                      <span className="text-muted-foreground shrink-0 ml-1">{Math.round(pct)}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: COLORES[i % COLORES.length] }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {formatearCLP(s.ventaTotal)} / {formatearCLP(s.proyeccionMes)} proy.
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Últimos 7 días */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Últimos 7 Días</CardTitle>
            <p className="text-xs text-muted-foreground">Venta consolidada diaria</p>
          </CardHeader>
          <CardContent>
            <div className="h-40 w-full mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={datos.ventasUltimos7Dias} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                  <XAxis dataKey="dia" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={45} />
                  <Tooltip formatter={(v) => [formatearCLP(Number(v)), 'Venta']} />
                  <Line type="monotone" dataKey="monto" stroke="var(--color-chart-1)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {datos.ventasUltimos7Dias.map((dia, i) => {
                const esHoy = i === datos.ventasUltimos7Dias.length - 1;
                const anterior = i > 0 ? datos.ventasUltimos7Dias[i - 1].monto : dia.monto;
                const sube = dia.monto >= anterior;
                return (
                  <div key={dia.fecha} className={`flex items-center justify-between rounded-lg px-3 py-1.5 ${esHoy ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${esHoy ? "text-primary font-semibold" : ""}`}>{dia.dia}</span>
                      {esHoy && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Hoy</Badge>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold tabular-nums">{formatearCLP(dia.monto)}</span>
                      {sube ? <ArrowUpRight className="size-3.5 text-emerald-500" /> : <ArrowDownRight className="size-3.5 text-red-500" />}
                    </div>
                  </div>
                );
              })}
            </div>
            <Separator className="my-3" />
            <div className="flex items-center justify-between px-3">
              <span className="text-sm text-muted-foreground">Total semanal</span>
              <span className="text-base font-bold">{formatearCLP(datos.ventasUltimos7Dias.reduce((s, d) => s + d.monto, 0))}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Estado de Sucursales Hoy con desglose por categoría ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Estado de Sucursales — Hoy</CardTitle>
          <p className="text-xs text-muted-foreground">Toca una fila para ver el desglose por categoría del mes</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 pb-3 pt-3 font-medium">Sucursal</th>
                  <th className="px-4 pb-3 pt-3 font-medium text-right">Venta Hoy</th>
                  <th className="px-4 pb-3 pt-3 font-medium text-right hidden sm:table-cell">Dep. Pendiente</th>
                  <th className="px-4 pb-3 pt-3 font-medium text-right hidden md:table-cell">Total Mes</th>
                  <th className="px-4 pb-3 pt-3 font-medium text-center">Estado</th>
                  <th className="px-4 pb-3 pt-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {datos.sucursalesHoy.map((suc) => {
                  const metricas = datos.ventasMensualesPorSucursal.find(v => v.pdvId === suc.pdvId);
                  const expandida = expandidosSuc.has(suc.pdvId);
                  return (
                    <Fragment key={suc.pdvId}>
                      <tr
                        className="border-b cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => toggleSucursal(suc.pdvId)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold">{suc.nombre}</p>
                            {cierresHoy.includes(suc.pdvId) && (
                              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 gap-0.5">
                                <ShieldAlert className="size-2.5" />
                                Cierre prev.
                              </Badge>
                            )}
                          </div>
                          {suc.vendedor && <p className="text-xs text-muted-foreground">{suc.vendedor}</p>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{formatearCLP(suc.ventaHoy)}</td>
                        <td className={`px-4 py-3 text-right tabular-nums hidden sm:table-cell ${suc.depositoPendiente > 0 ? "font-semibold text-red-600" : "text-muted-foreground"}`}>
                          {formatearCLP(suc.depositoPendiente)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell text-muted-foreground">
                          {metricas ? formatearCLP(metricas.ventaTotal) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            variant={suc.estado === "Al día" ? "secondary" : suc.estado === "Pendiente" ? "destructive" : "outline"}
                            className={suc.estado === "Al día" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : ""}
                          >
                            {suc.estado}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {expandida
                            ? <ChevronUp className="size-4 text-muted-foreground" />
                            : <ChevronDown className="size-4 text-muted-foreground" />
                          }
                        </td>
                      </tr>

                      {/* Desglose expandido */}
                      {expandida && metricas && (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

                              {/* Desglose por categoría del mes.
                                  El modelo stock-flow no persiste venta por categoría
                                  (solo total_calculado), así que hoy llega vacío: sin
                                  esta guarda se veía un encabezado con nada debajo (C14). */}
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Venta del mes por categoría</p>
                                {Object.keys(metricas.ventaPorCategoria).length > 0 ? (
                                  <div className="space-y-1.5">
                                    {Object.entries(metricas.ventaPorCategoria)
                                      .sort(([, a], [, b]) => b - a)
                                      .map(([cat, monto]) => (
                                        <div key={cat} className="flex items-center justify-between">
                                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${COLORES_CAT[cat] ?? "bg-muted text-muted-foreground"}`}>
                                            {cat}
                                          </span>
                                          <span className="text-xs font-bold tabular-nums">{formatearCLP(monto)}</span>
                                        </div>
                                      ))
                                    }
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground italic">
                                    El detalle por categoría no se registra en el cierre de turno.
                                  </p>
                                )}
                              </div>

                              {/* Métricas del mes */}
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Métricas del mes</p>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between"><span className="text-muted-foreground">Total mes</span><span className="font-bold tabular-nums">{formatearCLP(metricas.ventaTotal)}</span></div>
                                  <div className="flex justify-between"><span className="text-muted-foreground">Promedio diario</span><span className="font-semibold tabular-nums">{formatearCLP(metricas.promedioDiario)}</span></div>
                                  <div className="flex justify-between"><span className="text-muted-foreground">Días con venta</span><span className="font-semibold">{metricas.diasConVenta}</span></div>
                                </div>
                              </div>

                              {/* Proyección */}
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Proyección del mes</p>
                                <div className="flex items-center gap-2 mb-2">
                                  <Target className="size-4 text-primary shrink-0" />
                                  <span className="text-lg font-black tabular-nums text-primary">{formatearCLP(metricas.proyeccionMes)}</span>
                                </div>
                                {metricas.proyeccionMes > 0 && (
                                  <>
                                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-primary transition-all"
                                        style={{ width: `${Math.min(100, (metricas.ventaTotal / metricas.proyeccionMes) * 100)}%` }}
                                      />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-1">
                                      {Math.round((metricas.ventaTotal / metricas.proyeccionMes) * 100)}% de la proyección
                                    </p>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
