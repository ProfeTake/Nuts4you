import { useState } from "react";
import SideNav from "@/componentes/SideNav";
import { useAuth } from "@/hooks/useAuth";
import { useSesionPOS } from "@/hooks/useSesionPOS";
import Login from "@/paginas/Login";
import AperturaTurno from "@/paginas/AperturaTurno";
import POSDashboard from "@/paginas/POSDashboard";
import InventarioPDV from "@/paginas/InventarioPDV";
import HistorialVentas from "@/paginas/HistorialVentas";
import CierreCaja from "@/paginas/CierreCaja";
import type { PaginaVendedor, UsuarioSesion, PDVActivo } from "@/tipos/pos.tipos";

// ─── Subcomponente: POS autenticado ─────────────────────────────────────────
// Se monta sólo cuando el usuario ya está autenticado, de modo que
// useSesionPOS recibe siempre usuario y pdv no-nulos.

interface POSAutenticadoProps {
  usuario: UsuarioSesion;
  pdv: PDVActivo;
  horaIngreso: string | null;
}

function POSAutenticado({ usuario, pdv, horaIngreso }: POSAutenticadoProps) {
  const [paginaActiva, setPaginaActiva] = useState<PaginaVendedor>("pos");
  const { sesion, horaApertura, abrirTurno } = useSesionPOS(usuario, pdv);

  // Sin turno activo → wizard de apertura (inicia directo en "saldo")
  if (!sesion.turno) {
    return (
      <AperturaTurno
        sesion={sesion}
        pasoInicial="saldo"
        horaIngreso={horaIngreso}
        onAperturaCompleta={abrirTurno}
      />
    );
  }

  // Turno abierto → layout principal con SideNav
  const renderPagina = () => {
    switch (paginaActiva) {
      case "pos":
        return <POSDashboard />;
      case "inventario":
        return <InventarioPDV />;
      case "historial":
        return <HistorialVentas />;
      case "cierre-caja":
        return <CierreCaja />;
    }
  };

  return (
    <SideNav
      sesion={sesion}
      horaApertura={horaApertura}
      paginaActiva={paginaActiva}
      onNavegar={setPaginaActiva}
    >
      {renderPagina()}
    </SideNav>
  );
}

// ─── Componente raíz ────────────────────────────────────────────────────────

function App() {
  const { estado, iniciarSesion } = useAuth();

  // No autenticado → pantalla de login
  if (!estado.autenticado || !estado.usuario || !estado.pdv) {
    return (
      <Login
        onLogin={iniciarSesion}
        errorExterno={estado.error}
      />
    );
  }

  // Autenticado → POS completo (apertura + dashboard)
  return (
    <POSAutenticado
      usuario={estado.usuario}
      pdv={estado.pdv}
      horaIngreso={estado.horaIngreso}
    />
  );
}

export default App;
