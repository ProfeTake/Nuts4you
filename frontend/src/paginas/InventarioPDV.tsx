// Página: Inventario del PDV

import { useState } from "react";
import { toast } from "sonner";
import { useMenuNav } from "@/componentes/layout/contexto-menu";
import { inventarioInicialMock } from "@/datos/mock.datos";
import { useCajaStore } from "@/store/caja.store";
import { compararCategorias, compararProductos } from "@/lib/categorias";
import { Menu, Save } from "lucide-react";

export default function InventarioPDV() {
  const { abrirMenu } = useMenuNav();

  // Usa el inventario del turno activo; fallback al mock si no hay turno
  const { inventarioInicial, inventarioSaldo: saldoGuardado, guardarInventarioSaldo } = useCajaStore();
  const items = inventarioInicial.length > 0 ? inventarioInicial : inventarioInicialMock;

  // Estado editable del saldo por producto (inicializa desde el store si ya fue guardado)
  const [textosSaldo, setTextosSaldo] = useState<Record<number, string>>(
    () => Object.fromEntries(
      items.map((i) => [
        i.productoId,
        saldoGuardado[i.productoId] != null ? String(saldoGuardado[i.productoId]) : "",
      ])
    )
  );

  const actualizarSaldo = (productoId: number, valor: string) => {
    const soloNum = valor.replace(/\D/g, "");
    setTextosSaldo((prev) => ({ ...prev, [productoId]: soloNum }));
  };

  const guardarInventario = () => {
    // Convertir a Record<number, number> y persistir en el store
    const saldos: Record<number, number> = {};
    for (const [id, texto] of Object.entries(textosSaldo)) {
      saldos[Number(id)] = parseInt(texto || "0", 10);
    }
    guardarInventarioSaldo(saldos);
    toast.success("Inventario guardado", {
      description: "Los saldos han sido registrados correctamente.",
    });
  };

  // Mismo orden que el Turno Activo (Mezclas → Paquetes → Líquidos).
  const categorias = [...new Set(items.map((i) => i.categoria))].sort(compararCategorias);

  return (
    <div className="flex h-full flex-col">
      {/* Header — visible solo en móvil */}
      <header className="flex items-center gap-3 border-b bg-background px-4 py-3 lg:hidden">
        <button
          onClick={abrirMenu}
          aria-label="Abrir menú"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Menu size={20} />
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
        <button
          onClick={guardarInventario}
          className="mb-3 flex items-center gap-2 rounded-lg border border-primary bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
        >
          <Save size={16} />
          Guardar inventario
        </button>

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
              ...items
                .filter((i) => i.categoria === cat)
                .sort(compararProductos)
                .map((item) => (
                  <tr key={item.productoId} className="bg-background">
                    <td className="border border-border px-2 py-1.5 font-medium text-foreground">
                      {item.nombre}
                    </td>
                    {/* INICIO — solo lectura */}
                    <td className="border border-border px-2 py-1.5 text-center text-sm tabular-nums text-muted-foreground bg-muted/40">
                      {item.inicio > 0 ? item.inicio : ""}
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
