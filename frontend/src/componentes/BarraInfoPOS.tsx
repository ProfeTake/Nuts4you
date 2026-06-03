// Barra superior de información del POS: Usuario, PDV y Turno activo

import { Badge } from "@/components/ui/badge";
import { formatearCLP } from "@/lib/money";
import type { SesionPOS } from "@/tipos/pos.tipos";
import { User, Store, Clock, Archive } from "lucide-react";

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
        <User size={16} />
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
        <Store size={16} />
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
        <Clock size={16} />
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
        <Archive size={16} />
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
