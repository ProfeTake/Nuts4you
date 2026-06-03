// ─────────────────────────────────────────────────────────────────────────────
// Componente: BarraLateral (Barra lateral de navegación)
// ─────────────────────────────────────────────────────────────────────────────
//
// COMPONENTE REUTILIZABLE — Diseñado para ser compartido entre todos los roles:
//   • ADMIN:     Dashboard, Reportes, Sucursales, Bodega, Finanzas, RRHH.
//   • VENDEDOR:  Turno activo, Inventario PDV, Historial, Cierre de Caja, Registro Diario.
//   • BODEGUERO: Inventario, Traspasos, Recepciones.
//
// Usa React Router (useNavigate + useLocation) para navegación y estado activo.
// El prop `children` se renderiza como contenido principal a la derecha del nav.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, createContext, useContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatearCLP } from "@/lib/money";
import type { SesionPOS, PaginaVendedor } from "@/tipos/pos.tipos";
import { Menu, ChevronsLeft, User, Store, Clock, Archive, LayoutDashboard, LogOut, PackagePlus, ArrowLeft } from "lucide-react";
import { PanelNotificaciones } from "./PanelNotificaciones";

// ─── Contexto del menú ────────────────────────────────────────────────────
// Permite que cualquier página hija abra el sidebar desde su propio header

interface ContextoMenuValor {
  abrirMenu: () => void;
}

const ContextoMenu = createContext<ContextoMenuValor>({ abrirMenu: () => {} });
export const useMenuNav = () => useContext(ContextoMenu);

// ─── Mapa de rutas por página del vendedor ──────────────────────────────────

const RUTAS_VENDEDOR: Record<PaginaVendedor, string> = {
  "pos":             "/pos",
  "inventario":      "/pos/inventario",
  "historial":       "/pos/historial",
  "cierre-caja":     "/pos/cierre-caja",
  "registro-diario": "/pos/registro-diario",
  "solicitudes":     "/pos/solicitudes",
};

// ─── Items de navegación por rol ────────────────────────────────────────────

interface ItemNav {
  id: PaginaVendedor;
  etiqueta: string;
  icono: React.ReactNode;
}

// Items del vendedor — se pueden filtrar o extender para otros roles

const itemsVendedor: ItemNav[] = [
  { id: "pos",         etiqueta: "Turno Activo", icono: <LayoutDashboard size={18} /> },
  { id: "solicitudes", etiqueta: "Solicitudes",  icono: <PackagePlus size={18} /> },
];

// ─── Props ──────────────────────────────────────────────────────────────────

interface SideNavProps {
  sesion: SesionPOS;
  horaApertura: string | null;
  onCerrarSesion: () => void;
  onVolverAdmin?: () => void;
  children: React.ReactNode;
}

// ─── Componente principal ───────────────────────────────────────────────────

export default function BarraLateral({ sesion, horaApertura, onCerrarSesion, onVolverAdmin, children }: SideNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [expandido, setExpandido] = useState(false);
  const { usuario, pdv, turno, cargando } = sesion;

  // Determina qué ítem del menú está activo según la ruta actual
  const paginaActiva = (Object.entries(RUTAS_VENDEDOR) as [PaginaVendedor, string][])
    .reverse()
    .find(([, ruta]) => location.pathname.startsWith(ruta))?.[0] ?? "pos";

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
          {expandido ? <ChevronsLeft size={20} /> : <Menu size={20} />}
        </Button>
      </div>

      {/* Info de sesión */}
      {!cargando && usuario && pdv && turno && (
        <div className="border-b px-3 py-3">
          {/* Usuario */}
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User size={18} />
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
                  <Store size={18} />
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
                  <Clock size={18} />
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
                  <Archive size={18} />
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
              navigate(RUTAS_VENDEDOR[item.id]);
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

      {/* Notificaciones + Footer */}
      <div className="border-t px-2 py-2 flex items-center justify-between">
        <PanelNotificaciones />
        {expandido && <span className="text-xs text-muted-foreground">Alertas</span>}
      </div>

      {/* Footer: Volver al panel (solo admin/supervisor) + Cerrar sesión */}
      <div className="border-t px-2 py-3 space-y-1">
        {onVolverAdmin && (
          <NavItem
            icono={<ArrowLeft size={18} />}
            etiqueta="Volver al panel"
            activo={false}
            expandido={expandido}
            onClick={onVolverAdmin}
            variante="normal"
          />
        )}
        <NavItem
          icono={<LogOut size={18} />}
          etiqueta="Cerrar sesión"
          activo={false}
          expandido={expandido}
          onClick={onCerrarSesion}
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
