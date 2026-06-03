// Hook del turno POS — thin wrapper sobre useCajaStore (Zustand)
// Lee el turno del store y solo lo expone si pertenece al usuario+PDV actual
// y está en estado ABIERTO (guard contra turnos stale de otra sesión).
// TODO: Conectar abrirTurno con POST /api/pos/turnos en Fase 3

import { useCallback } from "react";
import { useCajaStore } from "@/store/caja.store";
import type {
  SesionPOS,
  UsuarioSesion,
  PDVActivo,
  ItemInventarioInicial,
} from "@/tipos/pos.tipos";

export function useSesionPOS(usuario: UsuarioSesion, pdv: PDVActivo) {
  const { turno, abrirTurno: abrirTurnoStore } = useCajaStore();

  // Solo usar el turno si pertenece a este usuario+PDV y está ABIERTO
  const turnoValido =
    turno &&
    turno.usuarioId === usuario.id &&
    turno.pdvId === pdv.id &&
    turno.estado === "ABIERTO"
      ? turno
      : null;

  const sesion: SesionPOS = {
    usuario,
    pdv,
    turno: turnoValido,
    cargando: false,
    error: null,
  };

  const abrirTurno = useCallback(
    (saldoInicial: number, inventario: ItemInventarioInicial[]) => {
      abrirTurnoStore(saldoInicial, pdv.id, usuario.id, inventario);
    },
    [abrirTurnoStore, pdv.id, usuario.id]
  );

  const horaApertura = turnoValido
    ? new Date(turnoValido.fechaApertura).toLocaleTimeString("es-CL", {
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
