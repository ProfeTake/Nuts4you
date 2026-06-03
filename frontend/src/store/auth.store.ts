// Store de autenticación (Zustand)
// Conectado a POST /api/auth/login y GET /api/auth/me
// El JWT se guarda en localStorage y lib/api.ts lo incluye en cada request.

import { create } from "zustand";
import { apiPost, apiGet } from "@/lib/api";
import type { EstadoAuth, RolUsuario, TipoPDV } from "@/tipos/pos.tipos";

// ─── Tipos de respuesta de la API ─────────────────────────────────────────────

interface PDVResponse {
  id: number;
  nombre: string;
  tipo: string;
  activo: boolean;
}

interface LoginResponse {
  data: {
    token: string;
    usuario: { id: number; rut: string; nombre: string; rol: string };
    pdv: PDVResponse | null;
  };
}

interface MeResponse {
  data: {
    id: number; rut: string; nombre: string; rol: string;
    pdv: PDVResponse | null;
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface AuthState extends EstadoAuth {
  inicializando: boolean;
  iniciarSesion: (rut: string, password: string) => Promise<boolean>;
  cerrarSesion: () => void;
  restaurarSesion: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  autenticado:   false,
  usuario:       null,
  pdv:           null,
  horaIngreso:   null,
  error:         null,
  inicializando: false,

  iniciarSesion: async (rut, password) => {
    set({ error: null });
    try {
      const res = await apiPost<LoginResponse>("/auth/login", { rut, password });
      const { token, usuario, pdv } = res.data;

      localStorage.setItem("token", token);

      set({
        autenticado: true,
        usuario: {
          id:     usuario.id,
          rut:    usuario.rut,
          nombre: usuario.nombre,
          rol:    usuario.rol as RolUsuario,
        },
        pdv: pdv
          ? { id: pdv.id, nombre: pdv.nombre, tipo: pdv.tipo as TipoPDV, activo: pdv.activo }
          : null,
        horaIngreso: new Date().toISOString(),
        error: null,
      });
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error al iniciar sesión";
      set({ autenticado: false, error: msg });
      return false;
    }
  },

  cerrarSesion: () => {
    localStorage.removeItem("token");
    set({
      autenticado: false,
      usuario:     null,
      pdv:         null,
      horaIngreso: null,
      error:       null,
    });
  },

  // Llama a GET /api/auth/me para restaurar sesión desde un token existente
  restaurarSesion: async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    set({ inicializando: true });
    try {
      const res = await apiGet<MeResponse>("/auth/me");
      const { id, rut, nombre, rol, pdv } = res.data;
      set({
        autenticado: true,
        usuario: { id, rut, nombre, rol: rol as RolUsuario },
        pdv: pdv ? { id: pdv.id, nombre: pdv.nombre, tipo: pdv.tipo as TipoPDV, activo: pdv.activo } : null,
        horaIngreso: new Date().toISOString(),
        error: null,
      });
    } catch {
      // Token inválido o expirado — limpiar
      localStorage.removeItem("token");
    } finally {
      set({ inicializando: false });
    }
  },
}));
