// ─────────────────────────────────────────────────────────────────────────────
// Componente: SideNav (Barra lateral de navegación)
// ─────────────────────────────────────────────────────────────────────────────
//
// COMPONENTE REUTILIZABLE — Diseñado para ser compartido entre todos los roles:
//   • ADMIN:     Verá links a Dashboard, Reportes, Usuarios, Inventario, etc.
//   • VENDEDOR:  Verá links a POS, Inventario PDV, Historial ventas, Cierre caja.
//   • BODEGUERO: Verá links a Inventario, Traspasos, Recepciones.
//
// USO:
//   <SideNav
//     sesion={sesion}
//     horaApertura={horaApertura}
//     paginaActiva="pos"
//     onNavegar={(pagina) => setPagina(pagina)}
//   >
//     <contenido />
//   </SideNav>
//
// El prop `children` se renderiza como contenido principal a la derecha del nav.
// `paginaActiva` controla cuál item aparece resaltado.
// `onNavegar` se dispara al hacer clic en un item de navegación.
//
// Para agregar items de otro rol, crear un arreglo de ItemsNav filtrado por rol
// y pasarlo por props o resolverlo internamente con sesion.usuario.rol.
// TODO: Conectar con React Router cuando se implemente enrutamiento real.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, createContext, useContext } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatearCLP } from "@/hooks/useCarrito";
import type { SesionPOS, PaginaVendedor } from "@/tipos/pos.tipos";

// ─── Contexto del menú ────────────────────────────────────────────────────
// Permite que cualquier página hija abra el sidebar desde su propio header

interface ContextoMenuValor {
  abrirMenu: () => void;
}

const ContextoMenu = createContext<ContextoMenuValor>({ abrirMenu: () => {} });
export const useMenuNav = () => useContext(ContextoMenu);

// ─── Iconos SVG ─────────────────────────────────────────────────────────────

function IconoMenu() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
}

function IconoCerrar() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m11 17-5-5 5-5" />
      <path d="m18 17-5-5 5-5" />
    </svg>
  );
}

function IconoUsuario() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconoTienda() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
      <path d="M2 7h20" />
    </svg>
  );
}

function IconoReloj() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconoCaja() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function IconoPOS() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}

function IconoInventario() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

function IconoHistorial() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}

function IconoCierreCaja() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z" />
      <path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" />
      <path d="M4 15v-3a6 6 0 0 1 6-6h0" />
      <path d="M14 6h0a6 6 0 0 1 6 6v3" />
      <circle cx="12" cy="17" r="1" />
    </svg>
  );
}

function IconoCerrarSesion() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}

// ─── Items de navegación por rol ────────────────────────────────────────────

interface ItemNav {
  id: PaginaVendedor;
  etiqueta: string;
  icono: React.ReactNode;
}

// Items del vendedor — se pueden filtrar o extender para otros roles
const itemsVendedor: ItemNav[] = [
  { id: "pos",         etiqueta: "Punto de Venta",    icono: <IconoPOS /> },
  { id: "inventario",  etiqueta: "Inventario PDV",    icono: <IconoInventario /> },
  { id: "historial",   etiqueta: "Historial Ventas",  icono: <IconoHistorial /> },
  { id: "cierre-caja", etiqueta: "Movimiento de Caja", icono: <IconoCierreCaja /> },
];

// ─── Props ──────────────────────────────────────────────────────────────────

interface SideNavProps {
  sesion: SesionPOS;
  horaApertura: string | null;
  paginaActiva: PaginaVendedor;
  onNavegar: (pagina: PaginaVendedor) => void;
  children: React.ReactNode;
}

// ─── Componente principal ───────────────────────────────────────────────────

export default function SideNav({ sesion, horaApertura, paginaActiva, onNavegar, children }: SideNavProps) {
  const [expandido, setExpandido] = useState(false);
  const { usuario, pdv, turno, cargando } = sesion;

  // ── Contenido del sidebar ──
  const contenidoNav = (
    <div className="flex h-full flex-col">
      {/* Header: Logo + botón colapsar */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        {expandido && (
          <span className="text-lg font-bold text-foreground">
            Nuts 4 You
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => setExpandido(!expandido)}
          aria-label={expandido ? "Contraer menú" : "Expandir menú"}
        >
          {expandido ? <IconoCerrar /> : <IconoMenu />}
        </Button>
      </div>

      {/* Info de sesión */}
      {!cargando && usuario && pdv && turno && (
        <div className="border-b px-3 py-3">
          {/* Usuario */}
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <IconoUsuario />
            </div>
            {expandido && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {usuario.nombre}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {usuario.rut}
                </p>
              </div>
            )}
          </div>

          {expandido && (
            <>
              <Separator className="my-2.5" />

              {/* PDV */}
              <div className="flex items-center gap-2 py-1">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground">
                  <IconoTienda />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">
                    {pdv.nombre}
                  </p>
                  <Badge variant="secondary" className="mt-0.5 text-[9px] uppercase">
                    {pdv.tipo}
                  </Badge>
                </div>
              </div>

              {/* Turno */}
              <div className="flex items-center gap-2 py-1">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground">
                  <IconoReloj />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-foreground">
                    Turno #{turno.id}
                    <Badge
                      variant="default"
                      className="ml-1.5 bg-emerald-600 text-[9px] uppercase text-white hover:bg-emerald-700"
                    >
                      {turno.estado}
                    </Badge>
                  </p>
                </div>
              </div>

              {/* Apertura / Saldo */}
              <div className="flex items-center gap-2 py-1">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground">
                  <IconoCaja />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    Apertura {horaApertura}
                  </p>
                  <p className="text-xs font-semibold tabular-nums text-foreground">
                    {formatearCLP(turno.saldoInicial)}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Skeleton cargando */}
      {cargando && (
        <div className="space-y-3 border-b px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
            {expandido && <div className="h-4 w-24 animate-pulse rounded bg-muted" />}
          </div>
        </div>
      )}

      {/* Navegación */}
      <nav className="flex-1 space-y-1 px-2 py-3">
        {/* TODO: Filtrar itemsNav según rol del usuario cuando existan más roles */}
        {itemsVendedor.map((item) => (
          <NavItem
            key={item.id}
            icono={item.icono}
            etiqueta={item.etiqueta}
            activo={paginaActiva === item.id}
            expandido={expandido}
            onClick={() => {
              onNavegar(item.id);
              if (window.innerWidth < 1024) {
                // Mobile: cerrar el overlay al navegar
                setExpandido(false);
              } else if (!expandido) {
                // Desktop colapsado: expandir al hacer clic
                setExpandido(true);
              }
            }}
          />
        ))}
      </nav>

      {/* Footer: Cerrar sesión */}
      <div className="border-t px-2 py-3">
        <NavItem
          icono={<IconoCerrarSesion />}
          etiqueta="Cerrar sesión"
          activo={false}
          expandido={expandido}
          onClick={() => {
            // TODO: Implementar cierre de sesión real
            alert("Cerrar sesión — Funcionalidad próximamente");
          }}
          variante="destructivo"
        />
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar desktop */}
      <aside
        className={`hidden lg:flex flex-col border-r bg-card transition-all duration-200 ${
          expandido ? "w-64" : "w-16"
        }`}
      >
        {contenidoNav}
      </aside>

      {/* Botón hamburguesa mobile — ahora eliminado del layout fixed.
          Las páginas hijas lo acceden vía useMenuNav() desde su propio header. */}

      {/* Sidebar mobile (overlay) */}
      {expandido && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setExpandido(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-64 animate-in slide-in-from-left duration-200 bg-card shadow-xl">
            {contenidoNav}
          </aside>
        </div>
      )}

      {/* Contenido principal — el contexto expone abrirMenu a todas las páginas hijas */}
      <ContextoMenu.Provider value={{ abrirMenu: () => setExpandido(true) }}>
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </ContextoMenu.Provider>
    </div>
  );
}

// ─── Subcomponente: NavItem ─────────────────────────────────────────────────

interface NavItemProps {
  icono: React.ReactNode;
  etiqueta: string;
  activo: boolean;
  expandido: boolean;
  onClick?: () => void;
  variante?: "normal" | "destructivo";
}

function NavItem({
  icono,
  etiqueta,
  activo,
  expandido,
  onClick,
  variante = "normal",
}: NavItemProps) {
  const esDestructivo = variante === "destructivo";

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        activo
          ? "bg-primary/10 text-primary"
          : esDestructivo
            ? "text-destructive hover:bg-destructive/10"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
      } ${!expandido ? "justify-center" : ""}`}
      title={!expandido ? etiqueta : undefined}
    >
      <span className="shrink-0">{icono}</span>
      {expandido && <span className="truncate">{etiqueta}</span>}
    </button>
  );
}
