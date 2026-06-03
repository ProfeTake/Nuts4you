// ─── GestorInventario ───
// Bodega Central: CRUD de ítems de inventario con tabs Mezclas/Conos y Líquidos.
// Tabla con saldo, ingresos, utilizadas y estado de stock.
// Panel de entregas pendientes a sucursales.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Pencil,
  Trash2,
  Package,
  GlassWater,
  Search,
  Truck,
  ArrowRightLeft,
  Save,
  QrCode,
  Plus,
  ChevronDown,
} from "lucide-react";
import { ModalEscáner } from "@/componentes/bodega/EscánerCodigos";
import { CatálogoCodigos } from "@/componentes/bodega/CatálogoCodigos";

// shadcn/ui
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FormularioDespacho } from "./FormularioDespacho";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
// Tipos
import type {
  ItemBodega,
  CategoriaBodega,
  EstadoStock,
  EntregaSucursal,
  Sucursal,
} from "@/tipos/admin.tipos";

// API
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/api";
import { toast } from "sonner";

// ─── Tipos de API ───

interface ItemBodegaAPI {
  inventarioId: number;
  productoId:   number;
  nombre:       string;
  categoria:    string;
  precioVenta:  number;
  stockActual:  number;
  stockCritico: number;
}

interface ProductoDisponible {
  id:        number;
  nombre:    string;
  categoria: string;
}

interface FormCrear {
  productoId:   number;
  stockActual:  number;
  stockCritico: number;
}

const FORM_CREAR_VACIO: FormCrear = { productoId: 0, stockActual: 0, stockCritico: 0 };

function categoriaAPI(cat: string): CategoriaBodega {
  if (cat === "Líquidos") return "liquidos";
  return "mezclas";
}

function mapearItem(api: ItemBodegaAPI): ItemBodega {
  const saldoActual = api.stockActual;
  const stockMinimo = api.stockCritico;
  const stockMaximo = Math.max(stockMinimo * 5, saldoActual + 1);
  const estado: EstadoStock =
    saldoActual <= 0
      ? "SIN STOCK"
      : saldoActual <= stockMinimo
      ? "POCO STOCK"
      : "STOCK OK";

  return {
    id:           String(api.inventarioId), // ← inventarioId para PATCH
    item:         api.nombre,
    categoria:    categoriaAPI(api.categoria),
    saldoInicial: 0,
    ingresos:     0,
    utilizadas:   0,
    saldoActual,
    stockMinimo,
    stockMaximo,
    estado,
  };
}

// Helpers

// ─── Helpers de estado de stock ───

function calcularEstado(
  saldoActual: number,
  stockMinimo: number,
  stockMaximo: number
): EstadoStock {
  if (saldoActual <= 0) return "SIN STOCK";
  if (saldoActual <= stockMinimo) return "POCO STOCK";
  if (saldoActual > stockMaximo) return "SOBRESTOCK";
  return "STOCK OK";
}

function badgeVariante(estado: EstadoStock) {
  switch (estado) {
    case "STOCK OK":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
    case "POCO STOCK":
      return "bg-amber-500/10 text-amber-600 border-amber-500/30";
    case "SIN STOCK":
      return "bg-red-500/10 text-red-600 border-red-500/30";
    case "SOBRESTOCK":
      return "bg-slate-500/10 text-slate-500 border-slate-500/30";
  }
}

function badgeEntrega(estado: EntregaSucursal["estado"]) {
  switch (estado) {
    case "Entregado":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
    case "Parcial":
      return "bg-amber-500/10 text-amber-600 border-amber-500/30";
    case "Pendiente":
      return "bg-red-500/10 text-red-600 border-red-500/30";
  }
}

// ─── Mock data inicial ───

const ITEMS_INICIALES: ItemBodega[] = [
  // Mezclas / Conos
  {
    id: "m1",
    item: "Mezcla Maní",
    categoria: "mezclas",
    saldoInicial: 120,
    ingresos: 40,
    utilizadas: 95,
    saldoActual: 65,
    stockMinimo: 30,
    stockMaximo: 200,
    estado: "STOCK OK",
  },
  {
    id: "m2",
    item: "Mezcla Almendra",
    categoria: "mezclas",
    saldoInicial: 80,
    ingresos: 20,
    utilizadas: 98,
    saldoActual: 2,
    stockMinimo: 15,
    stockMaximo: 150,
    estado: "SIN STOCK",
  },
  {
    id: "m3",
    item: "Mezcla Nuez",
    categoria: "mezclas",
    saldoInicial: 60,
    ingresos: 30,
    utilizadas: 50,
    saldoActual: 40,
    stockMinimo: 20,
    stockMaximo: 120,
    estado: "STOCK OK",
  },
  {
    id: "m4",
    item: "Mezcla Promo",
    categoria: "mezclas",
    saldoInicial: 100,
    ingresos: 50,
    utilizadas: 60,
    saldoActual: 90,
    stockMinimo: 25,
    stockMaximo: 180,
    estado: "STOCK OK",
  },
  {
    id: "m5",
    item: "Conos / Barquillos",
    categoria: "mezclas",
    saldoInicial: 200,
    ingresos: 0,
    utilizadas: 180,
    saldoActual: 20,
    stockMinimo: 50,
    stockMaximo: 400,
    estado: "POCO STOCK",
  },
  // Líquidos
  {
    id: "l1",
    item: "Aguas 600ml",
    categoria: "liquidos",
    saldoInicial: 96,
    ingresos: 48,
    utilizadas: 72,
    saldoActual: 72,
    stockMinimo: 24,
    stockMaximo: 200,
    estado: "STOCK OK",
  },
  {
    id: "l2",
    item: "Bebidas 350ml",
    categoria: "liquidos",
    saldoInicial: 60,
    ingresos: 24,
    utilizadas: 55,
    saldoActual: 29,
    stockMinimo: 20,
    stockMaximo: 120,
    estado: "STOCK OK",
  },
  {
    id: "l3",
    item: "Energéticas",
    categoria: "liquidos",
    saldoInicial: 30,
    ingresos: 0,
    utilizadas: 30,
    saldoActual: 0,
    stockMinimo: 10,
    stockMaximo: 60,
    estado: "SIN STOCK",
  },
  {
    id: "l4",
    item: "Jugos 300ml",
    categoria: "liquidos",
    saldoInicial: 48,
    ingresos: 24,
    utilizadas: 20,
    saldoActual: 52,
    stockMinimo: 12,
    stockMaximo: 80,
    estado: "STOCK OK",
  },
];

const ENTREGAS_INICIALES: EntregaSucursal[] = [
  {
    id: "e1",
    sucursal: "Mall",
    item: "Mezcla Maní",
    cantidadSolicitada: 30,
    cantidadEntregada: 30,
    fecha: "2026-03-17",
    estado: "Entregado",
  },
  {
    id: "e2",
    sucursal: "Paseo",
    item: "Mezcla Almendra",
    cantidadSolicitada: 25,
    cantidadEntregada: 10,
    fecha: "2026-03-17",
    estado: "Parcial",
  },
  {
    id: "e3",
    sucursal: "Open Plaza",
    item: "Aguas 600ml",
    cantidadSolicitada: 48,
    cantidadEntregada: 0,
    fecha: "2026-03-17",
    estado: "Pendiente",
  },
  {
    id: "e4",
    sucursal: "Rengo",
    item: "Conos / Barquillos",
    cantidadSolicitada: 40,
    cantidadEntregada: 0,
    fecha: "2026-03-17",
    estado: "Pendiente",
  },
  {
    id: "e5",
    sucursal: "Baquedano",
    item: "Energéticas",
    cantidadSolicitada: 12,
    cantidadEntregada: 0,
    fecha: "2026-03-16",
    estado: "Pendiente",
  },
];

const SUCURSAL_LABELS: Record<Sucursal, string> = {
  Mall: "Mall Patio",
  Paseo: "Paseo",
  "Open Plaza": "Open Plaza",
  Rengo: "Cugat Rengo",
  Baquedano: "Cugat Baquedano",
};

// ─── Form de edición de stock ───

interface FormItem {
  stockActual:  number;
  stockCritico: number;
}

const FORM_VACIO: FormItem = {
  stockActual:  0,
  stockCritico: 0,
};

// ─── Componente principal ───

export function GestorInventario() {
  const queryClient = useQueryClient();

  const { data: stockApi, isLoading: cargando } = useQuery({
    queryKey: ["bodega", "stock"],
    queryFn: () =>
      apiGet<{ data: ItemBodegaAPI[] }>("/bodega/stock")
        .then((r) => r.data.map(mapearItem))
        .catch(() => [] as ItemBodega[]),
  });

  const { data: productosDisponibles = [] } = useQuery({
    queryKey: ["bodega", "productos-disponibles"],
    queryFn: () =>
      apiGet<{ data: ProductoDisponible[] }>("/bodega/productos-disponibles")
        .then((r) => r.data)
        .catch(() => [] as ProductoDisponible[]),
  });

  const mutacionAjuste = useMutation({
    mutationFn: ({ inventarioId, data }: { inventarioId: number; data: FormItem }) =>
      apiPatch(`/bodega/stock/${inventarioId}`, {
        stockActual:  data.stockActual,
        stockCritico: data.stockCritico,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bodega", "stock"] });
      toast.success("Stock actualizado correctamente");
      setDialogAbierto(false);
      setForm(FORM_VACIO);
      setEditandoId(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Error al actualizar stock");
    },
  });

  const mutacionCrear = useMutation({
    mutationFn: (data: FormCrear) =>
      apiPost<{ data: ItemBodegaAPI }>("/bodega/stock", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bodega", "stock"] });
      queryClient.invalidateQueries({ queryKey: ["bodega", "productos-disponibles"] });
      toast.success("Producto agregado al inventario");
      setCrearAbierto(false);
      setFormCrear(FORM_CREAR_VACIO);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Error al agregar producto");
    },
  });

  const mutacionEliminar = useMutation({
    mutationFn: (inventarioId: number) =>
      apiDelete(`/bodega/stock/${inventarioId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bodega", "stock"] });
      queryClient.invalidateQueries({ queryKey: ["bodega", "productos-disponibles"] });
      toast.success("Ítem eliminado del inventario");
      setEliminandoId(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Error al eliminar ítem");
    },
  });

  // Estado local
  const [items, setItems] = useState<ItemBodega[]>([]);
  const [entregas, setEntregas] = useState<EntregaSucursal[]>(ENTREGAS_INICIALES);

  useEffect(() => {
    if (stockApi) setItems(stockApi);
  }, [stockApi]);

  const [busqueda, setBusqueda] = useState("");

  // Dialog editar
  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormItem>(FORM_VACIO);

  // Dialog crear
  const [crearAbierto, setCrearAbierto] = useState(false);
  const [formCrear, setFormCrear] = useState<FormCrear>(FORM_CREAR_VACIO);

  // Dialog eliminar
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  // ── Filtrar items por búsqueda ──
  const itemsFiltrados = useMemo(() => {
    if (!busqueda.trim()) return items;
    const q = busqueda.toLowerCase();
    return items.filter((i) => i.item.toLowerCase().includes(q));
  }, [items, busqueda]);

  const mezclas = useMemo(
    () => itemsFiltrados.filter((i) => i.categoria === "mezclas"),
    [itemsFiltrados]
  );
  const liquidos = useMemo(
    () => itemsFiltrados.filter((i) => i.categoria === "liquidos"),
    [itemsFiltrados]
  );

  // ── Resumen rápido ──
  const resumen = useMemo(() => {
    const sinStock = items.filter((i) => i.estado === "SIN STOCK").length;
    const pocoStock = items.filter((i) => i.estado === "POCO STOCK").length;
    const entregasPendientes = entregas.filter(
      (e) => e.estado !== "Entregado"
    ).length;
    return { sinStock, pocoStock, entregasPendientes, total: items.length };
  }, [items, entregas]);

  // ── Abrir dialog para editar ──
  const abrirEditar = useCallback(
    (item: ItemBodega) => {
      setEditandoId(item.id);
      setForm({
        stockActual:  item.saldoActual,
        stockCritico: item.stockMinimo,
      });
      setDialogAbierto(true);
    },
    []
  );

  // ── Guardar — llama a PATCH /api/bodega/stock/:inventarioId ──
  const guardar = useCallback(() => {
    if (!editandoId) return;
    mutacionAjuste.mutate({ inventarioId: Number(editandoId), data: form });
  }, [form, editandoId, mutacionAjuste]);

  // ── Eliminar ──
  const confirmarEliminar = useCallback(() => {
    if (eliminandoId) mutacionEliminar.mutate(Number(eliminandoId));
  }, [eliminandoId, mutacionEliminar]);

  // ── Marcar entrega como completada ──
  const completarEntrega = useCallback((id: string) => {
    setEntregas((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              cantidadEntregada: e.cantidadSolicitada,
              estado: "Entregado" as const,
            }
          : e
      )
    );
  }, []);

  const setField = useCallback(
    <K extends keyof FormItem>(campo: K, valor: FormItem[K]) => {
      setForm((prev) => ({ ...prev, [campo]: valor }));
    },
    []
  );

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bodega Central</h1>
          <p className="text-sm text-muted-foreground">
            Gestión de inventario y entregas a sucursales
          </p>
        </div>
        <Button
          onClick={() => { setFormCrear(FORM_CREAR_VACIO); setCrearAbierto(true); }}
          disabled={productosDisponibles.length === 0}
          size="sm"
          className="gap-1.5"
        >
          <Plus className="size-4" /> Agregar producto
        </Button>
      </div>

      <Separator />

      {/* ── Tarjetas resumen ── */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MiniCard label="Total Ítems" valor={resumen.total} />
        <MiniCard
          label="Sin Stock"
          valor={resumen.sinStock}
          alerta={resumen.sinStock > 0}
          colorAlerta="text-red-600"
        />
        <MiniCard
          label="Poco Stock"
          valor={resumen.pocoStock}
          alerta={resumen.pocoStock > 0}
          colorAlerta="text-amber-600"
        />
        <MiniCard
          label="Entregas Pend."
          valor={resumen.entregasPendientes}
          alerta={resumen.entregasPendientes > 0}
          colorAlerta="text-blue-600"
        />
      </div>

      {/* ── Buscador ── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Buscar ítem..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* ── Tabs: Mezclas/Conos | Líquidos | Despachos ── */}
      <Tabs defaultValue={0}>
        <TabsList>
          <TabsTrigger value={0}>
            <Package className="size-4" />
            Mezclas / Conos
            <Badge variant="secondary" className="ml-1 text-xs">
              {mezclas.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value={1}>
            <GlassWater className="size-4" />
            Líquidos
            <Badge variant="secondary" className="ml-1 text-xs">
              {liquidos.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value={2}>
            <Truck className="size-4" />
            Despachos
          </TabsTrigger>
          <TabsTrigger value={3}>
            <QrCode className="size-4" />
            Códigos
          </TabsTrigger>
        </TabsList>

        {/* Tab Mezclas */}
        <TabsContent value={0} className="mt-4">
          <TablaInventario
            items={mezclas}
            onEditar={abrirEditar}
            onEliminar={setEliminandoId}
          />
        </TabsContent>

        {/* Tab Líquidos */}
        <TabsContent value={1} className="mt-4">
          <TablaInventario
            items={liquidos}
            onEditar={abrirEditar}
            onEliminar={setEliminandoId}
          />
        </TabsContent>

        {/* Tab Despachos */}
        <TabsContent value={2} className="mt-4">
          <FormularioDespacho />
        </TabsContent>

        {/* Tab Códigos de Barra */}
        <TabsContent value={3} className="mt-4">
          <CatálogoCodigos />
        </TabsContent>
      </Tabs>

      {/* FAB flotante para escáner */}
      <ModalEscáner />

      {/* ── Entregas a Sucursales ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Truck className="size-5" />
            Entregas a Sucursales
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Control de despachos pendientes desde bodega central
          </p>
        </CardHeader>
        <CardContent>
          {entregas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay entregas registradas
            </p>
          ) : (
            <>
              {/* Mobile: tarjetas */}
              <div className="sm:hidden space-y-2">
                {entregas.map((e) => (
                  <div key={e.id} className="rounded-lg border px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{SUCURSAL_LABELS[e.sucursal]}</p>
                        <p className="text-xs text-muted-foreground truncate">{e.item}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">{e.fecha}</p>
                      </div>
                      <Badge variant="outline" className={`shrink-0 text-xs ${badgeEntrega(e.estado)}`}>
                        {e.estado}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Solicitado: <span className="tabular-nums font-medium text-foreground">{e.cantidadSolicitada}</span></span>
                        <span>Entregado: <span className="tabular-nums font-medium text-foreground">{e.cantidadEntregada}</span></span>
                      </div>
                      {e.estado !== "Entregado" ? (
                        <Button size="sm" variant="outline" onClick={() => completarEntrega(e.id)} className="text-xs h-7 px-2">
                          <ArrowRightLeft className="size-3 mr-1" />
                          Completar
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: tabla */}
              <table className="hidden sm:table w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Fecha</th>
                    <th className="pb-3 pr-4 font-medium">Sucursal</th>
                    <th className="pb-3 pr-4 font-medium">Ítem</th>
                    <th className="pb-3 pr-4 font-medium text-right">Solicitado</th>
                    <th className="pb-3 pr-4 font-medium text-right">Entregado</th>
                    <th className="pb-3 pr-4 font-medium text-center">Estado</th>
                    <th className="pb-3 font-medium text-center">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {entregas.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 tabular-nums">{e.fecha}</td>
                      <td className="py-3 pr-4 font-medium">{SUCURSAL_LABELS[e.sucursal]}</td>
                      <td className="py-3 pr-4">{e.item}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{e.cantidadSolicitada}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{e.cantidadEntregada}</td>
                      <td className="py-3 pr-4 text-center">
                        <Badge variant="outline" className={badgeEntrega(e.estado)}>
                          {e.estado}
                        </Badge>
                      </td>
                      <td className="py-3 text-center">
                        {e.estado !== "Entregado" ? (
                          <Button size="sm" variant="outline" onClick={() => completarEntrega(e.id)} className="text-xs">
                            <ArrowRightLeft className="size-3.5 mr-1" />
                            Completar
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Panel bottom-sheet: Crear / Editar ítem ── */}
      {dialogAbierto && (
        <div className="fixed inset-0 z-50">
          {/* Fondo oscuro */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setDialogAbierto(false);
              setForm(FORM_VACIO);
              setEditandoId(null);
            }}
          />
          {/* Panel */}
          <div className="absolute bottom-0 left-0 right-0 max-h-[92dvh] animate-in slide-in-from-bottom duration-300">
            <div className="rounded-t-2xl bg-background overflow-y-auto max-h-[92dvh]">
              {/* Handle + header */}
              <div className="sticky top-0 bg-background px-4 pt-4 pb-3 border-b">
                <div className="mb-3 flex justify-center">
                  <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
                </div>
                <h2 className="text-lg font-bold">Ajustar Stock</h2>
                <p className="text-sm text-muted-foreground">
                  Actualiza las unidades disponibles y el nivel mínimo de alerta.
                </p>
              </div>

              {/* Cuerpo del formulario */}
              <div className="px-4 py-4 grid gap-4">
                {/* Nombre del ítem (solo lectura) */}
                {editandoId && (
                  <div className="rounded-lg bg-muted/50 px-4 py-2.5">
                    <p className="text-xs text-muted-foreground">Ítem</p>
                    <p className="font-semibold">
                      {items.find((i) => i.id === editandoId)?.item ?? "—"}
                    </p>
                  </div>
                )}

                {/* Stock Actual */}
                <div className="space-y-1.5">
                  <Label htmlFor="form-stock-actual">Stock Actual</Label>
                  <Input
                    id="form-stock-actual"
                    type="number"
                    min={0}
                    value={form.stockActual}
                    onChange={(e) => setField("stockActual", Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Unidades físicas disponibles en bodega central
                  </p>
                </div>

                {/* Stock Crítico (mínimo) */}
                <div className="space-y-1.5">
                  <Label htmlFor="form-stock-critico">Stock Mínimo (alerta)</Label>
                  <Input
                    id="form-stock-critico"
                    type="number"
                    min={0}
                    value={form.stockCritico}
                    onChange={(e) => setField("stockCritico", Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Si el stock baja de este número se muestra "POCO STOCK"
                  </p>
                </div>

                {/* Vista previa del estado resultante */}
                <div className="rounded-lg bg-muted/30 px-4 py-2.5 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Estado resultante</p>
                  <Badge
                    variant="outline"
                    className={`text-xs ${badgeVariante(
                      calcularEstado(form.stockActual, form.stockCritico, Math.max(form.stockCritico * 5, form.stockActual + 1))
                    )}`}
                  >
                    {calcularEstado(form.stockActual, form.stockCritico, Math.max(form.stockCritico * 5, form.stockActual + 1))}
                  </Badge>
                </div>
              </div>

              {/* Botones */}
              <div className="sticky bottom-0 bg-background border-t px-4 py-3 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setDialogAbierto(false);
                    setForm(FORM_VACIO);
                    setEditandoId(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  onClick={guardar}
                  disabled={mutacionAjuste.isPending}
                >
                  {mutacionAjuste.isPending ? (
                    <Loader2 className="size-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="size-4 mr-1" />
                  )}
                  Guardar Cambios
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Panel bottom-sheet: Confirmar eliminar ── */}
      {!!eliminandoId && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setEliminandoId(null)}
          />
          <div className="absolute bottom-0 left-0 right-0 animate-in slide-in-from-bottom duration-300">
            <div className="rounded-t-2xl bg-background px-4 pt-5 pb-4">
              <div className="mb-4 flex justify-center">
                <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
              </div>
              <div className="mb-2 flex items-center gap-2 text-red-600">
                <Trash2 className="size-5" />
                <h2 className="text-lg font-bold">Eliminar Ítem</h2>
              </div>
              <p className="mb-5 text-sm text-muted-foreground">
                ¿Estás seguro de que deseas eliminar{" "}
                <strong className="text-foreground">
                  {items.find((i) => i.id === eliminandoId)?.item}
                </strong>
                ? Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setEliminandoId(null)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={confirmarEliminar}
                  disabled={mutacionEliminar.isPending}
                >
                  {mutacionEliminar.isPending ? (
                    <Loader2 className="size-4 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="size-4 mr-1" />
                  )}
                  Eliminar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom-sheet: Agregar producto al inventario ── */}
      {crearAbierto && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => { setCrearAbierto(false); setFormCrear(FORM_CREAR_VACIO); }}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[92dvh] animate-in slide-in-from-bottom duration-300">
            <div className="rounded-t-2xl bg-background overflow-y-auto max-h-[92dvh]">
              <div className="sticky top-0 bg-background px-4 pt-4 pb-3 border-b">
                <div className="mb-3 flex justify-center">
                  <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
                </div>
                <h2 className="text-lg font-bold">Agregar producto al inventario</h2>
                <p className="text-sm text-muted-foreground">
                  Selecciona un producto del catálogo para agregarlo a la Bodega Central.
                </p>
              </div>

              <div className="px-4 py-4 grid gap-4">
                {/* Selector de producto */}
                <div className="space-y-1.5">
                  <Label>Producto</Label>
                  <div className="relative">
                    <select
                      value={formCrear.productoId}
                      onChange={(e) => setFormCrear((p) => ({ ...p, productoId: Number(e.target.value) }))}
                      className="w-full h-11 rounded-xl border border-input bg-background px-3 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring appearance-none"
                    >
                      <option value={0} disabled>Seleccionar producto…</option>
                      {productosDisponibles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} — {p.categoria}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  </div>
                  {productosDisponibles.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Todos los productos del catálogo ya están en el inventario.
                    </p>
                  )}
                </div>

                {/* Stock inicial */}
                <div className="space-y-1.5">
                  <Label>Stock inicial</Label>
                  <Input
                    type="number" min={0}
                    value={formCrear.stockActual}
                    onChange={(e) => setFormCrear((p) => ({ ...p, stockActual: Number(e.target.value) }))}
                    onFocus={(e) => e.target.select()}
                  />
                  <p className="text-xs text-muted-foreground">Unidades físicas actuales en bodega</p>
                </div>

                {/* Stock mínimo */}
                <div className="space-y-1.5">
                  <Label>Stock mínimo (alerta)</Label>
                  <Input
                    type="number" min={0}
                    value={formCrear.stockCritico}
                    onChange={(e) => setFormCrear((p) => ({ ...p, stockCritico: Number(e.target.value) }))}
                    onFocus={(e) => e.target.select()}
                  />
                  <p className="text-xs text-muted-foreground">Nivel que dispara la alerta "POCO STOCK"</p>
                </div>
              </div>

              <div className="sticky bottom-0 bg-background border-t px-4 py-3 flex gap-2">
                <Button
                  variant="outline" className="flex-1"
                  onClick={() => { setCrearAbierto(false); setFormCrear(FORM_CREAR_VACIO); }}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  disabled={formCrear.productoId === 0 || mutacionCrear.isPending}
                  onClick={() => mutacionCrear.mutate(formCrear)}
                >
                  {mutacionCrear.isPending ? (
                    <Loader2 className="size-4 mr-1 animate-spin" />
                  ) : (
                    <Plus className="size-4 mr-1" />
                  )}
                  Agregar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponente: Mini card resumen ───

interface MiniCardProps {
  label: string;
  valor: number;
  alerta?: boolean;
  colorAlerta?: string;
}

function MiniCard({ label, valor, alerta, colorAlerta }: MiniCardProps) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p
          className={`mt-1 text-2xl font-bold tabular-nums ${
            alerta && colorAlerta ? colorAlerta : ""
          }`}
        >
          {valor}
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Subcomponente: Tabla de inventario ───

interface TablaInventarioProps {
  items: ItemBodega[];
  onEditar: (item: ItemBodega) => void;
  onEliminar: (id: string) => void;
}

function TablaInventario({ items, onEditar, onEliminar }: TablaInventarioProps) {
  if (items.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Package className="mb-3 size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No hay ítems en esta categoría
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {/* ── Vista mobile: tarjetas ── */}
      <div className="sm:hidden space-y-2">
        {items.map((item) => (
          <Card key={item.id}>
            <CardContent className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{item.item}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>Inicial: <span className="tabular-nums text-foreground">{item.saldoInicial}</span></span>
                    <span>Ingresos: <span className="tabular-nums text-foreground">{item.ingresos}</span></span>
                    <span>Usadas: <span className="tabular-nums text-foreground">{item.utilizadas}</span></span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${badgeVariante(item.estado)}`}>
                      {item.estado}
                    </Badge>
                    <span className={`text-sm font-bold tabular-nums ${item.saldoActual <= 0 ? "text-red-600" : "text-foreground"}`}>
                      Saldo: {item.saldoActual}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => onEditar(item)}>
                    <Pencil className="size-3.5" />
                    <span className="sr-only">Editar</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    onClick={() => onEliminar(item.id)}
                  >
                    <Trash2 className="size-3.5" />
                    <span className="sr-only">Eliminar</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Vista desktop: tabla ── */}
      <Card className="hidden sm:block">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Ítem</th>
                <th className="px-4 py-3 font-medium text-right">Saldo Inic.</th>
                <th className="px-4 py-3 font-medium text-right">Ingresos</th>
                <th className="px-4 py-3 font-medium text-right">Utilizadas</th>
                <th className="px-4 py-3 font-medium text-right">Saldo Actual</th>
                <th className="px-4 py-3 font-medium text-center">Estado</th>
                <th className="px-4 py-3 font-medium text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{item.item}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.saldoInicial}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.ingresos}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.utilizadas}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-semibold ${item.saldoActual <= 0 ? "text-red-600" : ""}`}>
                    {item.saldoActual}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="outline" className={`text-xs ${badgeVariante(item.estado)}`}>
                      {item.estado}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => onEditar(item)}>
                        <Pencil className="size-3.5" />
                        <span className="sr-only">Editar</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                        onClick={() => onEliminar(item.id)}
                      >
                        <Trash2 className="size-3.5" />
                        <span className="sr-only">Eliminar</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
