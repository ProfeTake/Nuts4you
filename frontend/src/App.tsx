import { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

// Páginas
import Login from "@/paginas/Login";
import AperturaTurno from "@/paginas/AperturaTurno";
import POSDashboard from "@/paginas/POSDashboard";
import SolicitudesPDV from "@/paginas/SolicitudesPDV";
import MisCierres from "@/paginas/MisCierres";

// Admin
import {
  LayoutAdmin,
  PanelAdmin,
  ControlVentasSucursal,
  GestorInventario,
  Finanzas,
  ModuloRRHH,
  GestorUsuarios,
  GestorCierrePreventivo,
  PreparacionSiguienteTurno,
  HorariosTurnos,
  AutorizarGastos,
} from "@/componentes/admin";

// Layouts
import BarraLateral from "@/componentes/layout/BarraLateral";
import { ErrorBoundary } from "@/componentes/layout/ErrorBoundary";

// Hooks y tipos
import { useSesionPOS } from "@/hooks/useSesionPOS";
import { useTituloPagina } from "@/hooks/useTituloPagina";
import type { UsuarioSesion, PDVActivo } from "@/tipos/pos.tipos";

// ─── Layout POS con BarraLateral ────────────────────────────────────────────

interface LayoutPOSProps {
  usuario: UsuarioSesion;
  pdv: PDVActivo;
  horaIngreso: string | null;
  onCerrarSesion: () => void;
  onVolverAdmin?: () => void;
}

function LayoutPOS({ usuario, pdv, horaIngreso, onCerrarSesion, onVolverAdmin }: LayoutPOSProps) {
  const { sesion, horaApertura, abrirTurno } = useSesionPOS(usuario, pdv);

  // Sin turno activo → wizard de apertura
  if (!sesion.turno) {
    return (
      <AperturaTurno
        sesion={sesion}
        pasoInicial="saldo"
        horaIngreso={horaIngreso}
        onAperturaCompleta={abrirTurno}
        onVolverAdmin={onVolverAdmin}
      />
    );
  }

  return (
    <BarraLateral
      sesion={sesion}
      horaApertura={horaApertura}
      onCerrarSesion={onCerrarSesion}
      onVolverAdmin={onVolverAdmin}
    >
      <Routes>
        <Route index element={<POSDashboard />} />
        <Route path="solicitudes" element={<SolicitudesPDV />} />
        <Route path="mis-cierres" element={<MisCierres />} />
      </Routes>
    </BarraLateral>
  );
}

// ─── Layout Admin con rutas ─────────────────────────────────────────────────

interface LayoutAdminConRutasProps {
  onCerrarSesion: () => void;
  onEntrarModoPos: (pdv: PDVActivo) => void;
}

function LayoutAdminConRutas({ onCerrarSesion, onEntrarModoPos }: LayoutAdminConRutasProps) {
  return (
    <LayoutAdmin onCerrarSesion={onCerrarSesion} onEntrarModoPos={onEntrarModoPos}>
      <Routes>
        <Route index element={<PanelAdmin />} />
        <Route path="sucursales" element={<ControlVentasSucursal />} />
        <Route path="cierre-preventivo" element={<GestorCierrePreventivo />} />
        <Route path="preparacion" element={<PreparacionSiguienteTurno />} />
        <Route path="gastos" element={<AutorizarGastos />} />
        <Route path="bodega" element={<GestorInventario />} />
        <Route path="finanzas" element={<Finanzas />} />
        {/* Facturas ahora es una pestaña dentro de Finanzas; se mantiene la ruta
            por si hay enlaces guardados al módulo antiguo. */}
        <Route path="facturas" element={<Finanzas />} />
        <Route path="personal" element={<ModuloRRHH />} />
        {/* Horarios en solo-lectura: pensado para SUPERVISOR (ver turnos sin editar).
            El ADMIN los edita desde Personal → pestaña Horarios. */}
        <Route path="horarios" element={<HorariosTurnos soloLectura />} />
        <Route path="usuarios" element={<GestorUsuarios />} />
      </Routes>
    </LayoutAdmin>
  );
}

// ─── Componente raíz App ────────────────────────────────────────────────────

// ─── Pantalla de espera: sin PDV asignado ────────────────────────────────────

function SinPDVAsignado({ nombre, onCerrarSesion }: {
  nombre: string;
  onCerrarSesion: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-muted">
          <svg className="size-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 2.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
          </svg>
        </div>

        <div>
          <h1 className="text-2xl font-bold">Nuts 4 You</h1>
          <p className="mt-2 text-base font-semibold">{nombre}</p>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Aún no tienes una sucursal asignada para hoy.<br />
            Contacta al administrador o supervisor para que te asignen el turno correspondiente.
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/40 px-4 py-3 text-left">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">¿Cómo se asignan los turnos?</p>
          <p className="text-xs text-amber-600 dark:text-amber-500">
            El administrador planifica los horarios desde el panel admin → Personal y Remuneraciones → Horarios.
          </p>
        </div>

        <button
          onClick={onCerrarSesion}
          className="w-full rounded-xl border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

function App() {
  const { estado, iniciarSesion, cerrarSesion } = useAuth();
  const [modoPos, setModoPos] = useState<PDVActivo | null>(null);

  // Sincroniza el título de la pestaña con la sección/menú activo
  useTituloPagina();

  // No autenticado → login
  if (!estado.autenticado || !estado.usuario) {
    return (
      <Routes>
        <Route
          path="/login"
          element={
            <Login onLogin={iniciarSesion} errorExterno={estado.error} />
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Vendedor/Bodeguero sin PDV asignado → pantalla informativa (no puede operar)
  if (!estado.pdv && estado.usuario.rol !== "ADMIN" && estado.usuario.rol !== "SUPERVISOR") {
    return (
      <SinPDVAsignado
        nombre={estado.usuario.nombre}
        onCerrarSesion={cerrarSesion}
      />
    );
  }

  // Admin/Supervisor → Panel de administración (o modo POS si eligieron operar)
  if (estado.usuario.rol === "ADMIN" || estado.usuario.rol === "SUPERVISOR") {
    // Modo POS activo: admin/supervisor opera como vendedor en un PDV
    if (modoPos) {
      return (
        <ErrorBoundary>
          <Routes>
            <Route
              path="/pos/*"
              element={
                <LayoutPOS
                  usuario={estado.usuario}
                  pdv={modoPos}
                  horaIngreso={estado.horaIngreso}
                  onCerrarSesion={cerrarSesion}
                  onVolverAdmin={() => setModoPos(null)}
                />
              }
            />
            <Route path="*" element={<Navigate to="/pos" replace />} />
          </Routes>
        </ErrorBoundary>
      );
    }

    const rutaInicio = estado.usuario.rol === "SUPERVISOR" ? "/admin/sucursales" : "/admin";
    return (
      <ErrorBoundary>
        <Routes>
          <Route
            path="/admin/*"
            element={
              <LayoutAdminConRutas
                onCerrarSesion={cerrarSesion}
                onEntrarModoPos={(pdv) => setModoPos(pdv)}
              />
            }
          />
          <Route path="*" element={<Navigate to={rutaInicio} replace />} />
        </Routes>
      </ErrorBoundary>
    );
  }

  // Vendedor / Bodeguero → POS (estado.pdv garantizado no-null en este punto)
  return (
    <ErrorBoundary>
      <Routes>
        <Route
          path="/pos/*"
          element={
            <LayoutPOS
              usuario={estado.usuario}
              pdv={estado.pdv!}
              horaIngreso={estado.horaIngreso}
              onCerrarSesion={cerrarSesion}
            />
          }
        />
        <Route path="*" element={<Navigate to="/pos" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
