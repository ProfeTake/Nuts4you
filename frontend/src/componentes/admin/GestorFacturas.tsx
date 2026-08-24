// ─── GestorFacturas ───
// Módulo de facturas de proveedores para el administrador.
// Permite registrar, consultar y marcar el estado de pago de facturas.

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, FileText, Check, X, ChevronDown, ChevronUp,
  Receipt, Building2, CalendarDays, AlertCircle, Pencil,
  PowerOff, Power, Landmark,
} from "lucide-react";
import { toast } from "sonner";

import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Badge }    from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";

import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { formatearCLP } from "@/lib/money";
import type {
  FacturaProveedor, ProveedorItem, EstadoFactura,
} from "@/tipos/admin.tipos";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function obtenerMeses(): string[] {
  const meses: string[] = [];
  const hoy = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return meses;
}

function labelMes(mes: string) {
  const [a, m] = mes.split("-");
  return new Date(Number(a), Number(m) - 1, 1).toLocaleDateString("es-CL", {
    month: "long", year: "numeric",
  });
}

function formatFecha(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

const ESTADO_CONFIG: Record<EstadoFactura, { label: string; className: string }> = {
  PENDIENTE: { label: "Pendiente",  className: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
  PAGADA:    { label: "Pagada",     className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  ANULADA:   { label: "Anulada",    className: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" },
};

// ─── Tipo interno para la fila de item del formulario ─────────────────────────

interface FilaItem {
  descripcion:    string;
  cantidad:       string;
  precioUnitario: string;
}

function filaVacia(): FilaItem {
  return { descripcion: "", cantidad: "1", precioUnitario: "0" };
}

// ─── Sub-componente: fila de detalle de factura ───────────────────────────────

function FilaDetalle({ item }: { item: { descripcion: string; cantidad: number; precioUnitario: number } }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-3 text-sm py-1.5 border-b last:border-0">
      <span className="text-foreground">{item.descripcion}</span>
      <span className="text-muted-foreground text-right whitespace-nowrap">× {item.cantidad}</span>
      <span className="font-medium text-right tabular-nums whitespace-nowrap">
        {formatearCLP(item.precioUnitario * item.cantidad)}
      </span>
    </div>
  );
}

// ─── Sub-componente: tarjeta resumen ─────────────────────────────────────────

function TarjetaResumen({
  label, monto, sublabel, color,
}: { label: string; monto: number; sublabel?: string; color?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${color ?? ""}`}>{formatearCLP(monto)}</p>
      {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
    </div>
  );
}

// ─── Sub-componente: fila de factura ─────────────────────────────────────────

function FilaFactura({
  factura,
  onCambiarEstado,
  onEliminar,
}: {
  factura: FacturaProveedor;
  onCambiarEstado: (id: number, estado: EstadoFactura) => void;
  onEliminar:      (id: number) => void;
}) {
  const [expandida,    setExpandida]    = useState(false);
  const [dlgEliminar,  setDlgEliminar]  = useState(false);
  const est = ESTADO_CONFIG[factura.estado];

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Cabecera */}
      <button
        onClick={() => setExpandida((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <Receipt className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">N° {factura.numeroFactura}</span>
            <Badge className={`text-xs font-medium border-0 ${est.className}`}>{est.label}</Badge>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Building2 className="size-3" />{factura.proveedorNombre}
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarDays className="size-3" />{formatFecha(factura.fecha)}
            </span>
          </div>
        </div>
        <span className="font-bold text-sm tabular-nums shrink-0">{formatearCLP(factura.montoTotal)}</span>
        {expandida
          ? <ChevronUp className="size-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>

      {/* Detalle expandible */}
      {expandida && (
        <div className="px-4 pb-4 border-t bg-muted/20">
          {/* Items */}
          <div className="mt-3 mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Productos / Servicios</p>
            {factura.items.map((item) => (
              <FilaDetalle key={item.id} item={item} />
            ))}
          </div>

          {/* Vencimiento y notas */}
          {(factura.fechaVencimiento || factura.notas) && (
            <div className="mt-3 space-y-1">
              {factura.fechaVencimiento && (
                <p className="text-xs text-muted-foreground">
                  Vencimiento: <span className="font-medium text-foreground">{formatFecha(factura.fechaVencimiento)}</span>
                </p>
              )}
              {factura.notas && (
                <p className="text-xs text-muted-foreground italic">"{factura.notas}"</p>
              )}
            </div>
          )}

          {/* Datos bancarios del proveedor (para pagar sin ir a la pestaña Proveedores) */}
          {(factura.proveedorBanco || factura.proveedorNumeroCuenta) && (
            <div className="mt-3 rounded-lg border bg-background/60 px-3 py-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-1">
                <Landmark className="size-3" />
                Datos para transferir
              </p>
              <div className="text-xs text-foreground space-y-0.5">
                {factura.proveedorBanco && (
                  <p><span className="text-muted-foreground">Banco:</span> {factura.proveedorBanco}</p>
                )}
                {factura.proveedorTipoCuenta && (
                  <p><span className="text-muted-foreground">Tipo de cuenta:</span> {factura.proveedorTipoCuenta}</p>
                )}
                {factura.proveedorNumeroCuenta && (
                  <p><span className="text-muted-foreground">N° de cuenta:</span> <span className="font-medium tabular-nums">{factura.proveedorNumeroCuenta}</span></p>
                )}
              </div>
            </div>
          )}

          {/* Acciones */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            {factura.estado === "PENDIENTE" && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950/30"
                onClick={() => onCambiarEstado(factura.id, "PAGADA")}
              >
                <Check className="size-3.5" />
                Marcar pagada
              </Button>
            )}
            {factura.estado !== "ANULADA" && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950/30"
                onClick={() => onCambiarEstado(factura.id, "ANULADA")}
              >
                <X className="size-3.5" />
                Anular
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground ml-auto hover:text-destructive"
              onClick={() => setDlgEliminar(true)}
            >
              <Trash2 className="size-3.5" />
              Eliminar
            </Button>
          </div>
        </div>
      )}

      {/* Diálogo de confirmación de eliminación */}
      <Dialog open={dlgEliminar} onOpenChange={setDlgEliminar}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="size-5" />
              Eliminar factura
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-foreground font-medium">
              ¿Seguro que quiere eliminar la factura seleccionada?
            </p>
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
              <p><span className="font-medium text-foreground">N°</span> {factura.numeroFactura}</p>
              <p><span className="font-medium text-foreground">Proveedor:</span> {factura.proveedorNombre}</p>
              <p><span className="font-medium text-foreground">Monto:</span> {formatearCLP(factura.montoTotal)}</p>
            </div>
            <p className="text-xs text-muted-foreground">Esta acción no se puede deshacer.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDlgEliminar(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="gap-1.5"
              onClick={() => { setDlgEliminar(false); onEliminar(factura.id); }}
            >
              <Trash2 className="size-3.5" />
              Eliminar factura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Formulario de nueva factura ──────────────────────────────────────────────

interface FormFacturaData {
  proveedorId:      number | null;
  numeroFactura:    string;
  fecha:            string;
  fechaVencimiento: string;
  notas:            string;
  items:            FilaItem[];
}

function FormNuevaFactura({
  proveedores,
  onGuardar,
  onCancelar,
  guardando,
}: {
  proveedores: ProveedorItem[];
  onGuardar:  (data: FormFacturaData) => void;
  onCancelar: () => void;
  guardando:  boolean;
}) {
  const hoy = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState<FormFacturaData>({
    proveedorId:      null,
    numeroFactura:    "",
    fecha:            hoy,
    fechaVencimiento: "",
    notas:            "",
    items:            [filaVacia()],
  });

  const total = useMemo(
    () =>
      form.items.reduce(
        (s, i) => s + (parseInt(i.cantidad) || 0) * (parseInt(i.precioUnitario) || 0),
        0
      ),
    [form.items]
  );

  const setItem = (idx: number, campo: keyof FilaItem, valor: string) => {
    setForm((p) => {
      const items = [...p.items];
      items[idx] = { ...items[idx], [campo]: valor };
      return { ...p, items };
    });
  };

  const agregarFila = () => setForm((p) => ({ ...p, items: [...p.items, filaVacia()] }));
  const eliminarFila = (idx: number) =>
    setForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));

  const valido =
    form.proveedorId !== null &&
    form.numeroFactura.trim().length > 0 &&
    form.fecha &&
    form.items.length > 0 &&
    form.items.every(
      (i) => i.descripcion.trim() && parseInt(i.cantidad) > 0 && parseInt(i.precioUnitario) >= 0
    );

  return (
    <div className="space-y-5">
      {/* Proveedor y número */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Proveedor</Label>
          <Select
            value={form.proveedorId?.toString() ?? ""}
            onValueChange={(v) => setForm((p) => ({ ...p, proveedorId: Number(v) }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar proveedor">
                {form.proveedorId != null
                  ? (proveedores.find((p) => p.id === form.proveedorId)?.nombre ?? "")
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {proveedores.filter((p) => p.activo).map((p) => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>N° de factura</Label>
          <Input
            placeholder="Ej: 001234"
            value={form.numeroFactura}
            onChange={(e) => setForm((p) => ({ ...p, numeroFactura: e.target.value }))}
          />
        </div>
      </div>

      {/* Fechas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-end">
        <div className="space-y-1.5">
          <Label>Fecha de factura</Label>
          <Input
            type="date"
            value={form.fecha}
            onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            Fecha de vencimiento
            <span className="text-muted-foreground text-xs font-normal">(opcional)</span>
          </Label>
          <Input
            type="date"
            value={form.fechaVencimiento}
            onChange={(e) => setForm((p) => ({ ...p, fechaVencimiento: e.target.value }))}
          />
        </div>
      </div>

      {/* Items */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Productos / Servicios</Label>
          <Button type="button" size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={agregarFila}>
            <Plus className="size-3" />
            Agregar ítem
          </Button>
        </div>

        {/* Encabezado de columnas */}
        <div className="grid grid-cols-[1fr_80px_110px_32px] gap-2 text-xs text-muted-foreground font-medium px-1">
          <span>Descripción</span>
          <span className="text-center">Cantidad</span>
          <span className="text-right">Precio unit.</span>
          <span />
        </div>

        <div className="space-y-2">
          {form.items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_80px_110px_32px] gap-2 items-center">
              <Input
                placeholder="Nombre del producto o servicio"
                value={item.descripcion}
                onChange={(e) => setItem(idx, "descripcion", e.target.value)}
                className="text-sm"
              />
              <Input
                type="number"
                min={1}
                value={item.cantidad}
                onChange={(e) => setItem(idx, "cantidad", e.target.value)}
                onFocus={(e) => e.target.select()}
                className="text-sm text-center"
              />
              <Input
                type="number"
                min={0}
                value={item.precioUnitario}
                onChange={(e) => setItem(idx, "precioUnitario", e.target.value)}
                onFocus={(e) => e.target.select()}
                className="text-sm text-right"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 text-muted-foreground hover:text-destructive"
                onClick={() => eliminarFila(idx)}
                disabled={form.items.length === 1}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>

        {/* Total calculado */}
        <div className="flex justify-end items-center gap-2 pt-1 border-t">
          <span className="text-sm text-muted-foreground">Total calculado:</span>
          <span className="text-lg font-bold tabular-nums">{formatearCLP(total)}</span>
        </div>
      </div>

      {/* Notas */}
      <div className="space-y-1.5">
        <Label>Notas <span className="text-muted-foreground text-xs">(opcional)</span></Label>
        <Input
          placeholder="Observaciones, condiciones de pago, etc."
          value={form.notas}
          onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))}
        />
      </div>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Button>
        <Button
          onClick={() => onGuardar(form)}
          disabled={!valido || guardando}
        >
          {guardando ? "Guardando…" : "Guardar factura"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Tipos de cuenta bancaria en Chile ───────────────────────────────────────

const TIPOS_CUENTA = [
  "Cuenta Corriente",
  "Cuenta Vista",
  "Cuenta de Ahorro",
  "Cuenta RUT",
];

// ─── Formulario de proveedor (crear y editar) ─────────────────────────────────

interface FormProveedorData {
  nombre:       string;
  rut:          string;
  contacto:     string;
  banco:        string;
  tipoCuenta:   string;
  numeroCuenta: string;
}

function formProveedorVacio(): FormProveedorData {
  return { nombre: "", rut: "", contacto: "", banco: "", tipoCuenta: "", numeroCuenta: "" };
}

function FormProveedor({
  inicial,
  onGuardar,
  onCancelar,
  guardando,
  esEdicion,
}: {
  inicial:   FormProveedorData;
  onGuardar: (data: FormProveedorData) => void;
  onCancelar: () => void;
  guardando:  boolean;
  esEdicion:  boolean;
}) {
  const [form, setForm] = useState<FormProveedorData>(inicial);
  const set = (k: keyof FormProveedorData, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const tieneDatosBancarios = form.banco || form.tipoCuenta || form.numeroCuenta;

  return (
    <div className="space-y-5">
      {/* Datos generales */}
      <div className="space-y-1.5">
        <Label>Nombre de la tienda / empresa</Label>
        <Input
          placeholder="Ej: Distribuidora El Norte"
          value={form.nombre}
          onChange={(e) => set("nombre", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>RUT <span className="text-muted-foreground text-xs">(opcional)</span></Label>
          <Input
            placeholder="12.345.678-9"
            value={form.rut}
            onChange={(e) => set("rut", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Contacto <span className="text-muted-foreground text-xs">(opcional)</span></Label>
          <Input
            placeholder="Teléfono o email"
            value={form.contacto}
            onChange={(e) => set("contacto", e.target.value)}
          />
        </div>
      </div>

      {/* Datos bancarios */}
      <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Landmark className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Datos bancarios</span>
          <span className="text-xs text-muted-foreground">(opcional)</span>
          {tieneDatosBancarios && (
            <button
              type="button"
              className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors"
              onClick={() => setForm((p) => ({ ...p, banco: "", tipoCuenta: "", numeroCuenta: "" }))}
            >
              Limpiar
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Banco</Label>
            <Input
              placeholder="Ej: Banco de Chile"
              value={form.banco}
              onChange={(e) => set("banco", e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de cuenta</Label>
            <Select value={form.tipoCuenta} onValueChange={(v) => set("tipoCuenta", v ?? "")}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Seleccionar tipo" />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_CUENTA.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Número de cuenta</Label>
          <Input
            placeholder="Ej: 00-123-456789-01"
            value={form.numeroCuenta}
            onChange={(e) => set("numeroCuenta", e.target.value)}
            className="text-sm font-mono"
          />
        </div>
      </div>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onCancelar} disabled={guardando}>Cancelar</Button>
        <Button onClick={() => onGuardar(form)} disabled={!form.nombre.trim() || guardando}>
          {guardando ? "Guardando…" : esEdicion ? "Guardar cambios" : "Agregar proveedor"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function GestorFacturas() {
  const queryClient = useQueryClient();

  // Filtros
  const [mes,         setMes]         = useState(mesActual());
  const [filtroEst,   setFiltroEst]   = useState<EstadoFactura | "TODOS">("TODOS");
  const [filtroProv,  setFiltroProv]  = useState<string>("TODOS");

  // Diálogos facturas
  const [dlgFactura,           setDlgFactura]           = useState(false);
  // Diálogos proveedores
  const [dlgProveedor,         setDlgProveedor]         = useState(false);
  const [proveedorEditando,    setProveedorEditando]    = useState<ProveedorItem | null>(null);
  const [proveedorAEliminar,   setProveedorAEliminar]   = useState<ProveedorItem | null>(null);

  const meses = obtenerMeses();

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: proveedores = [] } = useQuery({
    queryKey: ["proveedores"],
    queryFn: () => apiGet<{ data: ProveedorItem[] }>("/proveedores").then((r) => r.data),
  });

  const { data: facturas = [], isLoading: cargandoFacturas } = useQuery({
    queryKey: ["proveedores", "facturas", mes],
    queryFn: () =>
      apiGet<{ data: FacturaProveedor[] }>(`/proveedores/facturas?mes=${mes}`).then((r) => r.data),
  });

  // ── Facturas filtradas ────────────────────────────────────────────────────

  const facturasFiltradas = useMemo(() => {
    return facturas.filter((f) => {
      if (filtroEst !== "TODOS" && f.estado !== filtroEst) return false;
      if (filtroProv !== "TODOS" && f.proveedorId.toString() !== filtroProv) return false;
      return true;
    });
  }, [facturas, filtroEst, filtroProv]);

  // ── Resumen del mes ───────────────────────────────────────────────────────

  const resumen = useMemo(() => {
    const total     = facturas.reduce((s, f) => s + f.montoTotal, 0);
    const pendiente = facturas.filter((f) => f.estado === "PENDIENTE").reduce((s, f) => s + f.montoTotal, 0);
    const pagada    = facturas.filter((f) => f.estado === "PAGADA").reduce((s, f) => s + f.montoTotal, 0);
    return { total, pendiente, pagada };
  }, [facturas]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const mutCrearFactura = useMutation({
    mutationFn: (body: object) =>
      apiPost<{ data: FacturaProveedor }>("/proveedores/facturas", body),
    onSuccess: () => {
      toast.success("Factura registrada");
      queryClient.invalidateQueries({ queryKey: ["proveedores", "facturas"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "resumen-facturas"] });
      setDlgFactura(false);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al guardar factura"),
  });

  const mutEstado = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: EstadoFactura }) =>
      apiPatch<{ data: { id: number } }>(`/proveedores/facturas/${id}/estado`, { estado }),
    onSuccess: () => {
      toast.success("Estado actualizado");
      queryClient.invalidateQueries({ queryKey: ["proveedores", "facturas"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "resumen-facturas"] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al actualizar estado"),
  });

  const mutEliminar = useMutation({
    mutationFn: (id: number) => apiDelete<{ data: { id: number } }>(`/proveedores/facturas/${id}`),
    onSuccess: () => {
      toast.success("Factura eliminada");
      queryClient.invalidateQueries({ queryKey: ["proveedores", "facturas"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "resumen-facturas"] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al eliminar"),
  });

  const mutCrearProveedor = useMutation({
    mutationFn: (body: object) => apiPost<{ data: ProveedorItem }>("/proveedores", body),
    onSuccess: () => {
      toast.success("Proveedor agregado");
      queryClient.invalidateQueries({ queryKey: ["proveedores"] });
      setDlgProveedor(false);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al guardar proveedor"),
  });

  const mutEditarProveedor = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      apiPatch<{ data: ProveedorItem }>(`/proveedores/${id}`, body),
    onSuccess: () => {
      toast.success("Proveedor actualizado");
      queryClient.invalidateQueries({ queryKey: ["proveedores"] });
      setProveedorEditando(null);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al editar proveedor"),
  });

  const mutToggleActivo = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiPatch<{ data: ProveedorItem }>(`/proveedores/${id}/activo`, { activo }),
    onSuccess: (_d, vars) => {
      toast.success(vars.activo ? "Proveedor activado" : "Proveedor desactivado");
      queryClient.invalidateQueries({ queryKey: ["proveedores"] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al cambiar estado"),
  });

  const mutEliminarProveedor = useMutation({
    mutationFn: (id: number) => apiDelete<{ data: { id: number } }>(`/proveedores/${id}`),
    onSuccess: () => {
      toast.success("Proveedor eliminado");
      queryClient.invalidateQueries({ queryKey: ["proveedores"] });
      setProveedorAEliminar(null);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al eliminar proveedor"),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleGuardarFactura = (form: FormFacturaData) => {
    if (!form.proveedorId) return;
    mutCrearFactura.mutate({
      proveedorId:      form.proveedorId,
      numeroFactura:    form.numeroFactura.trim(),
      fecha:            form.fecha,
      fechaVencimiento: form.fechaVencimiento || undefined,
      montoTotal:       form.items.reduce(
        (s, i) => s + (parseInt(i.cantidad) || 0) * (parseInt(i.precioUnitario) || 0),
        0
      ),
      notas: form.notas.trim() || undefined,
      items: form.items.map((i) => ({
        descripcion:    i.descripcion.trim(),
        cantidad:       parseInt(i.cantidad),
        precioUnitario: parseInt(i.precioUnitario),
      })),
    });
  };

  const handleGuardarProveedor = (data: FormProveedorData) => {
    const body = {
      nombre:       data.nombre.trim(),
      rut:          data.rut.trim()          || undefined,
      contacto:     data.contacto.trim()     || undefined,
      banco:        data.banco.trim()        || undefined,
      tipoCuenta:   data.tipoCuenta.trim()   || undefined,
      numeroCuenta: data.numeroCuenta.trim() || undefined,
    };
    mutCrearProveedor.mutate(body);
  };

  const handleEditarProveedor = (data: FormProveedorData) => {
    if (!proveedorEditando) return;
    const body = {
      nombre:       data.nombre.trim(),
      rut:          data.rut.trim()          || undefined,
      contacto:     data.contacto.trim()     || undefined,
      banco:        data.banco.trim()        || undefined,
      tipoCuenta:   data.tipoCuenta.trim()   || undefined,
      numeroCuenta: data.numeroCuenta.trim() || undefined,
    };
    mutEditarProveedor.mutate({ id: proveedorEditando.id, body });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Facturas de Proveedores</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Control de inversiones y compras a proveedores
          </p>
        </div>
        <Button className="gap-2 shrink-0" onClick={() => setDlgFactura(true)}>
          <Plus className="size-4" />
          Nueva Factura
        </Button>
      </div>

      {/* Tabs: Facturas / Proveedores */}
      <Tabs defaultValue="facturas">
        <TabsList className="mb-4">
          <TabsTrigger value="facturas" className="gap-2">
            <FileText className="size-4" />
            Facturas
          </TabsTrigger>
          <TabsTrigger value="proveedores" className="gap-2">
            <Building2 className="size-4" />
            Proveedores
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Facturas ─────────────────────────────────────────────── */}
        <TabsContent value="facturas" className="space-y-4 mt-0">
          {/* Filtros */}
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={mes} onValueChange={(v) => setMes(v ?? mes)}>
              <SelectTrigger className="w-44">
                {/* La etiqueta va como children: Base UI muestra el value crudo
                    si no se le pasa (decía "2026-08" en vez de "Agosto 2026"). */}
                <SelectValue>{labelMes(mes)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {meses.map((m) => (
                  <SelectItem key={m} value={m}>{labelMes(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filtroProv} onValueChange={(v) => setFiltroProv(v ?? "TODOS")}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Todos los proveedores">
                  {filtroProv === "TODOS"
                    ? "Todos los proveedores"
                    : proveedores.find((p) => String(p.id) === filtroProv)?.nombre}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los proveedores</SelectItem>
                {proveedores.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>{p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filtroEst} onValueChange={(v) => setFiltroEst(v as EstadoFactura | "TODOS")}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Todos los estados">
                  {filtroEst === "TODOS" ? "Todos" : ESTADO_CONFIG[filtroEst].label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="PENDIENTE">Pendiente</SelectItem>
                <SelectItem value="PAGADA">Pagada</SelectItem>
                <SelectItem value="ANULADA">Anulada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tarjetas resumen */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TarjetaResumen
              label="Total del mes"
              monto={resumen.total}
              sublabel={`${facturas.length} factura${facturas.length !== 1 ? "s" : ""}`}
            />
            <TarjetaResumen
              label="Por pagar"
              monto={resumen.pendiente}
              color="text-amber-600 dark:text-amber-400"
              sublabel={`${facturas.filter((f) => f.estado === "PENDIENTE").length} pendiente${facturas.filter((f) => f.estado === "PENDIENTE").length !== 1 ? "s" : ""}`}
            />
            <TarjetaResumen
              label="Pagadas"
              monto={resumen.pagada}
              color="text-emerald-600 dark:text-emerald-400"
              sublabel={`${facturas.filter((f) => f.estado === "PAGADA").length} pagada${facturas.filter((f) => f.estado === "PAGADA").length !== 1 ? "s" : ""}`}
            />
          </div>

          <Separator />

          {/* Lista de facturas */}
          {cargandoFacturas ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <AlertCircle className="size-4 animate-pulse" />
              Cargando facturas…
            </div>
          ) : facturasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <FileText className="size-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {facturas.length === 0
                  ? "No hay facturas registradas en este período"
                  : "No hay facturas con los filtros seleccionados"}
              </p>
              {facturas.length === 0 && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDlgFactura(true)}>
                  <Plus className="size-3.5" />
                  Registrar primera factura
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {facturasFiltradas.map((f) => (
                <FilaFactura
                  key={f.id}
                  factura={f}
                  onCambiarEstado={(id, estado) => mutEstado.mutate({ id, estado })}
                  onEliminar={(id) => mutEliminar.mutate(id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Proveedores ────────────────────────────────────────────── */}
        <TabsContent value="proveedores" className="mt-0">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">
              {proveedores.length} proveedor{proveedores.length !== 1 ? "es" : ""} registrado{proveedores.length !== 1 ? "s" : ""}
            </p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDlgProveedor(true)}>
              <Plus className="size-3.5" />
              Nuevo proveedor
            </Button>
          </div>

          {proveedores.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <Building2 className="size-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No hay proveedores registrados</p>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDlgProveedor(true)}>
                <Plus className="size-3.5" />
                Agregar proveedor
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {proveedores.map((p) => {
                const nFacturas = facturas.filter((f) => f.proveedorId === p.id).length;
                const tieneBanco = p.banco || p.tipo_cuenta || p.numero_cuenta;
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border bg-card overflow-hidden transition-opacity ${!p.activo ? "opacity-60" : ""}`}
                  >
                    {/* Fila principal */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className={`flex size-9 shrink-0 items-center justify-center rounded-full ${p.activo ? "bg-muted" : "bg-muted/50"}`}>
                        <Building2 className="size-4 text-muted-foreground" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm truncate">{p.nombre}</p>
                          {!p.activo && (
                            <Badge className="text-xs border-0 bg-muted text-muted-foreground">Inactivo</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {p.rut && (
                            <span className="text-xs text-muted-foreground">RUT: {p.rut}</span>
                          )}
                          {p.contacto && (
                            <span className="text-xs text-muted-foreground">{p.contacto}</span>
                          )}
                          {tieneBanco && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Landmark className="size-3" />
                              {[p.banco, p.tipo_cuenta, p.numero_cuenta].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </div>
                      </div>

                      <span className="text-xs text-muted-foreground shrink-0 mr-2">
                        {nFacturas} factura{nFacturas !== 1 ? "s" : ""}
                      </span>

                      {/* Acciones */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-muted-foreground hover:text-primary"
                          title="Editar proveedor"
                          onClick={() => setProveedorEditando(p)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`size-8 ${p.activo ? "text-muted-foreground hover:text-amber-600" : "text-muted-foreground hover:text-emerald-600"}`}
                          title={p.activo ? "Desactivar proveedor" : "Activar proveedor"}
                          onClick={() => mutToggleActivo.mutate({ id: p.id, activo: !p.activo })}
                        >
                          {p.activo ? <PowerOff className="size-3.5" /> : <Power className="size-3.5" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          title="Eliminar proveedor"
                          onClick={() => setProveedorAEliminar(p)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Diálogo: Nueva Factura ──────────────────────────────────────────── */}
      <Dialog open={dlgFactura} onOpenChange={setDlgFactura}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="size-5" />
              Registrar Factura
            </DialogTitle>
          </DialogHeader>
          {proveedores.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <Building2 className="size-10 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Primero debes agregar al menos un proveedor
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setDlgFactura(false); setDlgProveedor(true); }}
              >
                Agregar proveedor
              </Button>
            </div>
          ) : (
            <FormNuevaFactura
              proveedores={proveedores}
              onGuardar={handleGuardarFactura}
              onCancelar={() => setDlgFactura(false)}
              guardando={mutCrearFactura.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: Nuevo Proveedor ────────────────────────────────────────── */}
      <Dialog open={dlgProveedor} onOpenChange={setDlgProveedor}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-5" />
              Nuevo Proveedor
            </DialogTitle>
          </DialogHeader>
          <FormProveedor
            inicial={formProveedorVacio()}
            onGuardar={handleGuardarProveedor}
            onCancelar={() => setDlgProveedor(false)}
            guardando={mutCrearProveedor.isPending}
            esEdicion={false}
          />
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: Editar Proveedor ───────────────────────────────────────── */}
      <Dialog open={!!proveedorEditando} onOpenChange={(o) => { if (!o) setProveedorEditando(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-5" />
              Editar Proveedor
            </DialogTitle>
          </DialogHeader>
          {proveedorEditando && (
            <FormProveedor
              inicial={{
                nombre:       proveedorEditando.nombre,
                rut:          proveedorEditando.rut          ?? "",
                contacto:     proveedorEditando.contacto     ?? "",
                banco:        proveedorEditando.banco        ?? "",
                tipoCuenta:   proveedorEditando.tipo_cuenta  ?? "",
                numeroCuenta: proveedorEditando.numero_cuenta ?? "",
              }}
              onGuardar={handleEditarProveedor}
              onCancelar={() => setProveedorEditando(null)}
              guardando={mutEditarProveedor.isPending}
              esEdicion={true}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: Confirmar eliminar Proveedor ───────────────────────────── */}
      <Dialog open={!!proveedorAEliminar} onOpenChange={(o) => { if (!o) setProveedorAEliminar(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="size-5" />
              Eliminar proveedor
            </DialogTitle>
          </DialogHeader>
          {proveedorAEliminar && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-foreground font-medium">
                ¿Seguro que quiere eliminar el proveedor seleccionado?
              </p>
              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm font-medium">
                {proveedorAEliminar.nombre}
                {proveedorAEliminar.rut && (
                  <span className="text-xs text-muted-foreground ml-2">RUT {proveedorAEliminar.rut}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Solo se puede eliminar si el proveedor no tiene facturas registradas. Esta acción no se puede deshacer.
              </p>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setProveedorAEliminar(null)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  className="gap-1.5"
                  onClick={() => mutEliminarProveedor.mutate(proveedorAEliminar.id)}
                  disabled={mutEliminarProveedor.isPending}
                >
                  <Trash2 className="size-3.5" />
                  Eliminar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
