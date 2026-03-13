// Página: Inventario del PDV

import { useState } from "react";
import { toast } from "sonner";
import { useMenuNav } from "@/componentes/SideNav";
import { inventarioInicialMock } from "@/datos/mock.datos";

function IconoMenu() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
}

function IconoGuardar() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
      <path d="M7 3v4a1 1 0 0 0 1 1h7" />
    </svg>
  );
}

export default function InventarioPDV() {
  const { abrirMenu } = useMenuNav();

  // Saldo editable por fila (texto crudo para evitar conflictos de input)
  const [textosSaldo, setTextosSaldo] = useState<Record<number, string>>(
    () => Object.fromEntries(inventarioInicialMock.map((i) => [i.productoId, ""]))
  );

  const actualizarSaldo = (productoId: number, valor: string) => {
    const soloNum = valor.replace(/\D/g, "");
    setTextosSaldo((prev) => ({ ...prev, [productoId]: soloNum }));
  };

  const guardarInventario = () => {
    // TODO: Enviar al backend
    toast.success("Inventario guardado", {
      description: "Los saldos han sido registrados correctamente.",
    });
  };

  const categorias = [...new Set(inventarioInicialMock.map((i) => i.categoria))];

  return (
    <div className="flex h-full flex-col">
      {/* Header — visible solo en móvil */}
      <header className="flex items-center gap-3 border-b bg-background px-4 py-3 lg:hidden">
        <button
          onClick={abrirMenu}
          aria-label="Abrir menú"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <IconoMenu />
        </button>
        <button
          onClick={abrirMenu}
          className="text-base font-semibold text-foreground hover:text-primary transition-colors"
        >
          Inventario del PDV
        </button>
      </header>

      {/* Título desktop */}
      <div className="hidden lg:block px-6 pt-5 pb-2">
        <h1 className="text-xl font-bold text-foreground">Inventario del PDV</h1>
        <p className="text-sm text-muted-foreground">Registra el saldo actual de cada producto</p>
      </div>

      {/* Botón Guardar + tabla — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">
        {/* Botón Guardar inventario */}
        <button
          onClick={guardarInventario}
          className="mb-3 flex items-center gap-2 rounded-lg border border-primary bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
        >
          <IconoGuardar />
          Guardar inventario
        </button>

        {/* Tabla */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="border border-border px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider">
                ITEM
              </th>
              <th className="w-14 border border-border px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider">
                INICIO
              </th>
              <th className="w-12 border border-border px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider">
                ING
              </th>
              <th className="w-16 border border-border px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider">
                SALDO
              </th>
            </tr>
          </thead>
          <tbody>
            {categorias.flatMap((cat) => [
              <tr key={`cat-${cat}`} className="bg-muted/50">
                <td
                  colSpan={4}
                  className="border border-border px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
                >
                  {cat}
                </td>
              </tr>,
              ...inventarioInicialMock
                .filter((i) => i.categoria === cat)
                .map((item) => (
                  <tr key={item.productoId} className="bg-background">
                    <td className="border border-border px-2 py-1.5 font-medium text-foreground">
                      {item.nombre}
                    </td>
                    {/* INICIO — solo lectura */}
                    <td className="border border-border px-2 py-1.5 text-center text-sm tabular-nums text-muted-foreground bg-muted/40">
                      {item.inicio}
                    </td>
                    {/* ING — solo lectura */}
                    <td className="border border-border px-2 py-1.5 text-center text-sm tabular-nums text-muted-foreground bg-muted/40">
                      {item.ingreso > 0 ? item.ingreso : ""}
                    </td>
                    {/* SALDO — editable */}
                    <td className="border border-border p-0.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={textosSaldo[item.productoId] ?? ""}
                        placeholder="0"
                        onChange={(e) => actualizarSaldo(item.productoId, e.target.value)}
                        className="w-full rounded bg-transparent py-1.5 text-center text-sm font-semibold tabular-nums outline-none focus:bg-primary/5 focus:ring-1 focus:ring-primary/40"
                      />
                    </td>
                  </tr>
                )),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}
