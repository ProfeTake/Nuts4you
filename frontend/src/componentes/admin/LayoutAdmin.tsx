// ─── LayoutAdmin ───
// Estructura base del Panel de Administrador.
// Sidebar fijo en escritorio, menú hamburguesa en móvil.
// Renderiza children como contenido principal.

import { useState, useEffect, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Store,
  Warehouse,
  Landmark,
  Calendar,
  Users,
  UserCog,
  Menu,
  X,
  Nut,
  LogOut,
  ShoppingBag,
  ChevronRight,
  ShieldAlert,
  PackagePlus,
  HandCoins,
} from "lucide-react";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { apiGet } from "@/lib/api";
import type { PDVActivo } from "@/tipos/pos.tipos";

import type { PaginaAdmin } from "@/tipos/admin.tipos";
import { ContextoAdminMenu } from "@/hooks/useMenuAdmin";
import { useAuthStore } from "@/store/auth.store";
import { PanelNotificaciones } from "@/componentes/layout/PanelNotificaciones";

// ─── Tipos internos ───

interface ItemNav {
  clave: PaginaAdmin;
  ruta: string;
  label: string;
  icono: ReactNode;
}

interface AdminLayoutProps {
  onCerrarSesion: () => void;
  onEntrarModoPos: (pdv: PDVActivo) => void;
  children: ReactNode;
}

// ─── Items de navegación ───

const ITEMS_ADMIN: ItemNav[] = [
  { clave: "dashboard",  ruta: "/admin",             label: "Dashboard",  icono: <LayoutDashboard className="size-5" /> },
  { clave: "sucursales",        ruta: "/admin/sucursales",        label: "Sucursales",      icono: <Store className="size-5" /> },
  { clave: "cierre-preventivo", ruta: "/admin/cierre-preventivo", label: "Cierre Prev.",    icono: <ShieldAlert className="size-5" /> },
  { clave: "bodega",            ruta: "/admin/bodega",            label: "Bodega",          icono: <Warehouse className="size-5" /> },
  { clave: "preparacion",       ruta: "/admin/preparacion",       label: "Prep. Turno",     icono: <PackagePlus className="size-5" /> },
  { clave: "finanzas",          ruta: "/admin/finanzas",          label: "Finanzas",        icono: <Landmark className="size-5" /> },
  { clave: "gastos",            ruta: "/admin/gastos",            label: "Gastos",          icono: <HandCoins className="size-5" /> },
  { clave: "personal",          ruta: "/admin/personal",          label: "Personal",        icono: <Users className="size-5" /> },
  { clave: "usuarios",          ruta: "/admin/usuarios",          label: "Usuarios",        icono: <UserCog className="size-5" /> },
];

// Supervisor: operaciones del día + facturas/proveedores, pero SIN RRHH/Nómina
// (sueldos) ni usuarios (D1/P1). El backend también lo bloquea, no solo el menú.
const ITEMS_SUPERVISOR: ItemNav[] = [
  { clave: "sucursales",        ruta: "/admin/sucursales",        label: "Sucursales",   icono: <Store className="size-5" /> },
  { clave: "cierre-preventivo", ruta: "/admin/cierre-preventivo", label: "Cierre Prev.", icono: <ShieldAlert className="size-5" /> },
  { clave: "bodega",            ruta: "/admin/bodega",            label: "Bodega",       icono: <Warehouse className="size-5" /> },
  { clave: "preparacion",       ruta: "/admin/preparacion",       label: "Prep. Turno",  icono: <PackagePlus className="size-5" /> },
  { clave: "horarios",          ruta: "/admin/horarios",          label: "Horarios",     icono: <Calendar className="size-5" /> },
  { clave: "gastos",            ruta: "/admin/gastos",            label: "Gastos",       icono: <HandCoins className="size-5" /> },
  { clave: "finanzas",          ruta: "/admin/finanzas",          label: "Finanzas",     icono: <Landmark className="size-5" /> },
];

// ─── Componente principal ───

export function LayoutAdmin({ onCerrarSesion, onEntrarModoPos, children }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [selectorPosAbierto, setSelectorPosAbierto] = useState(false);
  const [pdvs, setPdvs] = useState<PDVActivo[]>([]);
  const { usuario } = useAuthStore();
  const ITEMS_NAV = usuario?.rol === "ADMIN" ? ITEMS_ADMIN : ITEMS_SUPERVISOR;

  // Aviso de solicitudes de gasto pendientes → badge en el ítem "Gastos".
  // Refresca solo cada 20s para que el admin/supervisor sepa que hay pendientes
  // sin tener que entrar a la pantalla. Deshabilitado en demo (no está simulado).
  const { data: pendientesGasto = 0 } = useQuery({
    queryKey: ["solicitudes-gasto", "pendientes-contar"],
    queryFn: () =>
      apiGet<{ data: { pendientes: number } }>("/solicitudes-gasto/pendientes/contar")
        .then((r) => r.data.pendientes),
    enabled: !usuario?.esDemo,
    refetchInterval: 20_000,
  });

  // Carga los PDVs disponibles cuando abre el selector
  useEffect(() => {
    if (!selectorPosAbierto) return;
    apiGet<{ data: PDVActivo[] }>("/admin/pdvs")
      .then((r) => setPdvs(r.data.filter((p) => p.activo && p.tipo === "PUNTO_VENTA")))
      .catch(() => setPdvs([]));
  }, [selectorPosAbierto]);

  const abrirMenu = () => setMenuAbierto(true);
  const cerrarMenu = () => setMenuAbierto(false);

  // Determina el ítem activo según la ruta actual (más específica primero)
  const paginaActiva = [...ITEMS_NAV].reverse()
    .find((item) => location.pathname.startsWith(item.ruta))?.clave ?? "dashboard";

  const navegarA = (ruta: string) => {
    navigate(ruta);
    cerrarMenu();
  };

  // ── Sidebar content (reutilizado en mobile y desktop) ──

  const contenidoSidebar = (
    <div className="flex h-full flex-col">
      {/* Logo / Branding */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Nut className="size-5" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight tracking-tight">
            Nuts 4 You
          </p>
          <p className="text-xs text-muted-foreground">Panel Admin</p>
        </div>
        {/* Campana de notificaciones — solo desktop (en móvil va en el header) */}
        <div className="ml-auto hidden lg:block">
          <PanelNotificaciones />
        </div>
      </div>

      <Separator />

      {/* Links de navegación */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <nav className="flex flex-col gap-1">
          {ITEMS_NAV.map((item) => {
            const activo = paginaActiva === item.clave;
            return (
              <button
                key={item.clave}
                onClick={() => navegarA(item.ruta)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  activo
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {item.icono}
                {item.label}
                {item.clave === "gastos" && pendientesGasto > 0 && (
                  <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold leading-none text-white">
                    {pendientesGasto}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <Separator />

      {/* Operar en sucursal — no disponible en modo demo (el POS no está simulado) */}
      {!usuario?.esDemo && (
        <div className="px-3 py-3">
          <button
            onClick={() => { setSelectorPosAbierto(true); cerrarMenu(); }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors"
          >
            <ShoppingBag className="size-5 shrink-0" />
            Operar en sucursal
            <ChevronRight className="size-4 ml-auto" />
          </button>
        </div>
      )}

      <Separator />

      {/* Footer del sidebar */}
      <div className="p-4">
        <div className="mb-3 rounded-lg bg-muted/50 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold">{usuario?.nombre ?? "Usuario"}</p>
            {usuario?.esDemo && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                MODO DEMO
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{usuario?.rol ?? ""}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={onCerrarSesion}
        >
          <LogOut className="size-4" />
          Cerrar sesión
        </Button>
      </div>
    </div>
  );

  return (
    <ContextoAdminMenu.Provider value={{ abrirMenu }}>
      <div className="flex h-dvh w-full overflow-hidden bg-background">
        {/* ── Sidebar Desktop (>= lg) ── */}
        <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:bg-card">
          {contenidoSidebar}
        </aside>

        {/* ── Overlay + Drawer Mobile (< lg) ── */}
        {menuAbierto && (
          <div className="fixed inset-0 z-50 lg:hidden">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50"
              onClick={cerrarMenu}
            />

            {/* Drawer */}
            <aside className="absolute inset-y-0 left-0 w-72 bg-card shadow-xl animate-in slide-in-from-left duration-200">
              {/* Botón cerrar */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-3 top-5 z-10"
                onClick={cerrarMenu}
              >
                <X className="size-5" />
                <span className="sr-only">Cerrar menú</span>
              </Button>

              {contenidoSidebar}
            </aside>
          </div>
        )}

        {/* ── Contenido principal ── */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Header móvil */}
          <header className="flex items-center gap-3 border-b px-4 py-3 lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={abrirMenu}
            >
              <Menu className="size-5" />
              <span className="sr-only">Abrir menú</span>
            </Button>
            <div className="flex items-center gap-2">
              <Nut className="size-5 text-primary" />
              <span className="text-sm font-bold tracking-tight">
                Nuts 4 You
              </span>
            </div>
            {/* Campana de notificaciones (móvil) */}
            <div className="ml-auto">
              <PanelNotificaciones />
            </div>
          </header>

          {/* Área de contenido scrollable */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 lg:p-6">{children}</div>
          </div>
        </main>
      </div>
      {/* ── Selector de PDV para modo operación ── */}
      {selectorPosAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60"
          onClick={() => setSelectorPosAbierto(false)}
        >
          <div
            className="w-full rounded-t-3xl bg-background shadow-2xl animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-4 pb-2">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
              <div className="flex items-center gap-2 mb-1">
                <ShoppingBag className="size-5 text-emerald-600" />
                <h2 className="text-base font-bold">Seleccionar sucursal</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Elige el punto de venta donde vas a operar el turno.
              </p>
              <div className="space-y-2 pb-6">
                {pdvs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Cargando sucursales…</p>
                ) : (
                  pdvs.map((pdv) => (
                    <button
                      key={pdv.id}
                      onClick={() => {
                        setSelectorPosAbierto(false);
                        onEntrarModoPos(pdv);
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left hover:bg-muted/50 active:scale-[.98] transition-all"
                    >
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700">
                        <Store className="size-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{pdv.nombre}</p>
                        <p className="text-xs text-muted-foreground">Punto de venta</p>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground ml-auto" />
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </ContextoAdminMenu.Provider>
  );
}
