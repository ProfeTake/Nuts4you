// ─── Finanzas ─────────────────────────────────────────────────────────────────
// Módulo principal de Finanzas con dos pestañas:
//   • Depósitos → control de depósitos Z de las sucursales (DepositosFinanzas)
//   • Facturas  → facturas y proveedores (GestorFacturas)
// Se unificaron aquí porque son la misma área de negocio (dinero que entra/sale).
//
// La pestaña inicial se deduce de la ruta: /admin/facturas abre "Facturas"
// directamente (compatibilidad con enlaces antiguos y el card del dashboard).

import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Landmark, Receipt } from "lucide-react";
import { DepositosFinanzas } from "./DepositosFinanzas";
import { GestorFacturas } from "./GestorFacturas";

type TabFinanzas = "depositos" | "facturas";

export function Finanzas() {
  const location = useLocation();
  const tabInicial: TabFinanzas = location.pathname.includes("facturas")
    ? "facturas"
    : "depositos";
  const [tab, setTab] = useState<TabFinanzas>(tabInicial);

  return (
    <div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabFinanzas)}>
        <TabsList>
          <TabsTrigger value="depositos" className="gap-1.5">
            <Landmark className="size-4" /> Depósitos
          </TabsTrigger>
          <TabsTrigger value="facturas" className="gap-1.5">
            <Receipt className="size-4" /> Facturas
          </TabsTrigger>
        </TabsList>
        <TabsContent value="depositos" className="mt-5">
          <DepositosFinanzas />
        </TabsContent>
        <TabsContent value="facturas" className="mt-5">
          <GestorFacturas />
        </TabsContent>
      </Tabs>
    </div>
  );
}
