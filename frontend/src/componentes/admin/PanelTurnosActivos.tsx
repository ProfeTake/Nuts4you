// ─── PanelTurnosActivos ───
// Panel "Turnos activos ahora" del módulo de Sucursales: qué puntos de venta
// están operando en este momento, desde qué fecha/hora está abierta la caja,
// quién la abrió y el movimiento de efectivo registrado durante el turno.
// Al tocar una tarjeta se cargan abajo la sucursal y el día de apertura.

import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Store,
  User,
  CalendarClock,
  Wallet,
  ArrowDownRight,
  Receipt,
  AlertTriangle,
  Loader2,
  MoonStar,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/api";
import { formatearCLP } from "@/lib/money";
import type { TurnosActivosResumen, TurnoActivoDetalle } from "@/tipos/admin.tipos";

// ─── Helpers ───

/** Duración legible a partir de los minutos abiertos que informa el backend. */
function formatearDuracion(minutos: number) {
  const dias  = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const mins  = minutos % 60;
  if (dias > 0)  return `${dias} d ${horas} h`;
  if (horas > 0) return `${horas} h ${mins} min`;
  return `${mins} min`;
}

function fechaLarga(iso: string) {
  return format(parseISO(iso), "EEE dd/MM/yyyy", { locale: es });
}

function fechaCorta(iso: string) {
  return format(parseISO(iso), "dd/MM", { locale: es });
}

function horaCorta(iso: string) {
  return format(parseISO(iso), "HH:mm", { locale: es });
}

// ─── Tarjeta de un turno abierto ───

function TarjetaTurnoActivo({
  turno,
  seleccionado,
  onSeleccionar,
}: {
  turno: TurnoActivoDetalle;
  seleccionado: boolean;
  onSeleccionar: () => void;
}) {
  // Turno arrastrado de días anteriores: el vendedor nunca cerró caja.
  const arrastrado = turno.diasAbierto > 0;

  return (
    <button
      type="button"
      onClick={onSeleccionar}
      className={`text-left rounded-xl border px-4 py-3.5 transition-colors ${
        seleccionado
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : arrastrado
            ? "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10"
            : "hover:bg-muted/40"
      }`}
    >
      {/* Sucursal + turno */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-semibold text-sm truncate">
          <Store className="size-4 text-muted-foreground shrink-0" />
          {turno.pdvNombre}
        </span>
        <Badge variant="outline" className="text-[10px] shrink-0">
          Turno #{turno.turnoId}
        </Badge>
      </div>

      {/* Desde cuándo está abierto el punto */}
      <div className="mt-2.5 rounded-lg bg-muted/50 px-3 py-2">
        <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
          Abierto desde
        </p>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold tabular-nums">
          <span className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5 text-muted-foreground" />
            {fechaLarga(turno.fechaApertura)}
          </span>
          <span>{horaCorta(turno.fechaApertura)}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {turno.diasAbierto === 0 && "Hoy · "}
          {turno.diasAbierto === 1 && "Ayer · "}
          lleva {formatearDuracion(turno.minutosAbierto)} abierta
        </p>
      </div>

      {/* Vendedor + movimiento de caja */}
      <div className="mt-2.5 grid gap-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 truncate">
          <User className="size-3.5 shrink-0" />
          {turno.vendedor}
        </span>
        <span className="flex items-center gap-1.5">
          <Wallet className="size-3.5 shrink-0" />
          Caja chica de apertura:{" "}
          <strong className="text-foreground tabular-nums">{formatearCLP(turno.saldoInicial)}</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <ArrowDownRight className="size-3.5 shrink-0" />
          Retiros:{" "}
          <strong className="text-foreground tabular-nums">{formatearCLP(turno.totalRetiros)}</strong>
          <span className="text-[11px]">({turno.cantidadRetiros})</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Receipt className="size-3.5 shrink-0" />
          Gastos:{" "}
          <strong className="text-foreground tabular-nums">{formatearCLP(turno.totalGastos)}</strong>
          <span className="text-[11px]">({turno.cantidadGastos})</span>
        </span>
      </div>

      {arrastrado && (
        <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          Caja sin cerrar desde el {fechaCorta(turno.fechaApertura)}
          {turno.diasAbierto > 1 && ` (${turno.diasAbierto} días)`}
        </div>
      )}
    </button>
  );
}

// ─── Panel ───

export function PanelTurnosActivos({
  pdvSeleccionado,
  onSeleccionar,
  habilitado = true,
}: {
  pdvSeleccionado: number | "";
  /** Carga abajo la sucursal + el día de apertura del turno elegido */
  onSeleccionar: (pdvId: number, diaApertura: string) => void;
  habilitado?: boolean;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "turnos-activos"],
    queryFn: () =>
      apiGet<{ data: TurnosActivosResumen }>("/admin/turnos-activos").then((r) => r.data),
    enabled: habilitado,
    // Es una foto del "ahora": se refresca sola para que el admin vea aperturas
    // y cierres sin recargar la página.
    refetchInterval: 30_000,
  });

  const turnos       = data?.turnos ?? [];
  const pdvsSinTurno = data?.pdvsSinTurno ?? [];
  const totalPdvs    = data?.totalPdvs ?? 0;

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-3">
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
          </span>
          <p className="text-sm font-semibold">Turnos activos ahora</p>
        </div>
        {!isLoading && !isError && (
          <Badge variant="outline" className="text-xs">
            {turnos.length} de {totalPdvs} punto{totalPdvs !== 1 ? "s" : ""} abierto
            {turnos.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando turnos abiertos…
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No se pudieron cargar los turnos abiertos
        </div>
      ) : turnos.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/10 px-4 py-6 text-center">
          <MoonStar className="mx-auto mb-2 size-7 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No hay ningún punto de venta con la caja abierta en este momento
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Toca un turno para ver abajo su cierre y ventas del día.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {turnos.map((t) => (
              <TarjetaTurnoActivo
                key={t.turnoId}
                turno={t}
                seleccionado={pdvSeleccionado === t.pdvId}
                onSeleccionar={() => onSeleccionar(t.pdvId, t.diaApertura)}
              />
            ))}
          </div>
        </>
      )}

      {/* Puntos activos que no están operando ahora */}
      {!isLoading && !isError && pdvsSinTurno.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
          <span className="font-medium">Sin turno abierto:</span>
          {pdvsSinTurno.map((p) => (
            <span key={p.pdvId} className="rounded-md bg-muted px-2 py-0.5">
              {p.pdvNombre}
              <span className="text-muted-foreground/70">
                {p.ultimoCierre
                  ? ` · último cierre ${fechaLarga(p.ultimoCierre)} ${horaCorta(p.ultimoCierre)}`
                  : " · sin cierres registrados"}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
