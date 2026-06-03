// Hook de autenticación — thin wrapper sobre useAuthStore (Zustand)
// Mantiene la misma interfaz para App.tsx y Login.tsx

import { useAuthStore } from "@/store/auth.store";

export function useAuth() {
  const {
    autenticado, usuario, pdv, horaIngreso, error,
    inicializando, iniciarSesion, cerrarSesion, restaurarSesion,
  } = useAuthStore();

  const estado = { autenticado, usuario, pdv, horaIngreso, error };

  const horaIngresoFormateada = horaIngreso
    ? new Date(horaIngreso).toLocaleTimeString("es-CL", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return {
    estado,
    inicializando,
    horaIngresoFormateada,
    iniciarSesion,
    cerrarSesion,
    restaurarSesion,
  };
}
