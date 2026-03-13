// Barra superior de información del POS: Usuario, PDV y Turno activo

import { Badge } from "@/components/ui/badge";
import { formatearCLP } from "@/hooks/useCarrito";
import type { SesionPOS } from "@/tipos/pos.tipos";

// ─── Iconos ─────────────────────────────────────────────────────────────────

function IconoUsuario() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconoTienda() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
      <path d="M2 7h20" />
      <path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7" />
    </svg>
  );
}

function IconoReloj() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconoCaja() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface BarraInfoPOSProps {
  sesion: SesionPOS;
  horaApertura: string | null;
}

// ─── Componente ─────────────────────────────────────────────────────────────

export default function BarraInfoPOS({ sesion, horaApertura }: BarraInfoPOSProps) {
  const { usuario, pdv, turno, cargando } = sesion;

  if (cargando) {
    return (
      <div className="flex h-12 items-center justify-center border-b bg-muted/30 px-4">
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!usuario || !pdv || !turno) {
    return (
      <div className="flex h-12 items-center justify-center border-b bg-destructive/10 px-4">
        <span className="text-sm font-medium text-destructive">
          Sin sesión activa — Inicie sesión y abra un turno
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted/30 px-4 py-2">
      {/* Usuario */}
      <div className="flex items-center gap-1.5">
        <IconoUsuario />
        <span className="text-sm font-semibold text-foreground">
          {usuario.nombre}
        </span>
        <Badge variant="outline" className="text-[10px] uppercase">
          {usuario.rol}
        </Badge>
      </div>

      {/* Separador visual */}
      <div className="hidden h-4 w-px bg-border sm:block" />

      {/* PDV */}
      <div className="flex items-center gap-1.5">
        <IconoTienda />
        <span className="text-sm text-muted-foreground">
          {pdv.nombre}
        </span>
        <Badge
          variant="secondary"
          className="text-[10px] uppercase"
        >
          {pdv.tipo}
        </Badge>
      </div>

      {/* Separador visual */}
      <div className="hidden h-4 w-px bg-border sm:block" />

      {/* Turno */}
      <div className="flex items-center gap-1.5">
        <IconoReloj />
        <span className="text-sm text-muted-foreground">
          Turno #{turno.id}
        </span>
        <Badge
          variant={turno.estado === "ABIERTO" ? "default" : "secondary"}
          className={
            turno.estado === "ABIERTO"
              ? "bg-emerald-600 text-[10px] uppercase text-white hover:bg-emerald-700"
              : "text-[10px] uppercase"
          }
        >
          {turno.estado}
        </Badge>
      </div>

      {/* Separador visual */}
      <div className="hidden h-4 w-px bg-border sm:block" />

      {/* Saldo inicial + hora apertura */}
      <div className="flex items-center gap-1.5">
        <IconoCaja />
        <span className="text-sm text-muted-foreground">
          Apertura: {horaApertura}
        </span>
        <span className="text-sm font-medium tabular-nums text-foreground">
          {formatearCLP(turno.saldoInicial)}
        </span>
      </div>
    </div>
  );
}
