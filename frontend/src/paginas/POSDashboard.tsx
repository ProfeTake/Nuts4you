// Página: Turno Activo
//
// Pantalla principal del vendedor — dos zonas:
//   1. Scroll: conteo de stock (mezclas, paquetes, líquidos)
//   2. Barra fija inferior: total calculado + botón "Cuadrar Caja"
//
// Al tocar "Cuadrar Caja" sube un panel (bottom sheet) con:
//   efectivo, tarjeta, transferencia, gastos/retiros y cuadre en tiempo real.

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMenuNav } from "@/componentes/layout/contexto-menu";
import { formatearCLP } from "@/lib/money";
import { useCajaStore, CATEGORIA_APERTURA } from "@/store/caja.store";
import type { CierrePayload } from "@/store/caja.store";
import { useAuthStore } from "@/store/auth.store";
import { productosMock } from "@/datos/mock.datos";
import { movimientoCajaSchema } from "@/validaciones/pos.schema";
import type { MovimientoCaja } from "@/tipos/pos.tipos";
import { apiGet, apiPatch } from "@/lib/api";
import { CATEGORIAS_GASTO } from "@/lib/gastos";
import { compararPorProductoId } from "@/lib/categorias";
import { toast } from "sonner";
import {
  Menu, Plus, ChevronDown, ChevronUp,
  CreditCard, ArrowLeftRight, Banknote,
  X, Trash2, AlertTriangle, Camera, ZoomIn,
  Calculator, Clock, Check, Ban, Loader2, RefreshCw, Truck,
} from "lucide-react";
import { Input } from "@/components/ui/input";

// Estado de una solicitud de gasto del vendedor (vista de su propio turno).
interface MiSolicitudGasto {
  id: number;
  monto: number;
  motivo: string;
  categoria: string | null;
  estado: "PENDIENTE" | "APROBADO" | "RECHAZADO";
  comentario: string | null;
  creadoEn: string;
}

// Aviso del último cierre preventivo del punto: tareas dejadas al vendedor y/o
// retiro de efectivo realizado por el admin/supervisor durante su visita.
interface NotaVendedor {
  id: number;
  fecha: string;
  autor: string;
  notasVendedor: string | null;
  montoRetiro: number;
  checklist: { label: string; marcado: boolean }[];
}

// Despacho recibido por confirmar.
interface DespachoPendiente {
  loteId: string;
  /**
   * Solicitud que originó el despacho, o null si fue ad-hoc. Define por dónde se
   * confirma: con solicitud el stock entra al PDV recién al confirmarla.
   */
  solicitudId: number | null;
  fecha: string;
  enviadoPor: string | null;
  observacion: string | null;
  cantidadItems: number;
  totalUnidades: number;
  items: { productoId: number; producto: string; cantidad: number }[];
}

// ─── Constantes ───────────────────────────────────────────────────────────────

// Mezcla de Helados (5) va con las mezclas, no con los líquidos: es materia prima
// (precio 0), igual que las otras cuatro, y así queda en la misma etiqueta que
// tiene en el catálogo y en bodega.
const MEZCLA_IDS  = [1, 2, 3, 4, 5];
const PAQUETE_IDS = [6, 7, 8, 9];
const DIRECTO_IDS = [10, 11, 12, 13, 14, 15];

// Cada unidad de mezcla cocinada produce N paquetes del tipo correspondiente.
// Esa producción se suma al disponible del paquete al contar el cierre.
const MEZCLA_A_PAQ: Record<number, { paqId: number; factor: number }> = {
  1: { paqId: 6, factor: 19 }, // Mezcla Maní     → Paquetes Maní     (×19)
  2: { paqId: 7, factor: 20 }, // Mezcla Almendra → Paquetes Almendra (×20)
  3: { paqId: 8, factor: 20 }, // Mezcla Nuez     → Paquetes Nuez      (×20)
  4: { paqId: 9, factor: 10 }, // Mezcla Promo    → Promos             (×10)
};

// Todos los ítems se cuentan por saldo final (stock-flow): vendido = disponible − saldo.
const TODOS_IDS = [...MEZCLA_IDS, ...PAQUETE_IDS, ...DIRECTO_IDS];


const nomProd    = (id: number) => productosMock.find(p => p.id === id)?.nombre ?? `#${id}`;
const precioProd = (id: number) => productosMock.find(p => p.id === id)?.precioVenta ?? 0;

type TipoMov = MovimientoCaja["tipo"];

/**
 * Movimientos que se pueden crear desde el POS. Los RETIROS quedan fuera a
 * propósito: los registra el admin/supervisor en el panel de Sucursales y bajan
 * al POS como solo lectura (ver `cargarRetirosDesdeAPI`).
 */
type TipoMovCreable = Exclude<TipoMov, "retiro">;

const TIPO_CONFIG: Record<TipoMov, { label: string; bg: string; text: string; signo: "+" | "-" }> = {
  gasto:   { label: "Gasto",   bg: "bg-red-100 dark:bg-red-950/40",         text: "text-red-700 dark:text-red-400",         signo: "-" },
  retiro:  { label: "Retiro",  bg: "bg-orange-100 dark:bg-orange-950/40",   text: "text-orange-700 dark:text-orange-400",   signo: "-" },
  ingreso: { label: "Ingreso", bg: "bg-emerald-100 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", signo: "+" },
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function POSDashboard() {
  const { abrirMenu }  = useMenuNav();
  const navigate       = useNavigate();
  const cerrarSesion   = useAuthStore(s => s.cerrarSesion);
  const usuario        = useAuthStore(s => s.usuario);
  const puedeEliminar  = usuario?.rol === "ADMIN" || usuario?.rol === "SUPERVISOR";

  const {
    inventarioInicial, turno,
    movimientos, agregarMovimiento, eliminarMovimiento, cerrarTurno,
    cargarGastosDesdeAPI, cargarRetirosDesdeAPI, borradorConteo, guardarBorradorConteo,
    sincronizarTurnoActivo,
  } = useCajaStore();

  // Al montar: reconcilia el turno con el backend (corrige id temporal de apertura
  // offline / descarta turnos cerrados en otro dispositivo) y carga gastos en BD.
  useEffect(() => {
    if (turno?.pdvId) sincronizarTurnoActivo(turno.pdvId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turno?.pdvId]);

  // Gastos y retiros del turno desde la BD. Los retiros los registra el
  // admin/supervisor desde el panel, así que es la única forma de que el cuadre
  // del vendedor los descuente.
  useEffect(() => {
    if (turno?.id) {
      cargarGastosDesdeAPI(turno.id);
      cargarRetirosDesdeAPI(turno.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turno?.id]);

  // ── Stock disponible EN VIVO ───────────────────────────────────────────────
  // El stock del PDV no baja durante el turno (modelo declarado): stock_actual en
  // la BD siempre es el disponible real, incluyendo despachos que lleguen a mitad
  // de turno. Por eso el disponible se lee en vivo, no de la foto de apertura.
  const [liveStock, setLiveStock] = useState<Record<number, number> | null>(null);
  const [actualizandoStock, setActualizandoStock] = useState(false);

  // Despachos recibidos por confirmar.
  const [despachosPendientes, setDespachosPendientes] = useState<DespachoPendiente[]>([]);
  const [confirmandoLote, setConfirmandoLote] = useState<string | null>(null);

  // Nota/tarea vigente que el admin dejó para el vendedor (cierre preventivo).
  const [notaVendedor, setNotaVendedor] = useState<NotaVendedor | null>(null);
  const [notaCerrada, setNotaCerrada] = useState(false);

  useEffect(() => {
    if (!turno?.pdvId) return;
    apiGet<{ data: NotaVendedor | null }>("/cierres-preventivos/nota-vendedor")
      .then(r => { setNotaVendedor(r.data); setNotaCerrada(false); })
      .catch(() => { /* sin nota u offline: no se muestra nada */ });
  }, [turno?.pdvId]);

  const cargarStock = useCallback(async () => {
    const pid = turno?.pdvId;
    if (!pid) return;
    setActualizandoStock(true);
    try {
      const r = await apiGet<{ data: { productoId: number; stockActual: number }[] }>(`/inventario/${pid}`);
      setLiveStock(Object.fromEntries(r.data.map(s => [s.productoId, s.stockActual])));
    } catch {
      /* offline: se mantiene la foto de apertura como respaldo */
    } finally {
      setActualizandoStock(false);
    }
  }, [turno?.pdvId]);

  const cargarPendientes = useCallback(async () => {
    const pid = turno?.pdvId;
    if (!pid) return;
    try {
      const r = await apiGet<{ data: DespachoPendiente[] }>(`/bodega/despachos/pendientes?pdvId=${pid}`);
      setDespachosPendientes(r.data);
    } catch { /* offline: se reintenta en el próximo ciclo */ }
  }, [turno?.pdvId]);

  // Carga al montar y refresca cada 20 s: stock en vivo + despachos por confirmar.
  useEffect(() => {
    cargarStock();
    cargarPendientes();
    const iv = setInterval(() => { cargarStock(); cargarPendientes(); }, 20_000);
    return () => clearInterval(iv);
  }, [cargarStock, cargarPendientes]);

  // Dos caminos según el origen del despacho: el que vino de una solicitud se
  // acusa confirmando LA SOLICITUD, que es lo que acredita el stock en el PDV
  // (despacho diferido). El ad-hoc ya sumó al inventario y solo se marca recibido.
  const confirmarRecepcion = async (d: DespachoPendiente) => {
    setConfirmandoLote(d.loteId);
    try {
      if (d.solicitudId !== null) {
        await apiPatch(`/solicitudes/${d.solicitudId}/confirmar`, {});
      } else {
        await apiPatch(`/bodega/despachos/${d.loteId}/confirmar`, {});
      }
      toast.success("Recepción confirmada", { description: "El stock ya está en tu punto" });
      setDespachosPendientes(prev => prev.filter(x => x.loteId !== d.loteId));
      await cargarStock();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo confirmar la recepción");
    } finally {
      setConfirmandoLote(null);
    }
  };

  // ── Stock ────────────────────────────────────────────────────────────────
  // Todo se cuenta por saldo final (incluidas las mezclas). Se inicializa desde
  // el borrador persistido para no perder el avance al refrescar.
  const [stockActual, setStockActual] = useState<Record<number, string>>(
    () => borradorConteo?.stock ?? Object.fromEntries(TODOS_IDS.map(id => [id, ""]))
  );

  // Persiste el avance del conteo (debounced ligero vía efecto) para sobrevivir refrescos.
  useEffect(() => {
    guardarBorradorConteo({ stock: stockActual });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockActual]);
  const [seccionExpand, setSeccionExpand] = useState<Record<string, boolean>>({
    mezclas: true, paquetes: true, liquidos: true,
  });

  // ── Panel cuadre ─────────────────────────────────────────────────────────
  const [cuadreAbierto, setCuadreAbierto] = useState(false);

  // ── Campos del cuadre ────────────────────────────────────────────────────
  const [efectivo,      setEfectivo]      = useState("");
  const [tarjeta,       setTarjeta]       = useState("");
  const [transferencia, setTransferencia] = useState("");
  const [boucherUrl,    setBoucherUrl]    = useState<string | null>(null);
  const [verBoucher,    setVerBoucher]    = useState(false);
  const [modalMov,      setModalMov]      = useState<TipoMovCreable | null>(null);
  const [confirmando,   setConfirmando]   = useState(false);
  const [cerrando,      setCerrando]      = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Solicitud de gasto (vendedor) — se solicita desde la sección Solicitudes;
  //    aquí solo se muestra el estado de las solicitudes del turno como referencia.
  const [misSolicitudes, setMisSolicitudes] = useState<MiSolicitudGasto[]>([]);

  const cargarMisSolicitudes = useCallback(() => {
    const tid = turno?.id;
    if (!tid) return;
    apiGet<{ data: MiSolicitudGasto[] }>(`/solicitudes-gasto/turno/${tid}`)
      .then(r => setMisSolicitudes(r.data))
      .catch(() => { /* sin red: se muestran solo los locales */ });
  }, [turno?.id]);

  // Al abrir el cuadre, refresca solicitudes, gastos aprobados y retiros. Los
  // retiros se vuelven a leer aquí a propósito: el admin pudo registrar uno
  // minutos antes de que el vendedor cuadrara.
  useEffect(() => {
    if (cuadreAbierto) {
      cargarMisSolicitudes();
      if (turno?.id) {
        cargarGastosDesdeAPI(turno.id);
        cargarRetirosDesdeAPI(turno.id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuadreAbierto]);

  const efectivoNum      = parseInt(efectivo.replace(/\D/g, ""), 10)       || 0;
  const tarjetaNum       = parseInt(tarjeta.replace(/\D/g, ""), 10)        || 0;
  const transferenciaNum = parseInt(transferencia.replace(/\D/g, ""), 10)  || 0;

  const toggleSeccion = (k: string) => setSeccionExpand(p => ({ ...p, [k]: !p[k] }));

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (boucherUrl) URL.revokeObjectURL(boucherUrl);
    setBoucherUrl(URL.createObjectURL(file));
    e.target.value = "";
  };

  const fmtCLP = (v: string) => {
    const n = parseInt(v.replace(/\D/g, ""), 10);
    return n > 0 ? `$${n.toLocaleString("es-CL")}` : "";
  };

  // ── Cálculos de inventario ────────────────────────────────────────────────

  const invItem = useCallback(
    (id: number) => inventarioInicial.find(i => i.productoId === id) ?? { inicio: 0, ingreso: 0 },
    [inventarioInicial],
  );

  const dispBase = useMemo(() => {
    const r: Record<number, number> = {};
    TODOS_IDS.forEach(id => {
      const it = invItem(id);
      // Stock en vivo del PDV si hay red; si no, la foto de apertura (inicio+ingreso).
      r[id] = liveStock?.[id] ?? (it.inicio + it.ingreso);
    });
    return r;
  }, [invItem, liveStock]);

  // Producción del turno: cada mezcla consumida (disp − saldo final) se cocina en
  // paquetes (×factor) que se agregan al disponible de su paquete. Si la mezcla
  // aún no tiene saldo ingresado, no se asume producción.
  const produccionPorPaq = useMemo(() => {
    const r: Record<number, number> = {};
    MEZCLA_IDS.forEach(mId => {
      const map = MEZCLA_A_PAQ[mId];
      if (!map) return;
      const s = stockActual[mId];
      const saldo = s !== undefined && s !== "" ? parseInt(s, 10) : NaN;
      const consumidas = isNaN(saldo) ? 0 : Math.max(0, dispBase[mId] - saldo);
      r[map.paqId] = (r[map.paqId] ?? 0) + consumidas * map.factor;
    });
    return r;
  }, [dispBase, stockActual]);

  // Disponible efectivo: base (stock vivo/apertura) + producción del turno (solo paquetes).
  const disponible = useMemo(() => {
    const r: Record<number, number> = {};
    TODOS_IDS.forEach(id => { r[id] = dispBase[id] + (produccionPorPaq[id] ?? 0); });
    return r;
  }, [dispBase, produccionPorPaq]);

  // Mezclas consumidas por cada mezcla (disp − saldo final): es lo que se muestra
  // en su tarjeta ("cocinadas"). Los paquetes que producen ya van al disponible
  // del paquete vía produccionPorPaq.
  const consumidasPorMezcla = useMemo(() => {
    const r: Record<number, number | null> = {};
    MEZCLA_IDS.forEach(mId => {
      const s = stockActual[mId];
      const saldo = s !== undefined && s !== "" ? parseInt(s, 10) : NaN;
      r[mId] = isNaN(saldo) ? null : Math.max(0, dispBase[mId] - saldo);
    });
    return r;
  }, [dispBase, stockActual]);

  const estVendidos = useMemo(() => {
    const r: Record<number, number | null> = {};
    TODOS_IDS.forEach(id => {
      const s = stockActual[id];
      const n = s !== undefined && s !== "" ? parseInt(s, 10) : NaN;
      r[id] = isNaN(n) ? null : Math.max(0, disponible[id] - n);
    });
    return r;
  }, [disponible, stockActual]);

  // Solo los productos con precio (paquetes/líquidos/directos) suman a la venta;
  // las mezclas son materia prima (precio 0) y solo se cuentan como saldo.
  const estTotal = useMemo(() =>
    TODOS_IDS.reduce((sum, id) => {
      const v = estVendidos[id];
      return v !== null ? sum + v * precioProd(id) : sum;
    }, 0)
  , [estVendidos]);

  // ── Cálculos de caja ──────────────────────────────────────────────────────

  // Identidades tomadas de la planilla del cliente (mismas que aplica el backend
  // al cerrar, ver calculos.servicio.ts):
  //   ventaEfectivo = totalVenta − tarjeta − transferencia
  //   esperadoCaja  = ventaEfectivo − gastos − retiros + ingresos
  //   diferencia    = efectivoContado − esperadoCaja
  //   aDepositar    = efectivoContado + retiros
  const totalGastosLibres = movimientos.filter(m => m.tipo === "gasto").reduce((s, m) => s + m.monto, 0);
  // Los retiros vienen de la BD (`cargarRetirosDesdeAPI`): los hace el
  // admin/supervisor, no el vendedor. Si no se descuentan aquí, el vendedor cuenta
  // menos efectivo del esperado y declara un faltante que no existe.
  const totalRetiros      = movimientos.filter(m => m.tipo === "retiro").reduce((s, m) => s + m.monto, 0);
  // La caja chica NO entra al cuadre (decisión del negocio): el vendedor cuenta y
  // entrega solo el efectivo de VENTAS, y ese fondo se queda en el punto. Por eso el
  // movimiento de apertura se excluye de los ingresos — está solo como referencia.
  const totalIngresos     = movimientos
    .filter(m => m.tipo === "ingreso" && m.categoria !== CATEGORIA_APERTURA)
    .reduce((s, m) => s + m.monto, 0);
  // Venta cobrada en efectivo: lo que se pagó con tarjeta o transferencia nunca
  // pasó por la caja. Es el número que el backend guarda en `venta_efectivo`.
  const ventaEfectivoPura = Math.max(0, estTotal - tarjetaNum - transferenciaNum);
  const cajaChica         = turno?.saldoInicial ?? 0;
  // esperadoCaja = el efectivo que debería estar físicamente en la caja: la venta
  // en efectivo menos lo que salió de ella (gastos y retiros), más otros ingresos.
  const esperadoCaja      = ventaEfectivoPura - totalGastosLibres - totalRetiros + totalIngresos;
  const diferencia        = efectivoNum > 0 ? efectivoNum - esperadoCaja : null;
  // A depositar = todo el efectivo de ventas contado + retiros. No se resta la caja
  // chica porque el vendedor nunca la contó: quedó aparte, en el punto.
  const aDepositar        = efectivoNum > 0 ? efectivoNum + totalRetiros : null;
  const hayFaltante       = diferencia !== null && diferencia < 0;

  // ── Stock final para cerrar ───────────────────────────────────────────────

  const stockFinalArray = useMemo(() => {
    const items: { productoId: number; cantidad: number }[] = [];
    TODOS_IDS.forEach(id => {
      const s = stockActual[id];
      if (s !== undefined && s !== "") items.push({ productoId: id, cantidad: parseInt(s, 10) || 0 });
    });
    return items;
  }, [stockActual]);

  // Detalle de ventas por producto (unidades × precio snapshot). Solo para el
  // panel admin de Cierre de turno — el vendedor nunca ve estos montos.
  const ventaDetalleArray = useMemo(() => {
    const items: { productoId: number; cantidad: number; precioUnitario: number }[] = [];
    TODOS_IDS.forEach(id => {
      const vend = estVendidos[id];
      const precio = precioProd(id);
      if (vend !== null && vend > 0 && precio > 0) {
        items.push({ productoId: id, cantidad: vend, precioUnitario: precio });
      }
    });
    return items;
  }, [estVendidos]);

  // ── Cierre ────────────────────────────────────────────────────────────────

  const ejecutarCierre = async () => {
    if (cerrando) return;
    const payload: CierrePayload = {
      efectivoContado:    efectivoNum,
      ventaEfectivo:      ventaEfectivoPura,
      ventaTarjeta:       tarjetaNum,
      ventaTransferencia: transferenciaNum,
      totalCalculado:     estTotal,
      diferenciaCaja:     diferencia ?? 0,
      stockFinal:         stockFinalArray,
      ventaDetalle:       ventaDetalleArray,
    };
    // Solo cerramos sesión si el backend confirmó la persistencia del cierre.
    // Si falla (red/servidor) NO cerramos sesión: el token y los datos siguen
    // vivos para reintentar, evitando dejar el turno ABIERTO en el servidor.
    setCerrando(true);
    const ok = await cerrarTurno(payload);
    if (!ok) setCerrando(false); // en el camino OK esta pantalla ya se desmonta
    if (ok) {
      // Cierre de sesión INMEDIATO, sin setTimeout. Con un retardo, el turno ya
      // figuraba cerrado pero la sesión seguía viva, así que LayoutPOS caía al
      // wizard de apertura y lo mostraba ~1s: además de verse mal, dejaba a la
      // vendedora a un clic de abrir un turno nuevo recién cerrado.
      // El Toaster vive en main.tsx (fuera del router), así que el aviso se ve
      // igual en la pantalla de login.
      toast.success("Turno cerrado correctamente");
      cerrarSesion();
      navigate("/login", { replace: true });
    } else {
      toast.error("No se pudo cerrar el turno", {
        description: "Revisa tu conexión e inténtalo de nuevo. No se cerró tu sesión para no perder los datos.",
      });
    }
  };

  const horaApertura = turno?.fechaApertura
    ? new Date(turno.fechaApertura).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
    : "—";

  const setSto = (id: number, v: string) =>
    setStockActual(p => ({ ...p, [id]: v.replace(/\D/g, "") }));

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-muted/30">

      {/* Header */}
      <header className="flex items-center gap-3 border-b bg-background px-4 py-3 shrink-0">
        <button onClick={abrirMenu} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted lg:hidden">
          <Menu size={22} />
        </button>
        <span className="text-base font-bold text-foreground lg:hidden">Turno Activo</span>
        <h1 className="hidden lg:block text-xl font-bold">Turno Activo</h1>
        <button
          onClick={() => { void cargarStock(); }}
          disabled={actualizandoStock}
          className="ml-auto flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          title="Actualizar stock (refleja despachos recibidos)"
        >
          <RefreshCw size={14} className={actualizandoStock ? "animate-spin" : ""} />
          Actualizar stock
        </button>
      </header>

      {/* Info strip */}
      <div className="bg-background border-b px-4 py-3 shrink-0">
        <div className="flex items-center gap-4 text-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Apertura</p>
            <p className="font-bold tabular-nums text-foreground">{horaApertura}</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Turno</p>
            <p className="font-bold text-foreground">{turno?.id ? `#${turno.id}` : "—"}</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Saldo inicio</p>
            <p className="font-bold tabular-nums text-foreground">{formatearCLP(turno?.saldoInicial ?? 0)}</p>
          </div>
        </div>
      </div>

      {/* ── ZONA DE CONTEO (scrollable) ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-4 space-y-4 pb-4">

          {/* Despachos recibidos por confirmar */}
          {despachosPendientes.map(d => (
            <div key={d.loteId} className="rounded-2xl border-2 border-amber-300 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950/40">
                  <Truck className="size-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-amber-800 dark:text-amber-300">
                    {d.solicitudId !== null ? `Llegó tu solicitud #${d.solicitudId}` : "Te llegó tu despacho"}
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                    {d.cantidadItems} producto{d.cantidadItems !== 1 ? "s" : ""} · {d.totalUnidades} unidades
                    {d.enviadoPor ? ` · por ${d.enviadoPor}` : ""}.{" "}
                    {/* El stock de un despacho ligado a solicitud entra al PDV recién
                        al confirmar; el ad-hoc ya está sumado. Decirlo al revés dejaba
                        a la vendedora contando un inventario en 0 sin entender por qué. */}
                    {d.solicitudId !== null
                      ? "Revisa y confirma para que el stock entre a tu punto."
                      : "Ya está sumado a tu stock — revisa y confirma."}
                  </p>
                  {d.items.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-amber-700 dark:text-amber-400">Ver detalle</summary>
                      <div className="mt-1.5 overflow-hidden rounded-lg border border-amber-200 dark:border-amber-800/50">
                        {/* Encabezado tipo tabla */}
                        <div className="flex justify-between gap-2 bg-amber-100/70 dark:bg-amber-950/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                          <span>Producto</span>
                          <span>Cantidad</span>
                        </div>
                        {/* Filas con separadores */}
                        <ul className="divide-y divide-amber-200/70 dark:divide-amber-800/40 text-xs text-amber-800 dark:text-amber-300">
                          {[...d.items].sort((a, b) => compararPorProductoId(a.productoId, b.productoId)).map((it) => (
                            <li key={it.productoId} className="flex justify-between gap-2 px-3 py-1.5">
                              <span className="truncate">{it.producto}</span>
                              <span className="tabular-nums font-semibold shrink-0">+{it.cantidad}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  )}
                </div>
              </div>
              <button
                onClick={() => confirmarRecepcion(d)}
                disabled={confirmandoLote === d.loteId}
                className="mt-3 w-full h-11 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2 active:scale-[.98]"
              >
                {confirmandoLote === d.loteId ? <><Loader2 size={16} className="animate-spin" /> Confirmando…</> : <><Check size={16} strokeWidth={2.5} /> Confirmar recepción</>}
              </button>
            </div>
          ))}

          {/* Aviso del último cierre preventivo del punto: retiro de efectivo y/o
              tareas dejadas al vendedor por el admin/supervisor durante su visita. */}
          {notaVendedor && !notaCerrada && (
            <div className="rounded-2xl border-2 border-sky-300 bg-sky-50 dark:border-sky-800/50 dark:bg-sky-950/20 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-950/40">
                  <AlertTriangle className="size-5 text-sky-600 dark:text-sky-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sky-800 dark:text-sky-300">Cierre preventivo</p>
                  {notaVendedor.autor && (
                    <p className="text-xs text-sky-600/80 dark:text-sky-500">
                      Realizado por {notaVendedor.autor}
                    </p>
                  )}

                  {/* Retiro de efectivo */}
                  {notaVendedor.montoRetiro > 0 && (
                    <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/40 dark:bg-red-950/20">
                      <Banknote className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                          Retiro de efectivo: {formatearCLP(notaVendedor.montoRetiro)}
                        </p>
                        <p className="text-[11px] text-red-600/80 dark:text-red-500/90">
                          Se sacó este monto de tu caja y ya está descontado de tu cuadre.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Tareas para el vendedor */}
                  {notaVendedor.notasVendedor && (
                    <div className="mt-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-sky-600 dark:text-sky-500">
                        Tareas para ti
                      </p>
                      <p className="text-sm text-sky-700 dark:text-sky-400 mt-0.5 whitespace-pre-line break-words">
                        {notaVendedor.notasVendedor}
                      </p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setNotaCerrada(true)}
                  className="shrink-0 text-sky-500 hover:text-sky-700 dark:hover:text-sky-300"
                  aria-label="Descartar aviso"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Mezclas — se cuentan por saldo final; su consumo produce paquetes.
              La tarjeta muestra las mezclas consumidas ("cocinadas"); los paquetes
              producidos van al disponible de la sección Paquetes. */}
          <StockSection
            titulo="Mezclas" colorDot="bg-amber-500" ids={MEZCLA_IDS}
            expandido={seccionExpand.mezclas} onToggle={() => toggleSeccion("mezclas")}
            disponible={disponible}
            estVendidos={estVendidos} stockActual={stockActual} setSto={setSto}
            badge={{ valores: consumidasPorMezcla, label: "cocinadas" }}
          />

          {/* Paquetes y Promos */}
          <StockSection
            titulo="Paquetes y Promos" colorDot="bg-primary" ids={PAQUETE_IDS}
            expandido={seccionExpand.paquetes} onToggle={() => toggleSeccion("paquetes")}
            disponible={disponible}
            estVendidos={estVendidos} stockActual={stockActual} setSto={setSto}
          />

          {/* Líquidos (incluye Helados terminados; la mezcla va en la sección Mezclas) */}
          <StockSection
            titulo="Líquidos" colorDot="bg-sky-500" ids={DIRECTO_IDS}
            expandido={seccionExpand.liquidos} onToggle={() => toggleSeccion("liquidos")}
            disponible={disponible}
            estVendidos={estVendidos} stockActual={stockActual} setSto={setSto}
          />

        </div>
      </div>

      {/* ── BARRA INFERIOR FIJA ── */}
      <div className="shrink-0 border-t bg-background px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {!puedeEliminar && estTotal > 0 ? (
            <p className="text-sm text-muted-foreground">Stock contado · listo para cuadrar</p>
          ) : puedeEliminar && estTotal > 0 ? (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total venta</p>
              <p className="text-xl font-black tabular-nums text-emerald-600">{formatearCLP(estTotal)}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Ingresa el saldo final de cada producto</p>
          )}
        </div>
        <button
          onClick={() => setCuadreAbierto(true)}
          className="flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow active:scale-[.97] transition-transform"
        >
          <Calculator size={18} />
          Cuadrar Caja
        </button>
      </div>

      {/* ── BOTTOM SHEET: CUADRE DE CAJA ── */}
      {cuadreAbierto && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/50"
          onClick={() => { setCuadreAbierto(false); setConfirmando(false); }}
        >
          <div
            className="w-full max-h-[92dvh] rounded-t-3xl bg-background shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-300"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle + Header */}
            <div className="shrink-0 px-5 pt-4 pb-3 border-b">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Cuadre de Caja</h2>
                  {puedeEliminar && estTotal > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">Venta calculada: {formatearCLP(estTotal)}</p>
                  )}
                </div>
                <button onClick={() => { setCuadreAbierto(false); setConfirmando(false); }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Contenido scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

              {/* Efectivo en caja */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/40">
                    <Banknote size={16} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-foreground">Efectivo</label>
                    {/* La caja chica no se cuenta (decisión del negocio): si el
                        vendedor sumara esos billetes aparecería un sobrante falso. */}
                    <p className="text-[10px] text-muted-foreground">
                      Cuenta solo la plata de las ventas
                      {cajaChica > 0 && <> — deja aparte los {formatearCLP(cajaChica)} de caja chica</>}
                    </p>
                  </div>
                </div>
                <Input
                  inputMode="numeric" placeholder="$0"
                  className="h-14 text-right text-xl font-black focus:border-emerald-500"
                  value={efectivo ? `$${efectivoNum.toLocaleString("es-CL")}` : ""}
                  onChange={e => setEfectivo(e.target.value.replace(/\D/g, ""))}
                  onFocus={e => (e.target as HTMLInputElement).select()}
                  autoFocus
                />
              </div>

              {/* Pagos sin efectivo */}
              <div className="rounded-2xl border bg-muted/30 overflow-hidden divide-y">
                {/* Tarjeta */}
                <div className="px-4 pt-3.5 pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/40">
                      <CreditCard size={15} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">Tarjeta / Débito</p>
                      <p className="text-[10px] text-muted-foreground">Se descuenta — no es efectivo físico</p>
                    </div>
                    <input type="text" inputMode="numeric" placeholder="$0"
                      value={fmtCLP(tarjeta)}
                      onChange={e => setTarjeta(e.target.value.replace(/\D/g, ""))}
                      onFocus={e => e.target.select()}
                      className="w-28 h-10 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 text-right px-3 text-sm font-bold tabular-nums text-blue-700 dark:text-blue-300 outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  {/* Boucher */}
                  <div className="mt-2">
                    {boucherUrl ? (
                      <div className="flex items-center gap-4 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-4 py-3">
                        <button onClick={() => setVerBoucher(true)}
                          className="relative shrink-0 h-20 w-20 rounded-xl overflow-hidden border-2 border-blue-300 dark:border-blue-700 shadow-md active:scale-95 transition-transform">
                          <img src={boucherUrl} alt="Boucher" className="h-full w-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
                            <ZoomIn size={22} className="text-white" />
                          </div>
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">✓ Boucher adjunto</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Toca la imagen para verla completa</p>
                          <div className="flex gap-3 mt-2">
                            <button onClick={() => fileInputRef.current?.click()}
                              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-blue-300 dark:border-blue-700 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                              <Camera size={13} /> Cambiar
                            </button>
                            <button onClick={() => { URL.revokeObjectURL(boucherUrl); setBoucherUrl(null); }}
                              className="h-8 px-3 rounded-lg border border-destructive/30 text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors">
                              Eliminar
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-3 h-12 rounded-2xl border-2 border-dashed border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/10 text-blue-600 dark:text-blue-400 text-sm font-semibold hover:bg-blue-50 dark:hover:bg-blue-950/20 active:scale-[.98] transition-all">
                        <Camera size={18} /> Adjuntar foto del boucher
                      </button>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFoto} />
                  </div>
                </div>

                {/* Transferencia */}
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-950/40">
                    <ArrowLeftRight size={15} className="text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Transferencia</p>
                    <p className="text-[10px] text-muted-foreground">Se descuenta — no es efectivo físico</p>
                  </div>
                  <input type="text" inputMode="numeric" placeholder="$0"
                    value={fmtCLP(transferencia)}
                    onChange={e => setTransferencia(e.target.value.replace(/\D/g, ""))}
                    onFocus={e => e.target.select()}
                    className="w-28 h-10 rounded-xl border-2 border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20 text-right px-3 text-sm font-bold tabular-nums text-violet-700 dark:text-violet-300 outline-none focus:border-violet-500 transition-colors"
                  />
                </div>
              </div>

              {/* Gastos y Retiros */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-foreground">Gastos y Retiros</p>
                  {puedeEliminar ? (
                    <div className="flex gap-1.5">
                      {/* Los retiros no se crean desde aquí: se registran en el panel
                          de Sucursales (Cierre de turno) y bajan solos a esta lista. */}
                      <BtnMov label="Gasto"   color="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400"           onClick={() => setModalMov("gasto")} />
                      <BtnMov label="Ingreso" color="border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400" onClick={() => setModalMov("ingreso")} />
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Solicita gastos en “Solicitudes”</span>
                  )}
                </div>

                {/* Solicitudes de gasto del vendedor (estado de autorización) */}
                {!puedeEliminar && misSolicitudes.length > 0 && (
                  <div className="mb-2 space-y-1.5">
                    {misSolicitudes.map(s => {
                      const est = s.estado === "APROBADO"
                        ? { icon: <Check size={12} strokeWidth={3} />, cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400", txt: "Aprobado" }
                        : s.estado === "RECHAZADO"
                        ? { icon: <Ban size={12} strokeWidth={2.5} />, cls: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400", txt: "Rechazado" }
                        : { icon: <Clock size={12} strokeWidth={2.5} />, cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400", txt: "Pendiente" };
                      return (
                        <div key={s.id} className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
                          <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${est.cls}`}>{est.icon}{est.txt}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{s.motivo}</p>
                            {s.comentario && <p className="truncate text-[10px] text-muted-foreground">Nota: {s.comentario}</p>}
                          </div>
                          <span className="shrink-0 tabular-nums text-sm font-bold text-foreground">{formatearCLP(s.monto)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Aviso de retiros: el vendedor no ve la escalera del cuadre (es
                    solo para admin/supervisor), así que necesita este resumen para
                    entender por qué su efectivo esperado bajó. */}
                {totalRetiros > 0 && (
                  <div className="mb-2 rounded-xl border-2 border-orange-200 bg-orange-50 px-3 py-2.5 dark:border-orange-900/50 dark:bg-orange-950/20">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-orange-700 dark:text-orange-400">
                        Se retiró efectivo de tu caja
                      </p>
                      <span className="shrink-0 tabular-nums text-sm font-extrabold text-orange-700 dark:text-orange-400">
                        −{formatearCLP(totalRetiros)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-orange-600/90 dark:text-orange-500/90">
                      Ya está descontado de tu cuadre: no lo cuentes como faltante.
                    </p>
                  </div>
                )}

                {movimientos.length === 0 ? (
                  <div className="flex h-10 items-center justify-center text-sm text-muted-foreground border border-dashed rounded-xl">
                    Sin movimientos
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {[...movimientos].reverse().map(m => {
                      const cfg = TIPO_CONFIG[m.tipo];
                      return (
                        <div key={m.id} className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-background px-3 py-2">
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{m.descripcion}</p>
                            <p className="truncate text-[10px] text-muted-foreground">
                              {m.realizadoPor ? `Registrado por ${m.realizadoPor}` : m.categoria} · {m.hora}
                            </p>
                          </div>
                          <span className={`shrink-0 tabular-nums text-sm font-bold ${cfg.text}`}>{cfg.signo}{formatearCLP(m.monto)}</span>
                          {/* Los retiros llegan desde el panel del admin: se muestran,
                              no se editan (borrarlos aquí desincronizaría el cuadre). */}
                          {puedeEliminar && !m.soloLectura && (
                            <button onClick={() => { void eliminarMovimiento(m.id); toast.info("Movimiento eliminado"); }}
                              className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-red-500 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Cuadre en tiempo real — solo visible para ADMIN/SUPERVISOR */}
              {puedeEliminar && (
                <div className="rounded-2xl border-2 bg-card overflow-hidden divide-y">
                  <FilaCuadre label="Total venta"        valor={formatearCLP(estTotal)} />
                  {tarjetaNum > 0        && <FilaCuadre label="− Tarjeta"        valor={`-${formatearCLP(tarjetaNum)}`}       claseValor="text-blue-600" />}
                  {transferenciaNum > 0  && <FilaCuadre label="− Transferencia"  valor={`-${formatearCLP(transferenciaNum)}`} claseValor="text-violet-600" />}
                  {totalGastosLibres > 0 && <FilaCuadre label="− Gastos"         valor={`-${formatearCLP(totalGastosLibres)}`} claseValor="text-red-600" />}
                  {totalRetiros > 0      && <FilaCuadre label="− Retiros"        valor={`-${formatearCLP(totalRetiros)}`}      claseValor="text-orange-600" />}
                  {totalIngresos > 0     && <FilaCuadre label="+ Ingresos"       valor={`+${formatearCLP(totalIngresos)}`}      claseValor="text-emerald-600" />}
                  {cajaChica > 0         && <FilaCuadre label="Caja chica (queda en el punto, fuera del cuadre)" valor={formatearCLP(cajaChica)} claseValor="text-muted-foreground" />}
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/40">
                    <span className="text-sm font-bold">Esperado en caja (solo ventas)</span>
                    <span className={`font-extrabold tabular-nums ${esperadoCaja >= 0 ? "text-foreground" : "text-destructive"}`}>{formatearCLP(esperadoCaja)}</span>
                  </div>
                  {efectivoNum > 0 && (
                    <>
                      <FilaCuadre label="Efectivo contado" valor={formatearCLP(efectivoNum)} claseValor="text-emerald-600" />
                      <div className={`flex items-center justify-between px-4 py-3 ${hayFaltante ? "bg-red-50 dark:bg-red-950/20" : "bg-emerald-50 dark:bg-emerald-950/20"}`}>
                        <span className={`text-sm font-bold ${hayFaltante ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                          {hayFaltante ? "Faltante" : "Sobrante"}
                        </span>
                        <span className={`text-lg font-extrabold tabular-nums ${hayFaltante ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                          {diferencia! >= 0 ? "+" : ""}{formatearCLP(diferencia!)}
                        </span>
                      </div>
                      {aDepositar !== null && (
                        <div className="flex items-center justify-between px-4 py-3 bg-primary/5">
                          <div>
                            <p className="text-sm font-bold text-foreground">A depositar</p>
                            <p className="text-[10px] text-muted-foreground">Efectivo contado + Retiros (la caja chica no se cuenta)</p>
                          </div>
                          <span className="text-lg font-extrabold tabular-nums text-primary">{formatearCLP(aDepositar)}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Alerta faltante — solo para ADMIN/SUPERVISOR */}
              {puedeEliminar && confirmando && hayFaltante && (
                <div className="rounded-2xl border-2 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-red-700 dark:text-red-400">¿Está bien contado el efectivo?</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                        Hay un faltante de {formatearCLP(Math.abs(diferencia!))}. El monto quedará registrado y reportado al supervisor.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmando(false)}
                      className="flex-1 h-10 rounded-xl border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
                      No, revisar
                    </button>
                    <button onClick={ejecutarCierre}
                      className="flex-1 h-10 rounded-xl bg-red-600 text-sm font-bold text-white hover:bg-red-700 transition-colors">
                      Sí, confirmar
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Botón cerrar turno */}
            <div className="shrink-0 border-t bg-background px-5 py-4">
              <button
                onClick={() => {
                  if (efectivoNum === 0) { toast.warning("Ingresa el efectivo en caja antes de cerrar"); return; }
                  if (puedeEliminar && hayFaltante && !confirmando) { setConfirmando(true); return; }
                  ejecutarCierre();
                }}
                disabled={efectivoNum === 0 || cerrando}
                className={`w-full h-13 py-3.5 rounded-2xl font-bold text-sm text-white transition-colors disabled:opacity-40 active:scale-[.98] ${
                  puedeEliminar && hayFaltante && confirmando ? "bg-red-600 hover:bg-red-700" : puedeEliminar && hayFaltante ? "bg-red-500 hover:bg-red-600" : "bg-primary hover:bg-primary/90"
                }`}
              >
                {cerrando ? "Cerrando…" : efectivoNum === 0 ? "Ingresa el efectivo para cerrar" : puedeEliminar && hayFaltante ? "Cerrar con faltante →" : "Cerrar Turno"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal boucher grande */}
      {verBoucher && boucherUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setVerBoucher(false)}>
          <div className="relative max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <img src={boucherUrl} alt="Boucher tarjeta" className="w-full rounded-2xl shadow-2xl" />
            <button onClick={() => setVerBoucher(false)} className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-background border shadow">
              <X size={16} />
            </button>
            <p className="text-center text-xs text-white/70 mt-3">Toca fuera para cerrar</p>
          </div>
        </div>
      )}

      {/* Modal gasto/retiro/ingreso */}
      {modalMov && (
        <ModalMovimiento
          tipo={modalMov}
          onCerrar={() => setModalMov(null)}
          onGuardar={mov => {
            void agregarMovimiento(mov);
            toast.success(`${TIPO_CONFIG[mov.tipo].label} registrado`, { description: `${mov.descripcion} · ${formatearCLP(mov.monto)}` });
          }}
        />
      )}
    </div>
  );
}

// ─── ModalMovimiento ─────────────────────────────────────────────────────────

function ModalMovimiento({ tipo, onCerrar, onGuardar }: {
  tipo: TipoMovCreable
  onCerrar: () => void
  onGuardar: (mov: Omit<MovimientoCaja, "id" | "hora">) => void
}) {
  const cfg = TIPO_CONFIG[tipo];
  const [desc,  setDesc]  = useState("");
  const [cat,   setCat]   = useState(tipo === "gasto" ? CATEGORIAS_GASTO[0] : "Ingreso manual");
  const [monto, setMonto] = useState("");
  const [errores, setErrores] = useState<{ descripcion?: string; monto?: string }>({});

  const guardar = () => {
    const m = parseInt(monto.replace(/\D/g, ""), 10) || 0;
    const result = movimientoCajaSchema.safeParse({ descripcion: desc.trim(), monto: m, categoria: cat });
    if (!result.success) {
      const flat = result.error.flatten().fieldErrors;
      setErrores({ descripcion: flat.descripcion?.[0], monto: flat.monto?.[0] });
      return;
    }
    setErrores({});
    onGuardar({ tipo, descripcion: result.data.descripcion, categoria: result.data.categoria ?? cat, monto: result.data.monto });
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-0 sm:px-4" onClick={onCerrar}>
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border bg-background shadow-2xl flex flex-col max-h-[85dvh]" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-base font-bold">Nuevo {cfg.label}</h3>
          <button onClick={onCerrar} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-4 px-5 py-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Descripción</label>
            <Input placeholder={tipo === "gasto" ? "Ej: Bolsa de plástico" : "Ej: Ingreso adicional"}
              value={desc} onChange={e => { setDesc(e.target.value); setErrores(p => ({ ...p, descripcion: undefined })); }}
              className={errores.descripcion ? "border-destructive" : ""} autoFocus />
            {errores.descripcion && <p className="text-xs text-destructive">{errores.descripcion}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Categoría</label>
            {tipo === "gasto" ? (
              <select value={cat} onChange={e => setCat(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                {CATEGORIAS_GASTO.map(c => <option key={c}>{c}</option>)}
              </select>
            ) : (
              <Input value={cat} onChange={e => setCat(e.target.value)} />
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Monto (CLP)</label>
            <Input inputMode="numeric" placeholder="$0"
              value={monto ? `$${parseInt(monto.replace(/\D/g, "") || "0", 10).toLocaleString("es-CL")}` : ""}
              onChange={e => { setMonto(e.target.value.replace(/\D/g, "")); setErrores(p => ({ ...p, monto: undefined })); }}
              onFocus={e => e.target.select()}
              className={errores.monto ? "border-destructive" : ""} />
            {errores.monto && <p className="text-xs text-destructive">{errores.monto}</p>}
          </div>
        </div>
        <div className="shrink-0 flex gap-3 border-t bg-background px-5 py-4">
          <button onClick={onCerrar} className="flex-1 h-11 rounded-xl border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancelar</button>
          <button onClick={guardar}
            className={`flex-1 h-11 rounded-xl text-sm font-bold text-white transition-colors ${tipo === "ingreso" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-500 hover:bg-red-600"}`}>
            Registrar {cfg.label}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function BtnMov({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1 h-8 px-2.5 rounded-lg border text-xs font-semibold transition-colors ${color}`}>
      <Plus size={13} strokeWidth={2.5} /> {label}
    </button>
  );
}

function FilaCuadre({ label, valor, claseValor = "text-foreground" }: { label: string; valor: string; claseValor?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${claseValor}`}>{valor}</span>
    </div>
  );
}

// ─── StockSection ─────────────────────────────────────────────────────────────

interface StockSectionProps {
  titulo: string; colorDot: string; ids: number[];
  expandido: boolean; onToggle: () => void;
  disponible: Record<number, number>;
  estVendidos: Record<number, number | null>; stockActual: Record<number, string>;
  setSto: (id: number, v: string) => void;
  // Badge alternativo al de "vendidos" (ej: mezclas muestran paquetes producidos).
  badge?: { valores: Record<number, number | null>; label: string };
}

function StockSection({ titulo, colorDot, ids, expandido, onToggle, disponible, estVendidos, stockActual, setSto, badge }: StockSectionProps) {
  return (
    <div className="rounded-2xl bg-background border overflow-hidden shadow-sm">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3.5 border-b">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${colorDot}`} />
          <span className="text-sm font-bold uppercase tracking-wide text-foreground">{titulo}</span>
        </div>
        {expandido ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>

      {expandido && (
        <div className="divide-y">
          {ids.map(id => {
            const disp   = disponible[id];
            const vend   = estVendidos[id];
            const valNum  = stockActual[id] !== "" ? parseInt(stockActual[id], 10) : NaN;
            const sobrestock = !isNaN(valNum) && valNum > disp;
            // Badge: por defecto "vendidos"; las mezclas muestran paquetes producidos.
            const badgeVal   = badge ? (badge.valores[id] ?? null) : vend;
            const badgeLabel = badge ? badge.label : "vendidos";

            return (
              <div key={id} className="px-4 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-foreground">{nomProd(id)}</p>
                  {sobrestock ? (
                    <p className="text-xs font-semibold text-red-600">máx {disp}</p>
                  ) : (
                    <p className="text-xs font-semibold text-muted-foreground">{disp} disp.</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Saldo final</p>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0"
                      value={stockActual[id] ?? ""}
                      onChange={e => setSto(id, e.target.value)}
                      onFocus={e => e.target.select()}
                      className={`h-14 w-full rounded-xl border-2 bg-muted/30 text-center text-2xl font-black tabular-nums outline-none transition-colors ${
                        sobrestock ? "border-red-500 bg-red-50 dark:bg-red-950/20 focus:border-red-500" : "border-border focus:border-primary focus:bg-background"
                      }`}
                    />
                    {sobrestock && <p className="text-xs font-semibold text-red-600">⚠ Máx: {disp}</p>}
                  </div>
                  <div className={`shrink-0 w-24 rounded-xl px-2 py-2 text-center ${sobrestock ? "bg-red-50 dark:bg-red-950/20" : badgeVal !== null ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-muted/40"}`}>
                    <p className={`text-3xl font-black tabular-nums leading-none ${sobrestock ? "text-red-600" : badgeVal !== null ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                      {sobrestock ? "!" : badgeVal !== null ? badgeVal : "—"}
                    </p>
                    <p className={`text-[10px] font-semibold uppercase mt-1 ${sobrestock ? "text-red-600" : badgeVal !== null ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                      {sobrestock ? "error" : badgeLabel}
                    </p>
                    </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
