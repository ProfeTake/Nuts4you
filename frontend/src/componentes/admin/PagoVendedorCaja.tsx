// ─── PagoVendedorCaja ─────────────────────────────────────────────────────────
// "Pagar a Vendedor": el admin le paga al vendedor con el efectivo que acaba de
// recibir en el punto, y ese monto se descuenta del "a depositar" de ESE turno.
//
// Réplica de la planilla del cliente ("01 Mall Patio Feb 2026.xlsx"): la hoja de
// cada día tiene la celda F29 "Pagado a Vendedor (DC)" y el a depositar sale de
//
//   P22 (A DEPOSITAR) = P15 (venta) + P26 (diferencia) − P21 (gastos) − F29
//
// El vendedor a pagar NO tiene que ser el del turno ni los turnos que se liquidan
// tienen que ser de esta sucursal: se paga una deuda acumulada con la caja que
// haya. Por eso el combo lista a todos los vendedores con sus turnos impagos.

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HandCoins, Loader2, Minus, Plus, AlertCircle, CheckCircle2, User } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import type { PagoDesdeCaja, PendientesDePago } from "@/tipos/admin.tipos";
import { apiGet, apiPost } from "@/lib/api";
import { formatearCLP } from "@/lib/money";
import { toast } from "sonner";

interface Props {
  /** Turno del punto cuya caja paga (de su depósito sale la plata). */
  turnoId: number;
  pdvNombre: string;
  /** A depositar actual del turno, ya neteado de pagos anteriores. */
  aDepositar: number;
  /** El depósito ya se registró en Finanzas: no admite más descuentos. */
  depositoBloqueado: boolean;
  /** Pagos ya hechos con esta caja. */
  pagosVendedor: PagoDesdeCaja[];
  /** Refresca el reporte del turno tras pagar. */
  onPagado: () => void;
}

const fmtFecha = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "2-digit" });

export function PagoVendedorCaja({
  turnoId, pdvNombre, aDepositar, depositoBloqueado, pagosVendedor, onPagado,
}: Props) {
  const [usuarioId, setUsuarioId] = useState<number | "">("");
  const [cantidad, setCantidad]   = useState(1);
  const [confirmando, setConfirmando] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "pagos-pendientes"],
    queryFn:  () => apiGet<{ data: PendientesDePago }>("/rrhh/pagos/pendientes").then(r => r.data),
    retry: false,
  });

  const vendedores = useMemo(() => data?.vendedores ?? [], [data]);
  const vendedor   = vendedores.find(v => v.usuarioId === usuarioId) ?? null;
  const maximo     = vendedor?.turnosPendientes ?? 0;

  // Al cambiar de vendedor la cantidad vuelve a 1: arrastrar "5 turnos" a alguien
  // que solo tiene 2 pendientes mandaría un pago que el backend rechaza.
  const elegirVendedor = (id: number) => {
    setUsuarioId(id);
    setCantidad(1);
    setConfirmando(false);
  };

  const acumulado    = vendedor?.acumulados[cantidad - 1] ?? null;
  const aPagar       = acumulado?.montoTotal ?? 0;
  const turnosAPagar = vendedor?.turnos.slice(0, cantidad) ?? [];
  const restante     = aDepositar - aPagar;

  const mutacion = useMutation({
    mutationFn: () =>
      apiPost<{ data: { mensaje: string; deposito: { aDepositar: number } } }>(
        "/rrhh/pagos/directo",
        { usuarioId, cantidadTurnos: cantidad, turnoId },
      ),
    onSuccess: (res) => {
      // El pago toca el reporte del turno, la lista de pendientes, el historial
      // de pagos de RRHH y los depósitos/dashboard (bajó el "a depositar").
      queryClient.invalidateQueries({ queryKey: ["admin", "pagos-pendientes"] });
      queryClient.invalidateQueries({ queryKey: ["rrhh", "pagos"] });
      queryClient.invalidateQueries({ queryKey: ["finanzas", "depositos"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "resumen"] });
      onPagado();
      setUsuarioId("");
      setConfirmando(false);
      toast.success(res.data.mensaje, {
        description: `${pdvNombre} queda con ${formatearCLP(res.data.deposito.aDepositar)} por depositar.`,
        duration: 8000,
      });
    },
    onError: (err) => {
      setConfirmando(false);
      toast.error(err instanceof Error ? err.message : "No se pudo registrar el pago", { duration: 10000 });
    },
  });

  const yaPagado = pagosVendedor.reduce((s, p) => s + p.montoTotal, 0);

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <HandCoins className="size-5 text-amber-600" />
          Pagar a Vendedor
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Se le paga con el efectivo de {pdvNombre} y el monto se descuenta del <strong>a depositar</strong> de este turno.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Pagos ya hechos con esta caja */}
        {pagosVendedor.length > 0 && (
          <div className="rounded-xl border bg-background overflow-hidden">
            <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Ya pagado con esta caja
              </p>
              <Badge variant="secondary" className="text-xs tabular-nums">{formatearCLP(yaPagado)}</Badge>
            </div>
            <div className="divide-y divide-border/60">
              {pagosVendedor.map(p => (
                <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.vendedor}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.turnosPagados} turno(s){p.creadoPor ? ` · pagó ${p.creadoPor}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold tabular-nums text-amber-600">
                    −{formatearCLP(p.montoTotal)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {depositoBloqueado ? (
          <div className="flex items-start gap-2 rounded-lg border border-dashed px-4 py-3">
            <AlertCircle className="size-4 shrink-0 text-muted-foreground mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              El depósito de este turno ya fue registrado en Finanzas, así que su
              &quot;a depositar&quot; no admite más descuentos. Para pagar con esta caja hay que
              revertir primero el depósito.
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Cargando vendedores…
          </div>
        ) : isError ? (
          <p className="text-sm text-red-600">
            {error instanceof Error ? error.message : "No se pudieron cargar los vendedores"}
          </p>
        ) : (
          <>
            {/* Vendedor */}
            <div className="space-y-1.5">
              <Label htmlFor="pago-vendedor">Vendedor/a</Label>
              <Select
                value={usuarioId !== "" ? String(usuarioId) : undefined}
                onValueChange={(v) => elegirVendedor(Number(v))}
              >
                <SelectTrigger id="pago-vendedor" className="w-full">
                  <SelectValue placeholder="Selecciona a quién pagar">
                    {vendedor ? vendedor.nombre : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {vendedores.map(v => (
                    <SelectItem key={v.usuarioId} value={String(v.usuarioId)} disabled={v.turnosPendientes === 0}>
                      <span className="flex w-full items-center justify-between gap-3">
                        <span>{v.nombre}</span>
                        <span className="text-xs text-muted-foreground">
                          {v.turnosPendientes === 0
                            ? "sin turnos por pagar"
                            : `${v.turnosPendientes} turno(s) por pagar`}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {vendedores.length === 0 && (
                <p className="text-xs text-muted-foreground">No hay vendedores activos.</p>
              )}
            </div>

            {vendedor && maximo === 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  {vendedor.nombre} no tiene turnos pendientes de pago. Solo entran los turnos
                  cerrados <strong>con recepción de dinero confirmada</strong>.
                </p>
              </div>
            )}

            {vendedor && maximo > 0 && acumulado && (
              <>
                {/* Cuántos turnos se pagan */}
                <div className="space-y-1.5">
                  <Label>¿Cuántos turnos le pagas? (1 a {maximo})</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button" variant="outline" size="icon"
                      onClick={() => setCantidad(c => Math.max(1, c - 1))}
                      disabled={cantidad <= 1}
                      aria-label="Un turno menos"
                    >
                      <Minus className="size-4" />
                    </Button>
                    <div className="flex h-10 min-w-16 items-center justify-center rounded-lg border bg-background px-4 text-lg font-bold tabular-nums">
                      {cantidad}
                    </div>
                    <Button
                      type="button" variant="outline" size="icon"
                      onClick={() => setCantidad(c => Math.min(maximo, c + 1))}
                      disabled={cantidad >= maximo}
                      aria-label="Un turno más"
                    >
                      <Plus className="size-4" />
                    </Button>
                    {maximo > 1 && (
                      <Button
                        type="button" variant="ghost" size="sm" className="ml-1"
                        onClick={() => setCantidad(maximo)}
                        disabled={cantidad === maximo}
                      >
                        Todos ({maximo})
                      </Button>
                    )}
                  </div>
                </div>

                {/* Qué turnos se liquidan — los más antiguos primero */}
                <div className="rounded-xl border bg-background overflow-hidden">
                  <div className="border-b bg-muted/40 px-4 py-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Turnos que se liquidan (del más antiguo)
                    </p>
                  </div>
                  <div className="max-h-44 divide-y divide-border/60 overflow-y-auto">
                    {turnosAPagar.map(t => (
                      <div key={t.turnoId} className="flex items-center justify-between px-4 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium">{fmtFecha(t.fecha)} · {t.pdvNombre}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Venta {formatearCLP(t.venta)}
                            {t.bono > 0 && ` · bono ${formatearCLP(t.bono)}`}
                            {t.montoExtra > 0 && ` · h. extra ${formatearCLP(t.montoExtra)}`}
                          </p>
                        </div>
                        {t.diferenciaCaja !== 0 && (
                          <span className={`shrink-0 text-xs font-semibold tabular-nums ${t.diferenciaCaja < 0 ? "text-red-600" : "text-blue-600"}`}>
                            {t.diferenciaCaja > 0 ? "+" : ""}{formatearCLP(t.diferenciaCaja)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cálculo del pago (mismo de la Nómina) */}
                <div className="rounded-xl border bg-background overflow-hidden text-sm">
                  <div className="divide-y divide-border/60">
                    <FilaPago label={`Pago diario × ${cantidad}`} valor={formatearCLP(acumulado.montoBase)} />
                    {acumulado.montoBonos > 0 && (
                      <FilaPago label="+ Bonos por venta" valor={`+${formatearCLP(acumulado.montoBonos)}`} clase="text-emerald-600" />
                    )}
                    {acumulado.montoExtras > 0 && (
                      <FilaPago label="+ Horas extra" valor={`+${formatearCLP(acumulado.montoExtras)}`} clase="text-emerald-600" />
                    )}
                    {acumulado.montoDescuentos > 0 && (
                      <FilaPago
                        label="− Descuento por faltantes de caja"
                        valor={`-${formatearCLP(acumulado.montoDescuentos)}`}
                        clase="text-red-600"
                      />
                    )}
                    <FilaPago label="= Total a pagar" valor={formatearCLP(aPagar)} clase="font-bold text-primary" />
                  </div>
                </div>

                {/* Descuadres que no alcanzaron a generar descuento: se avisa igual
                    porque explican por qué el total no es base + bonos exacto. */}
                {acumulado.montoDescuentos === 0 && acumulado.netoCaja !== 0 && (
                  <p className="text-xs text-muted-foreground">
                    Neto de caja del período: {acumulado.netoCaja > 0 ? "+" : ""}{formatearCLP(acumulado.netoCaja)} —
                    dentro de la tolerancia ({formatearCLP(data?.toleranciaFaltante ?? 0)}), no se descuenta.
                  </p>
                )}

                {/* Impacto en el a depositar del punto */}
                <div className={`rounded-xl border px-4 py-3 ${restante < 0 ? "border-red-500/40 bg-red-500/5" : "border-primary/30 bg-primary/5"}`}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">A depositar de {pdvNombre}</span>
                    <span className="tabular-nums">{formatearCLP(aDepositar)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">− Este pago</span>
                    <span className="tabular-nums text-amber-600">-{formatearCLP(aPagar)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between border-t pt-1.5 text-sm font-bold">
                    <span>Queda por depositar</span>
                    <span className={`tabular-nums ${restante < 0 ? "text-red-600" : "text-primary"}`}>
                      {formatearCLP(restante)}
                    </span>
                  </div>
                  {restante < 0 && (
                    <p className="mt-2 text-xs leading-relaxed text-red-600 dark:text-red-400">
                      Le estás pagando más de lo que recaudó este turno: el punto queda con un
                      depósito negativo y esa diferencia se arrastra. Es posible (pasa en la
                      planilla), pero conviene repartir el pago entre varios días.
                    </p>
                  )}
                </div>

                {/* Confirmación en dos pasos: mueve plata real y marca turnos como pagados */}
                {!confirmando ? (
                  <Button className="w-full sm:w-auto" onClick={() => setConfirmando(true)}>
                    <HandCoins className="size-4 mr-2" />
                    Pagar {formatearCLP(aPagar)} a {vendedor.nombre}
                  </Button>
                ) : (
                  <div className="space-y-2.5 rounded-lg border border-amber-300 bg-amber-50/60 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/20">
                    <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-400">
                      <strong>Se le entregan {formatearCLP(aPagar)} a {vendedor.nombre}</strong> con el efectivo de{" "}
                      {pdvNombre}. Sus {cantidad} turno(s) quedan <strong>pagados</strong> y el a depositar de este
                      turno baja a {formatearCLP(restante)}. Se puede revertir anulando el pago en Personal → Pagos.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => mutacion.mutate()} disabled={mutacion.isPending}>
                        {mutacion.isPending
                          ? <Loader2 className="size-4 animate-spin mr-2" />
                          : <CheckCircle2 className="size-4 mr-2" />}
                        Confirmar pago
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmando(false)} disabled={mutacion.isPending}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {!vendedor && (
              <div className="flex items-start gap-2 rounded-lg border border-dashed px-4 py-3">
                <User className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Elige un/a vendedor/a para ver cuántos turnos tiene sin pagar y cuánto se le debe.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FilaPago({ label, valor, clase = "text-foreground" }: { label: string; valor: string; clase?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm tabular-nums ${clase}`}>{valor}</span>
    </div>
  );
}
