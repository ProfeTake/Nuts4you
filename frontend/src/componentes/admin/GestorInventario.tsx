// ─── GestorInventario ───
// Bodega Central: CRUD de ítems de inventario con tabs Mezclas/Conos y Líquidos.
// Tabla con saldo, ingresos, utilizadas y estado de stock.
// Panel de entregas pendientes a sucursales.

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Pencil,
  Trash2,
  Package,
  PackagePlus,
  GlassWater,
  Search,
  Truck,
  Save,
  QrCode,
  Plus,
  Wand2,
  History as HistoryIcon,
  CalendarDays,
  X,
  TrendingUp,
} from "lucide-react";
import { ModalEscáner } from "@/componentes/bodega/EscánerCodigos";
import { CatálogoCodigos } from "@/componentes/bodega/CatálogoCodigos";

// shadcn/ui
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FormularioDespacho } from "./FormularioDespacho";
import { SolicitudesBodega } from "./SolicitudesBodega";
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
} from "@/tipos/admin.tipos";
import type { Solicitud } from "@/tipos/pos.tipos";

// API
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/api";
import { formatearCLP } from "@/lib/money";
import { compararProductos } from "@/lib/categorias";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "sonner";

// ─── Tipos de API ───

interface ItemBodegaAPI {
  inventarioId: number;
  productoId:   number;
  nombre:       string;
  categoria:    string;
  precioVenta:  number;
  costo:        number;
  stockActual:  number;
  stockCritico: number;
}

interface CategoriaAPI {
  id:     number;
  nombre: string;
}

interface DespachoItemDetalle {
  id:       number;
  producto: string;
  cantidad: number;
}

interface DespachoEvento {
  loteId:        string;
  fecha:         string;
  origen:        string;
  destino:       string;
  cantidadItems: number;
  totalUnidades: number;
  estado:        "ENVIADO" | "CONFIRMADO" | null;
  confirmadoPor: string | null;
  confirmadoEn:  string | null;
  items:         DespachoItemDetalle[];
}

interface FormCrear {
  nombre:          string;
  categoriaId:     number;
  categoriaNombre: string;
  codigoBarra:     string;
  precioVenta:     number;
  costo:           number;
  stockActual:     number;
  stockCritico:    number;
}

const FORM_CREAR_VACIO: FormCrear = {
  nombre: "", categoriaId: 0, categoriaNombre: "",
  codigoBarra: "", precioVenta: 0, costo: 0,
  stockActual: 0, stockCritico: 0,
};

/** Genera un EAN-13 de uso interno (prefijo "2" reservado para tiendas) */
function generarCodigoInterno(): string {
  const digits: number[] = [2];
  for (let i = 0; i < 11; i++) digits.push(Math.floor(Math.random() * 10));
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  digits.push((10 - (sum % 10)) % 10);
  return digits.join("");
}

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
    id:              String(api.inventarioId), // ← inventarioId para PATCH
    productoId:      api.productoId,            // para ordenar como el Turno Activo
    item:            api.nombre,
    categoria:       categoriaAPI(api.categoria),
    categoriaNombre: api.categoria,  // nombre real (para regla de precio)
    precioVenta:     api.precioVenta,
    costo:           api.costo,
    saldoInicial:    saldoActual, // punto de partida = stock actual persistido
    ingresos:     0,
    utilizadas:   0,
    saldoActual,
    stockMinimo,
    stockMaximo,
    estado,
  };
}

// Helpers

/** Orden del Turno Activo aplicado a un ItemBodega: Mezclas → Paquetes → Promos →
 *  Líquidos → Helados → Conos, y por productoId (Maní, Almendras, Nueces…) dentro. */
const compararItemBodega = (a: ItemBodega, b: ItemBodega) =>
  compararProductos(
    { categoria: a.categoriaNombre ?? "", productoId: a.productoId },
    { categoria: b.categoriaNombre ?? "", productoId: b.productoId },
  );

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


// ─── Form de edición de stock ───

interface FormItem {
  nombre:       string;
  stockActual:  number;
  stockCritico: number;
  precioVenta:  number;
  costo:        number;
}

const FORM_VACIO: FormItem = {
  nombre:       "",
  stockActual:  0,
  stockCritico: 0,
  precioVenta:  0,
  costo:        0,
};

// El ADMIN puede editar el precio de venta en toda categoría vendible; solo las
// materias primas (Mezclas) quedan fuera (se cocinan en paquetes, no se venden).
// Denylist en vez de allowlist: así Promos, Helados y categorías nuevas no se
// quedan sin input de precio (tolerante a mayúsculas/acentos).
const CATEGORIAS_SIN_PRECIO = new Set(["mezclas"]);
const normalizarCategoria = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const categoriaPermitePrecio = (categoriaNombre?: string) =>
  !!categoriaNombre && !CATEGORIAS_SIN_PRECIO.has(normalizarCategoria(categoriaNombre));

// ─── Edición inline de la tabla ───
// Borrador por fila (clave = inventarioId): nombre + ingresos/utilizadas escritos.
interface DraftRow {
  nombre:     string;
  ingresos:   string;
  utilizadas: string;
}

interface HistorialItemDetalle {
  id:            number;
  nombre:        string;
  saldoAnterior: number;
  ingresos:      number;
  utilizadas:    number;
  saldoNuevo:    number;
}

interface HistorialGrupo {
  loteId:          string;
  fecha:           string;
  usuario:         string;
  cantidad:        number;
  totalIngresos:   number;
  totalUtilizadas: number;
  items:           HistorialItemDetalle[];
}

const hoyISO = () => new Date().toISOString().slice(0, 10);

// ─── Componente principal ───

export function GestorInventario() {
  const queryClient = useQueryClient();
  const rolUsuario = useAuthStore((s) => s.usuario?.rol);
  const puedeVerCosto = rolUsuario !== "VENDEDOR";
  const esAdmin = rolUsuario === "ADMIN";

  const { data: stockApi, isLoading: cargando } = useQuery({
    queryKey: ["bodega", "stock"],
    queryFn: () =>
      apiGet<{ data: ItemBodegaAPI[] }>("/bodega/stock")
        .then((r) => r.data.map(mapearItem))
        .catch(() => [] as ItemBodega[]),
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ["bodega", "categorias"],
    queryFn: () =>
      apiGet<{ data: CategoriaAPI[] }>("/bodega/categorias")
        .then((r) => r.data)
        .catch(() => [] as CategoriaAPI[]),
  });

  // Historial real de despachos a sucursales, agrupado por evento de despacho
  const { data: despachos = [] } = useQuery({
    queryKey: ["bodega", "despachos"],
    queryFn: () =>
      apiGet<{ data: DespachoEvento[] }>("/bodega/despachos")
        .then((r) => r.data)
        .catch(() => [] as DespachoEvento[]),
    refetchInterval: 20_000, // ver "Confirmado" apenas el vendedor confirma
  });

  // Solo para el contador del tab "Solicitudes": comparte queryKey (y por lo
  // tanto caché y refetch) con SolicitudesBodega, así no se pide dos veces.
  const { data: solicitudes = [] } = useQuery({
    queryKey: ["solicitudes", "bodega"],
    queryFn: () =>
      apiGet<{ data: Solicitud[] }>("/solicitudes")
        .then((r) => r.data)
        .catch(() => [] as Solicitud[]),
    refetchInterval: 30_000,
  });
  const solicitudesPendientes = solicitudes.filter((s) => s.estado === "PENDIENTE").length;

  // Despachos realizados dentro del mes actual (para el dashboard de bodega)
  const despachosDelMes = useMemo(() => {
    const ahora = new Date();
    return despachos.filter((d) => {
      const f = new Date(d.fecha);
      return f.getFullYear() === ahora.getFullYear() && f.getMonth() === ahora.getMonth();
    }).length;
  }, [despachos]);

  // Modal de detalle de un despacho
  const [detalleDespacho, setDetalleDespacho] = useState<DespachoEvento | null>(null);

  const mutacionAjuste = useMutation({
    mutationFn: ({ inventarioId, data, incluirPrecio, incluirCosto }: { inventarioId: number; data: FormItem; incluirPrecio: boolean; incluirCosto: boolean }) =>
      apiPatch(`/bodega/stock/${inventarioId}`, {
        nombre:       data.nombre.trim() || undefined,
        stockActual:  data.stockActual,
        stockCritico: data.stockCritico,
        // Solo se envía si el usuario es ADMIN y la categoría lo permite (el backend revalida).
        ...(incluirPrecio ? { precioVenta: data.precioVenta } : {}),
        // Costo: solo ADMIN, cualquier categoría (C7/A42).
        ...(incluirCosto ? { costo: data.costo } : {}),
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

  // Merma explícita (C6/A40): POST /bodega/stock/:id/merma → MovimientoInv MERMA
  // + HistorialInventario, en vez de esconder la baja en un ajuste genérico.
  const mutacionMerma = useMutation({
    mutationFn: ({ inventarioId, cantidad, motivo }: { inventarioId: number; cantidad: number; motivo: string }) =>
      apiPost(`/bodega/stock/${inventarioId}/merma`, { cantidad, motivo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bodega", "stock"] });
      queryClient.invalidateQueries({ queryKey: ["bodega", "historial"] });
      toast.success("Merma registrada");
      setDialogAbierto(false);
      setForm(FORM_VACIO);
      setEditandoId(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Error al registrar la merma");
    },
  });

  const mutacionCrear = useMutation({
    mutationFn: (data: FormCrear) => {
      const payload: Record<string, unknown> = {
        nombre:       data.nombre,
        precioVenta:  data.precioVenta,
        costo:        data.costo,
        stockActual:  data.stockActual,
        stockCritico: data.stockCritico,
      };
      if (data.categoriaId) payload.categoriaId = data.categoriaId;
      else payload.categoriaNombre = data.categoriaNombre;
      if (data.codigoBarra.trim()) payload.codigoBarra = data.codigoBarra.trim();
      return apiPost<{ data: ItemBodegaAPI }>("/bodega/productos", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bodega", "stock"] });
      toast.success("Producto creado y agregado al inventario");
      setCrearAbierto(false);
      setFormCrear(FORM_CREAR_VACIO);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Error al crear producto");
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

  // Guardado por lote de la tabla editable
  const [confirmarLote, setConfirmarLote] = useState(false);
  const mutacionLote = useMutation({
    mutationFn: (items: { inventarioId: number; nombre?: string; ingresos: number; utilizadas: number }[]) =>
      apiPost<{ data: { guardados: number } }>("/bodega/stock/lote", { items }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["bodega", "stock"] });
      queryClient.invalidateQueries({ queryKey: ["bodega", "historial"] });
      toast.success(`${res.data.guardados} ítem(s) actualizado(s) en bodega`);
      setBorrador({});
      setConfirmarLote(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Error al guardar los cambios");
    },
  });

  // El stock viene del servidor y nunca se edita en sitio: lo que el admin escribe
  // vive en `borrador`. Por eso se deriva de la query en vez de copiarse a estado
  // local con un efecto, que renderizaba dos veces por cada refresco.
  const items: ItemBodega[] = useMemo(() => stockApi ?? [], [stockApi]);
  // Borrador de edición inline (clave = inventarioId)
  const [borrador, setBorrador] = useState<Record<string, DraftRow>>({});

  // Lee el borrador de una fila o sus valores por defecto
  const draftDe = useCallback(
    (item: ItemBodega): DraftRow =>
      borrador[item.id] ?? { nombre: item.item, ingresos: "", utilizadas: "" },
    [borrador]
  );

  const setBorradorCampo = useCallback(
    (item: ItemBodega, campo: keyof DraftRow, valor: string) => {
      setBorrador((prev) => {
        const actual = prev[item.id] ?? { nombre: item.item, ingresos: "", utilizadas: "" };
        const limpio = campo === "nombre" ? valor : valor.replace(/\D/g, "");
        return { ...prev, [item.id]: { ...actual, [campo]: limpio } };
      });
    },
    [setBorrador]
  );

  // Ítems con cambios reales (ingresos/utilizadas > 0 o nombre distinto)
  const itemsConCambios = useMemo(() => {
    return items
      .map((item) => {
        const d = borrador[item.id];
        if (!d) return null;
        const ingresos   = parseInt(d.ingresos, 10) || 0;
        const utilizadas = parseInt(d.utilizadas, 10) || 0;
        const nombreCambia = d.nombre.trim() && d.nombre.trim() !== item.item;
        if (ingresos === 0 && utilizadas === 0 && !nombreCambia) return null;
        return {
          inventarioId: Number(item.id),
          nombre:       nombreCambia ? d.nombre.trim() : undefined,
          ingresos,
          utilizadas,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [items, borrador]);

  const guardarLote = useCallback(() => {
    if (itemsConCambios.length === 0) return;
    mutacionLote.mutate(itemsConCambios);
  }, [itemsConCambios, mutacionLote]);

  const [busqueda, setBusqueda] = useState("");

  // Dialog editar
  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormItem>(FORM_VACIO);
  // ¿Se muestra/edita el precio? Solo ADMIN y categorías de venta (Paquetes/Líquidos/Conos).
  const [precioEditable, setPrecioEditable] = useState(false);
  // Merma explícita (C6/A40): baja con causa, separada del ajuste genérico.
  const [mermaCantidad, setMermaCantidad] = useState("");
  const [mermaMotivo, setMermaMotivo] = useState("");

  // Dialog crear
  const [crearAbierto, setCrearAbierto] = useState(false);
  const [formCrear, setFormCrear] = useState<FormCrear>(FORM_CREAR_VACIO);
  const [nuevaCategoriaMode, setNuevaCategoriaMode] = useState(false);

  // Sin useCallback: React Compiler memoiza automáticamente y la versión
  // manual no podía preservarse (react-hooks/preserve-manual-memoization).
  const abrirCrearConCodigo = async (codigo: string) => {
    try {
      await apiGet(`/bodega/buscar-codigo?codigo=${encodeURIComponent(codigo)}`);
      toast.info("Ese código ya está registrado en el sistema");
    } catch {
      setFormCrear({ ...FORM_CREAR_VACIO, codigoBarra: codigo });
      setNuevaCategoriaMode(false);
      setCrearAbierto(true);
    }
  };

  // Dialog eliminar
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  // ── Filtrar items por búsqueda ──
  const itemsFiltrados = useMemo(() => {
    if (!busqueda.trim()) return items;
    const q = busqueda.toLowerCase();
    return items.filter((i) => i.item.toLowerCase().includes(q));
  }, [items, busqueda]);

  const mezclas = useMemo(
    () => itemsFiltrados.filter((i) => i.categoria === "mezclas").sort(compararItemBodega),
    [itemsFiltrados]
  );
  const liquidos = useMemo(
    () => itemsFiltrados.filter((i) => i.categoria === "liquidos").sort(compararItemBodega),
    [itemsFiltrados]
  );

  // ── Resumen rápido ──
  const resumen = useMemo(() => {
    const sinStock = items.filter((i) => i.estado === "SIN STOCK").length;
    const pocoStock = items.filter((i) => i.estado === "POCO STOCK").length;
    return { sinStock, pocoStock, total: items.length };
  }, [items]);

  // ── Abrir dialog para editar ──
  // Sin useCallback: React Compiler memoiza automáticamente y la versión manual
  // no podía preservarse (react-hooks/preserve-manual-memoization).
  const abrirEditar = (item: ItemBodega) => {
    setEditandoId(item.id);
    setForm({
      nombre:       item.item,
      stockActual:  item.saldoActual,
      stockCritico: item.stockMinimo,
      precioVenta:  item.precioVenta ?? 0,
      costo:        item.costo ?? 0,
    });
    setPrecioEditable(esAdmin && categoriaPermitePrecio(item.categoriaNombre));
    setMermaCantidad("");
    setMermaMotivo("");
    setDialogAbierto(true);
  };

  // ── Registrar merma (C6/A40) ──
  const registrarMerma = () => {
    if (!editandoId) return;
    const cantidad = parseInt(mermaCantidad, 10);
    if (isNaN(cantidad) || cantidad <= 0) {
      toast.error("Ingresa una cantidad de merma válida");
      return;
    }
    if (!mermaMotivo.trim()) {
      toast.error("Indica el motivo de la merma (ej: vencido, dañado)");
      return;
    }
    mutacionMerma.mutate({ inventarioId: Number(editandoId), cantidad, motivo: mermaMotivo.trim() });
  };

  // ── Guardar — llama a PATCH /api/bodega/stock/:inventarioId ──
  const guardar = useCallback(() => {
    if (!editandoId) return;
    mutacionAjuste.mutate({ inventarioId: Number(editandoId), data: form, incluirPrecio: precioEditable, incluirCosto: esAdmin });
  }, [form, editandoId, mutacionAjuste, precioEditable, esAdmin]);

  // ── Eliminar ──
  const confirmarEliminar = useCallback(() => {
    if (eliminandoId) mutacionEliminar.mutate(Number(eliminandoId));
  }, [eliminandoId, mutacionEliminar]);

  const setField = useCallback(
    <K extends keyof FormItem>(campo: K, valor: FormItem[K]) => {
      setForm((prev) => ({ ...prev, [campo]: valor }));
    },
    [setForm]
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
          onClick={() => { setFormCrear(FORM_CREAR_VACIO); setNuevaCategoriaMode(false); setCrearAbierto(true); }}
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
          label="Despachos (mes)"
          valor={despachosDelMes}
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

      {/* ── Barra de guardado (aparece cuando hay cambios sin guardar) ── */}
      {itemsConCambios.length > 0 && (
        <div className="sticky top-2 z-30 flex items-center justify-between gap-3 rounded-xl border-2 border-primary bg-background px-4 py-2.5 shadow-md">
          <p className="text-sm font-medium text-foreground">
            Tienes <strong>{itemsConCambios.length}</strong> ítem{itemsConCambios.length !== 1 ? "s" : ""} con cambios sin guardar
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setBorrador({})}>
              Descartar
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setConfirmarLote(true)}>
              <Save className="size-4" /> Guardar cambios
            </Button>
          </div>
        </div>
      )}

      {/* ── Tabs: Mezclas/Conos | Líquidos | Despachos | Códigos | Historial ── */}
      <Tabs defaultValue={0}>
        <TabsList className="max-w-full justify-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          {/* Solicitudes de las sucursales — despachar mueve stock real (A15) */}
          <TabsTrigger value={6}>
            <PackagePlus className="size-4" />
            Solicitudes
            {solicitudesPendientes > 0 && (
              <Badge className="ml-1 bg-amber-500 text-white text-xs hover:bg-amber-500">
                {solicitudesPendientes}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value={2}>
            <Truck className="size-4" />
            Despacho
          </TabsTrigger>
          <TabsTrigger value={4}>
            <HistoryIcon className="size-4" />
            Historial de ingreso
          </TabsTrigger>
          <TabsTrigger value={3}>
            <QrCode className="size-4" />
            Códigos
          </TabsTrigger>
          {/* Márgenes — solo ADMIN (expone costos y rentabilidad, C7/A42) */}
          {esAdmin && (
            <TabsTrigger value={5}>
              <TrendingUp className="size-4" />
              Márgenes
            </TabsTrigger>
          )}
        </TabsList>

        {/* Tab Mezclas */}
        <TabsContent value={0} className="mt-4">
          <TablaInventario
            items={mezclas}
            draftDe={draftDe}
            onCampo={setBorradorCampo}
            onEditar={abrirEditar}
            onEliminar={setEliminandoId}
          />
        </TabsContent>

        {/* Tab Líquidos */}
        <TabsContent value={1} className="mt-4">
          <TablaInventario
            items={liquidos}
            draftDe={draftDe}
            onCampo={setBorradorCampo}
            onEditar={abrirEditar}
            onEliminar={setEliminandoId}
          />
        </TabsContent>

        {/* Tab Solicitudes de las sucursales */}
        <TabsContent value={6} className="mt-4">
          <SolicitudesBodega />
        </TabsContent>

        {/* Tab Despachos (envío ad-hoc, sin solicitud previa) */}
        <TabsContent value={2} className="mt-4">
          <FormularioDespacho />
        </TabsContent>

        {/* Tab Códigos de Barra */}
        <TabsContent value={3} className="mt-4">
          <CatálogoCodigos />
        </TabsContent>

        {/* Tab Historial de ingresos */}
        <TabsContent value={4} className="mt-4">
          <HistorialInventarioTab />
        </TabsContent>

        {/* Tab Márgenes — solo ADMIN */}
        {esAdmin && (
          <TabsContent value={5} className="mt-4">
            <MargenesTab />
          </TabsContent>
        )}
      </Tabs>

      {/* FAB flotante para escáner */}
      <ModalEscáner onCodigoDetectado={abrirCrearConCodigo} />

      {/* ── Confirmación de guardado por lote ── */}
      {confirmarLote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => !mutacionLote.isPending && setConfirmarLote(false)}>
          <div className="w-full max-w-md rounded-2xl border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-3 flex flex-col items-center text-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Save className="size-6 text-primary" />
              </div>
              <h3 className="text-base font-bold">¿Está todo revisado?</h3>
              <p className="text-sm text-muted-foreground">
                Vas a guardar <strong className="text-foreground">{itemsConCambios.length}</strong> ítem
                {itemsConCambios.length !== 1 ? "s" : ""} con cambios de stock en la Bodega Central.
                Revisa que los ingresos y unidades utilizadas estén correctos antes de continuar.
              </p>
            </div>
            {/* Resumen de cambios */}
            <div className="mx-5 mb-3 max-h-48 overflow-y-auto rounded-xl border divide-y text-sm">
              {itemsConCambios.map((c) => {
                const item = items.find((i) => Number(i.id) === c.inventarioId);
                const saldoNuevo = (item?.saldoInicial ?? 0) + c.ingresos - c.utilizadas;
                return (
                  <div key={c.inventarioId} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="truncate">{c.nombre ?? item?.item}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {c.ingresos > 0 && <span className="text-emerald-600">+{c.ingresos} </span>}
                      {c.utilizadas > 0 && <span className="text-red-600">−{c.utilizadas} </span>}
                      → <span className="font-semibold text-foreground">{saldoNuevo}</span>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <Button variant="outline" className="flex-1" disabled={mutacionLote.isPending}
                onClick={() => setConfirmarLote(false)}>
                Revisar de nuevo
              </Button>
              <Button className="flex-1" disabled={mutacionLote.isPending} onClick={guardarLote}>
                {mutacionLote.isPending
                  ? <Loader2 className="size-4 mr-1 animate-spin" />
                  : <Save className="size-4 mr-1" />}
                Sí, guardar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Entregas a Sucursales (historial real de despachos) ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Truck className="size-5" />
            Entregas a Sucursales
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Historial de despachos enviados desde la Bodega Central
          </p>
        </CardHeader>
        <CardContent>
          {despachos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aún no hay despachos registrados
            </p>
          ) : (
            <>
              {/* Mobile: tarjetas-resumen por despacho */}
              <div className="sm:hidden space-y-2">
                {despachos.map((d) => (
                  <div key={d.loteId} className="rounded-lg border px-4 py-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{d.destino}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {new Date(d.fecha).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="secondary" className="tabular-nums font-semibold">
                          {d.totalUnidades} u.
                        </Badge>
                        <EstadoDespachoBadge estado={d.estado} />
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="w-full" onClick={() => setDetalleDespacho(d)}>
                      Ver detalle ({d.cantidadItems} producto{d.cantidadItems !== 1 ? "s" : ""})
                    </Button>
                  </div>
                ))}
              </div>

              {/* Desktop: tabla-resumen por despacho */}
              <table className="hidden sm:table w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Fecha y hora</th>
                    <th className="pb-3 pr-4 font-medium">Sucursal destino</th>
                    <th className="pb-3 pr-4 font-medium text-center">Estado</th>
                    <th className="pb-3 pr-4 font-medium text-center">Productos</th>
                    <th className="pb-3 pr-4 font-medium text-right">Unidades</th>
                    <th className="pb-3 font-medium text-center">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {despachos.map((d) => (
                    <tr key={d.loteId} className="border-b last:border-0">
                      <td className="py-3 pr-4 tabular-nums whitespace-nowrap text-muted-foreground">
                        {new Date(d.fecha).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-3 pr-4 font-medium">{d.destino}</td>
                      <td className="py-3 pr-4 text-center">
                        <EstadoDespachoBadge estado={d.estado} />
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <Badge variant="secondary" className="tabular-nums">{d.cantidadItems}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums font-semibold">{d.totalUnidades}</td>
                      <td className="py-3 text-center">
                        <Button variant="outline" size="sm" onClick={() => setDetalleDespacho(d)}>
                          Ver detalle
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Modal de detalle de un despacho ── */}
      {detalleDespacho && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setDetalleDespacho(null)}>
          <div className="w-full max-w-lg rounded-2xl border bg-background shadow-2xl flex flex-col max-h-[85dvh]"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2 border-b px-5 py-4">
              <div>
                <h3 className="text-base font-bold">Despacho a {detalleDespacho.destino}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(detalleDespacho.fecha).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  {" · "}{detalleDespacho.cantidadItems} producto{detalleDespacho.cantidadItems !== 1 ? "s" : ""}
                  {" · "}{detalleDespacho.totalUnidades} unidades
                </p>
              </div>
              <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setDetalleDespacho(null)}>
                <X className="size-4" />
                <span className="sr-only">Cerrar</span>
              </Button>
            </div>
            <div className="overflow-y-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground sticky top-0 bg-background">
                    <th className="px-4 py-2.5 font-medium">Producto</th>
                    <th className="px-4 py-2.5 font-medium text-right">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {detalleDespacho.items.map((it) => (
                    <tr key={it.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-medium">{it.producto}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{it.cantidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t px-5 py-3">
              <Button variant="outline" className="w-full" onClick={() => setDetalleDespacho(null)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}

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
                {/* Nombre del ítem (editable) */}
                <div className="space-y-1.5">
                  <Label htmlFor="form-nombre-item">Nombre del ítem</Label>
                  <Input
                    id="form-nombre-item"
                    value={form.nombre}
                    onChange={(e) => setField("nombre", e.target.value)}
                    placeholder="Nombre del producto"
                  />
                </div>

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

                {/* Precio de venta — solo ADMIN y categorías de venta (Paquetes/Líquidos/Conos) */}
                {precioEditable && (
                  <div className="space-y-1.5">
                    <Label htmlFor="form-precio-venta">Precio de venta (CLP)</Label>
                    <Input
                      id="form-precio-venta"
                      type="number"
                      min={0}
                      value={form.precioVenta}
                      onChange={(e) => setField("precioVenta", Number(e.target.value))}
                      onFocus={(e) => e.target.select()}
                    />
                    <p className="text-xs text-muted-foreground">
                      Solo el administrador puede modificar el precio de venta (las mezclas no tienen precio: son materia prima).
                    </p>
                  </div>
                )}

                {/* Costo — solo ADMIN, cualquier categoría (C7/A42): alimenta el
                    reporte de Márgenes; antes solo se capturaba al crear el producto */}
                {esAdmin && (
                  <div className="space-y-1.5">
                    <Label htmlFor="form-costo">Costo (CLP)</Label>
                    <Input
                      id="form-costo"
                      type="number"
                      min={0}
                      value={form.costo}
                      onChange={(e) => setField("costo", Number(e.target.value))}
                      onFocus={(e) => e.target.select()}
                    />
                    <p className="text-xs text-muted-foreground">
                      Costo de compra/producción por unidad — se usa en la pestaña Márgenes.
                    </p>
                  </div>
                )}

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

                {/* Merma explícita (C6/A40): baja de stock con causa propia, con
                    trazabilidad separada del ajuste genérico (movimiento MERMA
                    + historial). No pasa por el botón "Guardar Cambios". */}
                <div className="rounded-lg border border-red-200 dark:border-red-900/50 px-4 py-3 space-y-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                    Registrar merma
                  </p>
                  <div className="grid grid-cols-[7rem_1fr] gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="form-merma-cantidad" className="text-xs">Cantidad</Label>
                      <Input
                        id="form-merma-cantidad"
                        type="number"
                        min={1}
                        inputMode="numeric"
                        placeholder="0"
                        value={mermaCantidad}
                        onChange={(e) => setMermaCantidad(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="form-merma-motivo" className="text-xs">Motivo</Label>
                      <Input
                        id="form-merma-motivo"
                        placeholder="Ej: vencido, dañado, derrame…"
                        value={mermaMotivo}
                        onChange={(e) => setMermaMotivo(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950/30"
                    disabled={mutacionMerma.isPending}
                    onClick={registrarMerma}
                  >
                    {mutacionMerma.isPending ? (
                      <Loader2 className="size-3.5 mr-1 animate-spin" />
                    ) : null}
                    Descontar como merma
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Queda registrada en el historial con motivo y usuario, separada de los ajustes.
                  </p>
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

      {/* ── Bottom-sheet: Crear producto nuevo ── */}
      {crearAbierto && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => { setCrearAbierto(false); setFormCrear(FORM_CREAR_VACIO); setNuevaCategoriaMode(false); }}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[92dvh] animate-in slide-in-from-bottom duration-300">
            <div className="rounded-t-2xl bg-background overflow-y-auto max-h-[92dvh]">
              {/* Header */}
              <div className="sticky top-0 bg-background px-4 pt-4 pb-3 border-b">
                <div className="mb-3 flex justify-center">
                  <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
                </div>
                <h2 className="text-lg font-bold">Nuevo producto</h2>
                <p className="text-sm text-muted-foreground">
                  {formCrear.codigoBarra
                    ? `Código escaneado: ${formCrear.codigoBarra}`
                    : "Completa los datos del producto a agregar a la Bodega Central."}
                </p>
              </div>

              <div className="px-4 py-4 grid gap-5">
                {/* Categoría — chips */}
                <div className="space-y-2">
                  <Label>Categoría</Label>
                  <div className="flex flex-wrap gap-2">
                    {categorias.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => { setFormCrear((p) => ({ ...p, categoriaId: cat.id, categoriaNombre: "" })); setNuevaCategoriaMode(false); }}
                        className={`h-9 px-3 rounded-xl border text-sm font-semibold transition-colors ${
                          formCrear.categoriaId === cat.id && !nuevaCategoriaMode
                            ? "bg-primary/10 border-primary text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {cat.nombre}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => { setNuevaCategoriaMode(true); setFormCrear((p) => ({ ...p, categoriaId: 0 })); }}
                      className={`h-9 px-3 rounded-xl border text-sm font-semibold transition-colors ${
                        nuevaCategoriaMode
                          ? "bg-primary/10 border-primary text-primary"
                          : "border-dashed border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      + Nueva categoría
                    </button>
                  </div>
                  {nuevaCategoriaMode && (
                    <Input
                      placeholder="Nombre de la nueva categoría…"
                      value={formCrear.categoriaNombre}
                      onChange={(e) => setFormCrear((p) => ({ ...p, categoriaNombre: e.target.value }))}
                      autoFocus
                    />
                  )}
                </div>

                {/* Nombre del producto */}
                <div className="space-y-1.5">
                  <Label>Nombre del producto</Label>
                  <Input
                    placeholder="Ej: Agua Mineral Con Gas, Mezcla Nueces…"
                    value={formCrear.nombre}
                    onChange={(e) => setFormCrear((p) => ({ ...p, nombre: e.target.value }))}
                  />
                </div>

                {/* Código de barras */}
                <div className="space-y-1.5">
                  <Label>
                    Código de barras{" "}
                    <span className="text-muted-foreground font-normal">(opcional)</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="EAN-13, Code-128…"
                      value={formCrear.codigoBarra}
                      onChange={(e) => setFormCrear((p) => ({ ...p, codigoBarra: e.target.value }))}
                      className="flex-1"
                    />
                    {!formCrear.codigoBarra && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1.5"
                        title="Generar código interno EAN-13"
                        onClick={() =>
                          setFormCrear((p) => ({ ...p, codigoBarra: generarCodigoInterno() }))
                        }
                      >
                        <Wand2 className="size-3.5" />
                        Generar
                      </Button>
                    )}
                  </div>
                  {formCrear.codigoBarra && (
                    <p className="text-xs text-muted-foreground">
                      Código:{" "}
                      <span className="font-mono font-medium text-foreground">
                        {formCrear.codigoBarra}
                      </span>
                    </p>
                  )}
                </div>

                {/* Precios */}
                <div className={`grid gap-3 ${puedeVerCosto ? "grid-cols-2" : "grid-cols-1"}`}>
                  <div className="space-y-1.5">
                    <Label>Precio venta (CLP)</Label>
                    <Input
                      type="number" min={0}
                      value={formCrear.precioVenta}
                      onChange={(e) => setFormCrear((p) => ({ ...p, precioVenta: Number(e.target.value) }))}
                      onFocus={(e) => e.target.select()}
                    />
                  </div>
                  {puedeVerCosto && (
                    <div className="space-y-1.5">
                      <Label>Costo (CLP)</Label>
                      <Input
                        type="number" min={0}
                        value={formCrear.costo}
                        onChange={(e) => setFormCrear((p) => ({ ...p, costo: Number(e.target.value) }))}
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                  )}
                </div>

                {/* Stock */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Stock inicial</Label>
                    <Input
                      type="number" min={0}
                      value={formCrear.stockActual}
                      onChange={(e) => setFormCrear((p) => ({ ...p, stockActual: Number(e.target.value) }))}
                      onFocus={(e) => e.target.select()}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Stock mínimo</Label>
                    <Input
                      type="number" min={0}
                      value={formCrear.stockCritico}
                      onChange={(e) => setFormCrear((p) => ({ ...p, stockCritico: Number(e.target.value) }))}
                      onFocus={(e) => e.target.select()}
                    />
                    <p className="text-xs text-muted-foreground">Nivel de alerta "POCO STOCK"</p>
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 bg-background border-t px-4 py-3 flex gap-2">
                <Button
                  variant="outline" className="flex-1"
                  onClick={() => { setCrearAbierto(false); setFormCrear(FORM_CREAR_VACIO); setNuevaCategoriaMode(false); }}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  disabled={
                    !formCrear.nombre.trim() ||
                    (!formCrear.categoriaId && !formCrear.categoriaNombre.trim()) ||
                    mutacionCrear.isPending
                  }
                  onClick={() => mutacionCrear.mutate(formCrear)}
                >
                  {mutacionCrear.isPending ? (
                    <Loader2 className="size-4 mr-1 animate-spin" />
                  ) : (
                    <Plus className="size-4 mr-1" />
                  )}
                  Crear y agregar
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

function EstadoDespachoBadge({ estado }: { estado: "ENVIADO" | "CONFIRMADO" | null }) {
  if (estado === "CONFIRMADO") {
    return <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">Confirmado</Badge>;
  }
  if (estado === "ENVIADO") {
    return <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">Por confirmar</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] text-muted-foreground">—</Badge>;
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

// ─── Subcomponente: Historial de ingresos de productos ───

// ─── Tab Márgenes (C7/A42, solo ADMIN) ───────────────────────────────────────
// Cruza costo vs precio de venta por producto. El costo se edita en el diálogo
// "Ajustar Stock" (campo Costo, solo ADMIN).

interface MargenProducto {
  productoId:  number;
  nombre:      string;
  categoria:   string;
  costo:       number;
  precioVenta: number;
  margen:      number;
  margenPct:   number | null; // null = sin costo cargado
}

function MargenesTab() {
  const { data: margenes = [], isLoading } = useQuery({
    queryKey: ["bodega", "margenes"],
    queryFn: () =>
      apiGet<{ data: MargenProducto[] }>("/bodega/margenes").then((r) => r.data),
    throwOnError: false,
  });

  const resumen = useMemo(() => {
    const conCosto = margenes.filter((m) => m.margenPct !== null);
    const sinCosto = margenes.length - conCosto.length;
    const margenPromedio = conCosto.length > 0
      ? Math.round(conCosto.reduce((s, m) => s + (m.margenPct ?? 0), 0) / conCosto.length)
      : null;
    return { sinCosto, margenPromedio };
  }, [margenes]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (margenes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
        <TrendingUp className="mb-3 size-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No hay productos vendibles con precio cargado</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {resumen.margenPromedio !== null && (
          <div className="rounded-lg border bg-card px-3 py-1.5">
            <span className="text-muted-foreground">Margen promedio: </span>
            <span className="font-bold tabular-nums">{resumen.margenPromedio}%</span>
          </div>
        )}
        {resumen.sinCosto > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-1.5 text-amber-700 dark:text-amber-400">
            {resumen.sinCosto} producto{resumen.sinCosto !== 1 ? "s" : ""} sin costo cargado — edítalo en "Ajustar Stock"
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium text-right">Costo</th>
              <th className="px-4 py-3 font-medium text-right">Precio venta</th>
              <th className="px-4 py-3 font-medium text-right">Margen</th>
              <th className="px-4 py-3 font-medium text-right">Margen %</th>
            </tr>
          </thead>
          <tbody>
            {margenes.map((m) => (
              <tr key={m.productoId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2.5 font-medium whitespace-nowrap">{m.nombre}</td>
                <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{m.categoria}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {m.costo > 0 ? formatearCLP(m.costo) : (
                    <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-800">
                      sin costo
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatearCLP(m.precioVenta)}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                  m.margenPct === null ? "text-muted-foreground" : m.margen < 0 ? "text-red-600" : "text-emerald-600"
                }`}>
                  {m.margenPct === null ? "—" : formatearCLP(m.margen)}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${
                  m.margenPct === null ? "text-muted-foreground"
                    : m.margenPct < 0 ? "text-red-600"
                    : m.margenPct < 20 ? "text-amber-600"
                    : "text-emerald-600"
                }`}>
                  {m.margenPct === null ? "—" : `${m.margenPct}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistorialInventarioTab() {
  // Por defecto: últimos 7 días
  const hace7 = new Date();
  hace7.setDate(hace7.getDate() - 7);
  const [desde, setDesde] = useState(hace7.toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(hoyISO());
  const [detalle, setDetalle] = useState<HistorialGrupo | null>(null);

  const { data: grupos = [], isLoading } = useQuery({
    queryKey: ["bodega", "historial", desde, hasta],
    queryFn: () =>
      apiGet<{ data: HistorialGrupo[] }>(`/bodega/historial?desde=${desde}&hasta=${hasta}`)
        .then((r) => r.data)
        .catch(() => [] as HistorialGrupo[]),
  });

  const fmtFecha = (iso: string) =>
    new Date(iso).toLocaleString("es-CL", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });

  return (
    <div className="space-y-4">
      {/* Filtro por rango de fechas (calendario nativo) */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-muted/30 px-4 py-3">
        <CalendarDays className="size-5 text-muted-foreground mb-2" />
        <div className="space-y-1">
          <Label htmlFor="hist-desde" className="text-xs text-muted-foreground">Desde</Label>
          <Input id="hist-desde" type="date" value={desde} max={hasta}
            onChange={(e) => setDesde(e.target.value)} className="h-9 w-44" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hist-hasta" className="text-xs text-muted-foreground">Hasta</Label>
          <Input id="hist-hasta" type="date" value={hasta} min={desde} max={hoyISO()}
            onChange={(e) => setHasta(e.target.value)} className="h-9 w-44" />
        </div>
        <span className="ml-auto text-xs text-muted-foreground mb-2">
          {grupos.length} registro{grupos.length !== 1 ? "s" : ""}
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : grupos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <HistoryIcon className="mb-3 size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No hay movimientos de stock en el rango seleccionado
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile: tarjetas-resumen por guardado */}
          <div className="sm:hidden space-y-2">
            {grupos.map((g) => (
              <Card key={g.loteId}>
                <CardContent className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm">
                      {g.cantidad} producto{g.cantidad !== 1 ? "s" : ""} agregado{g.cantidad !== 1 ? "s" : ""}
                    </p>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">{fmtFecha(g.fecha)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {g.totalIngresos > 0 && <span className="text-emerald-600 font-medium">+{g.totalIngresos} ingresos</span>}
                    {g.totalUtilizadas > 0 && <span className="text-red-600 font-medium">−{g.totalUtilizadas} utilizadas</span>}
                    <span className="text-muted-foreground">por {g.usuario}</span>
                  </div>
                  <Button variant="outline" size="sm" className="w-full mt-1" onClick={() => setDetalle(g)}>
                    Ver detalle
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop: tabla-resumen por guardado */}
          <Card className="hidden sm:block">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Fecha y hora</th>
                    <th className="px-4 py-3 font-medium text-center">Productos</th>
                    <th className="px-4 py-3 font-medium text-right">Ingresos</th>
                    <th className="px-4 py-3 font-medium text-right">Utilizadas</th>
                    <th className="px-4 py-3 font-medium">Usuario</th>
                    <th className="px-4 py-3 font-medium text-center">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g) => (
                    <tr key={g.loteId} className="border-b last:border-0">
                      <td className="px-4 py-2.5 tabular-nums whitespace-nowrap text-muted-foreground">{fmtFecha(g.fecha)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant="secondary" className="tabular-nums">{g.cantidad}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{g.totalIngresos > 0 ? `+${g.totalIngresos}` : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{g.totalUtilizadas > 0 ? `−${g.totalUtilizadas}` : "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{g.usuario}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Button variant="outline" size="sm" onClick={() => setDetalle(g)}>
                          Ver detalle
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Modal de detalle del guardado ── */}
      {detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setDetalle(null)}>
          <div className="w-full max-w-lg rounded-2xl border bg-background shadow-2xl flex flex-col max-h-[85dvh]"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2 border-b px-5 py-4">
              <div>
                <h3 className="text-base font-bold">Detalle del registro</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {fmtFecha(detalle.fecha)} · por {detalle.usuario} · {detalle.cantidad} producto{detalle.cantidad !== 1 ? "s" : ""}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setDetalle(null)}>
                <X className="size-4" />
                <span className="sr-only">Cerrar</span>
              </Button>
            </div>
            <div className="overflow-y-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground sticky top-0 bg-background">
                    <th className="px-4 py-2.5 font-medium">Ítem</th>
                    <th className="px-3 py-2.5 font-medium text-right">Ingr.</th>
                    <th className="px-3 py-2.5 font-medium text-right">Utiliz.</th>
                    <th className="px-4 py-2.5 font-medium text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.items.map((it) => (
                    <tr key={it.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-medium">{it.nombre}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">{it.ingresos > 0 ? `+${it.ingresos}` : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{it.utilizadas > 0 ? `−${it.utilizadas}` : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className="text-muted-foreground">{it.saldoAnterior} → </span>
                        <span className="font-semibold">{it.saldoNuevo}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t px-5 py-3">
              <Button variant="outline" className="w-full" onClick={() => setDetalle(null)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponente: Tabla de inventario ───

interface TablaInventarioProps {
  items: ItemBodega[];
  draftDe: (item: ItemBodega) => DraftRow;
  onCampo: (item: ItemBodega, campo: keyof DraftRow, valor: string) => void;
  onEditar: (item: ItemBodega) => void;
  onEliminar: (id: string) => void;
}

/** Calcula el saldo resultante de una fila a partir del borrador */
function saldoResultante(item: ItemBodega, d: DraftRow): number {
  const ing = parseInt(d.ingresos, 10) || 0;
  const uti = parseInt(d.utilizadas, 10) || 0;
  return item.saldoInicial + ing - uti;
}

function TablaInventario({ items, draftDe, onCampo, onEditar, onEliminar }: TablaInventarioProps) {
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
      {/* ── Vista mobile: tarjetas editables ── */}
      <div className="sm:hidden space-y-2">
        {items.map((item) => {
          const d = draftDe(item);
          const saldo = saldoResultante(item, d);
          const estado = calcularEstado(saldo, item.stockMinimo, Math.max(item.stockMinimo * 5, saldo + 1));
          const negativo = saldo < 0;
          return (
            <Card key={item.id}>
              <CardContent className="px-4 py-3 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex-1 text-sm font-semibold truncate">{item.item}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost" size="icon"
                      tabIndex={-1}
                      className="size-8"
                      onClick={() => onEditar(item)}
                      title="Ajuste manual / stock mínimo"
                    >
                      <Pencil className="size-3.5" />
                      <span className="sr-only">Editar</span>
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      tabIndex={-1}
                      className="size-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      onClick={() => onEliminar(item.id)}
                    >
                      <Trash2 className="size-3.5" />
                      <span className="sr-only">Eliminar</span>
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Ingresos</label>
                    <Input inputMode="numeric" placeholder="0" value={d.ingresos}
                      onChange={(e) => onCampo(item, "ingresos", e.target.value)}
                      onFocus={(e) => e.target.select()} className="h-9 text-center tabular-nums" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Utilizadas</label>
                    <Input inputMode="numeric" placeholder="0" value={d.utilizadas}
                      onChange={(e) => onCampo(item, "utilizadas", e.target.value)}
                      onFocus={(e) => e.target.select()} className="h-9 text-center tabular-nums" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Inicial: <span className="tabular-nums text-foreground">{item.saldoInicial}</span></span>
                  <span className={`font-bold tabular-nums ${negativo ? "text-red-600" : "text-foreground"}`}>
                    Saldo: {saldo}
                  </span>
                  <Badge variant="outline" className={`text-xs ${badgeVariante(estado)}`}>{estado}</Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Vista desktop: tabla editable ── */}
      <Card className="hidden sm:block">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Ítem</th>
                <th className="px-4 py-3 font-medium text-right">Saldo Inic.</th>
                <th className="px-4 py-3 font-medium text-center">Ingresos</th>
                <th className="px-4 py-3 font-medium text-center">Utilizadas</th>
                <th className="px-4 py-3 font-medium text-right">Saldo Actual</th>
                <th className="px-4 py-3 font-medium text-center">Estado</th>
                <th className="px-4 py-3 font-medium text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const d = draftDe(item);
                const saldo = saldoResultante(item, d);
                const estado = calcularEstado(saldo, item.stockMinimo, Math.max(item.stockMinimo * 5, saldo + 1));
                const negativo = saldo < 0;
                return (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{item.item}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{item.saldoInicial}</td>
                    <td className="px-2 py-2">
                      <Input inputMode="numeric" placeholder="0" value={d.ingresos}
                        onChange={(e) => onCampo(item, "ingresos", e.target.value)}
                        onFocus={(e) => e.target.select()}
                        className="h-8 w-20 mx-auto text-center tabular-nums" />
                    </td>
                    <td className="px-2 py-2">
                      <Input inputMode="numeric" placeholder="0" value={d.utilizadas}
                        onChange={(e) => onCampo(item, "utilizadas", e.target.value)}
                        onFocus={(e) => e.target.select()}
                        className="h-8 w-20 mx-auto text-center tabular-nums" />
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums font-semibold ${negativo ? "text-red-600" : ""}`}>
                      {saldo}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <Badge variant="outline" className={`text-xs ${badgeVariante(estado)}`}>
                        {estado}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="size-8" tabIndex={-1} onClick={() => onEditar(item)} title="Ajuste manual / stock mínimo">
                          <Pencil className="size-3.5" />
                          <span className="sr-only">Editar</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          tabIndex={-1}
                          className="size-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                          onClick={() => onEliminar(item.id)}
                        >
                          <Trash2 className="size-3.5" />
                          <span className="sr-only">Eliminar</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
