// Hook de autenticación local (sin backend)
// TODO: Reemplazar con autenticación JWT real contra el backend
//
// Flujo: Login → guarda { usuario, pdv, horaIngreso } en state
// La hora de ingreso queda registrada en el momento en que el vendedor
// ingresa sus credenciales correctamente.

import { useState, useCallback } from "react";
import { credencialesMock } from "@/datos/mock.datos";
import type { EstadoAuth } from "@/tipos/pos.tipos";

// ─── Utilidades ─────────────────────────────────────────────────────────────

// Normaliza un RUT para comparación: quita puntos, espacios y convierte a minúsculas
// "12.345.678-9" → "123456789"  |  "12345678-9" → "123456789"
function normalizarRUT(rut: string): string {
  return rut.replace(/[.\s]/g, "").toLowerCase();
}

// ─── Hook principal ─────────────────────────────────────────────────────────

export function useAuth() {
  const [estado, setEstado] = useState<EstadoAuth>({
    autenticado: false,
    usuario: null,
    pdv: null,
    horaIngreso: null,
    error: null,
  });

  // Intenta iniciar sesión con las credenciales dadas.
  // Registra la hora exacta del ingreso si son válidas.
  // TODO: POST /api/auth/login → recibir JWT y datos de usuario/PDV
  const iniciarSesion = useCallback(
    (rut: string, password: string): boolean => {
      const rutNormalizado = normalizarRUT(rut);

      const credencial = credencialesMock.find(
        (c) =>
          normalizarRUT(c.rut) === rutNormalizado &&
          c.passwordHash === password
      );

      if (!credencial) {
        setEstado((prev) => ({
          ...prev,
          autenticado: false,
          error: "RUT o contraseña incorrectos",
        }));
        return false;
      }

      setEstado({
        autenticado: true,
        usuario: credencial.usuario,
        pdv: credencial.pdv,
        horaIngreso: new Date().toISOString(),
        error: null,
      });
      return true;
    },
    []
  );

  const cerrarSesion = useCallback(() => {
    setEstado({
      autenticado: false,
      usuario: null,
      pdv: null,
      horaIngreso: null,
      error: null,
    });
  }, []);

  // Hora formateada para mostrar en UI
  const horaIngresoFormateada = estado.horaIngreso
    ? new Date(estado.horaIngreso).toLocaleTimeString("es-CL", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return {
    estado,
    horaIngresoFormateada,
    iniciarSesion,
    cerrarSesion,
  };
}
