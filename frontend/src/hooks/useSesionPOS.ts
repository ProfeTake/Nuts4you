// Hook para manejar el turno activo del POS.
// El usuario y PDV ya vienen autenticados desde useAuth.
// TODO: Conectar abrirTurno con POST /api/turnos/abrir en el backend.

import { useState, useCallback } from "react";
import type {
  SesionPOS,
  UsuarioSesion,
  PDVActivo,
  TurnoActivo,
  ItemInventarioInicial,
} from "@/tipos/pos.tipos";

// ─── Hook principal ─────────────────────────────────────────────────────────

export function useSesionPOS(usuario: UsuarioSesion, pdv: PDVActivo) {
  const [turno, setTurno] = useState<TurnoActivo | null>(null);

  const sesion: SesionPOS = {
    usuario,
    pdv,
    turno,
    cargando: false,
    error: null,
  };

  // Abre el turno tras completar el wizard de apertura
  // TODO: POST /api/turnos/abrir { saldoInicial, inventario[] }
  const abrirTurno = useCallback(
    (saldoInicial: number, _inventario: ItemInventarioInicial[]) => {
      const nuevoTurno: TurnoActivo = {
        id: Math.floor(Math.random() * 9000) + 1000,
        pdvId: pdv.id,
        usuarioId: usuario.id,
        fechaApertura: new Date().toISOString(),
        saldoInicial,
        estado: "ABIERTO",
      };
      // TODO: Enviar inventario verificado al backend para registrar discrepancias
      setTurno(nuevoTurno);
    },
    [pdv.id, usuario.id]
  );

  // Hora formateada de apertura del turno
  const horaApertura = turno
    ? new Date(turno.fechaApertura).toLocaleTimeString("es-CL", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return {
    sesion,
    horaApertura,
    abrirTurno,
  };
}
