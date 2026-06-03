// Contexto compartido para abrir el sidebar del Admin desde componentes hijos.
import { createContext, useContext } from "react";

export interface ContextoAdminMenuValor {
  abrirMenu: () => void;
}

export const ContextoAdminMenu = createContext<ContextoAdminMenuValor>({
  abrirMenu: () => {},
});

export const useMenuAdmin = () => useContext(ContextoAdminMenu);
