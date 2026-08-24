// ─── Contexto del menú lateral ────────────────────────────────────────────────
// Permite que cualquier página hija abra el sidebar desde su propio header.
//
// Vive en su propio archivo (y no dentro de BarraLateral.tsx) porque lo importan
// cinco páginas: teniéndolo junto al componente, cada edición del sidebar
// invalidaba el módulo de todas ellas y Fast Refresh les perdía el estado.

import { createContext, useContext } from "react";

interface ContextoMenuValor {
  abrirMenu: () => void;
}

export const ContextoMenu = createContext<ContextoMenuValor>({ abrirMenu: () => {} });

export const useMenuNav = () => useContext(ContextoMenu);
