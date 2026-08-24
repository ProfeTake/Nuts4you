import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Nombre que aparece en la pestaña del navegador según la sección actual.
// Las claves coinciden con las rutas reales del sistema (ver App.tsx / LayoutAdmin).
const TITULOS: Record<string, string> = {
  "/login": "Iniciar sesión",
  // Admin
  "/admin/sucursales": "Sucursales",
  "/admin/cierre-preventivo": "Cierre Preventivo",
  "/admin/preparacion": "Preparación de Turno",
  "/admin/gastos": "Autorizar Gastos",
  "/admin/bodega": "Bodega",
  "/admin/finanzas": "Finanzas",
  "/admin/facturas": "Facturas",
  "/admin/personal": "Personal y Remuneraciones",
  "/admin/horarios": "Horarios",
  "/admin/usuarios": "Usuarios",
  "/admin": "Dashboard",
  // POS
  "/pos/solicitudes": "Solicitudes",
  "/pos": "Punto de Venta",
};

const BASE = "Nuts 4 You";

// Rutas ordenadas de más específica a menos específica para el match por prefijo.
const RUTAS = Object.keys(TITULOS).sort((a, b) => b.length - a.length);

/**
 * Mantiene `document.title` sincronizado con la sección/menú activo.
 * Ej: en /admin/bodega → "Bodega · Nuts 4 You".
 */
export function useTituloPagina() {
  const { pathname } = useLocation();

  useEffect(() => {
    const ruta = RUTAS.find(
      (r) => pathname === r || pathname.startsWith(r + "/"),
    );
    const seccion = ruta ? TITULOS[ruta] : null;
    document.title = seccion ? `${seccion} · ${BASE}` : BASE;
  }, [pathname]);
}
