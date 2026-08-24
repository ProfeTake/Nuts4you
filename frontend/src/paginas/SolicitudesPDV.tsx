// Página: Solicitudes de Insumos
//
// VENDEDOR:    Ve sus solicitudes activas + puede crear nuevas + confirma recepción.
// BODEGUERO:   Ve TODAS las solicitudes de todas las sucursales + puede despachar.
// ADMIN/SUPER: Igual que BODEGUERO (visibilidad total).

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Menu, Plus, Minus, Search, X, PackageCheck, Truck, Clock, CheckCircle2, ChevronDown, ChevronUp, Receipt, Check, Ban } from "lucide-react";
import { useMenuNav } from "@/componentes/layout/contexto-menu";
import { useAuthStore } from "@/store/auth.store";
import { useCajaStore } from "@/store/caja.store";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { formatearCLP } from "@/lib/money";
import { compararProductos } from "@/lib/categorias";
import { ModalSolicitarGasto } from "@/componentes/pos/ModalSolicitarGasto";
import { ModalDespacharSolicitud } from "@/componentes/solicitudes/ModalDespacharSolicitud";
import { productosMock, categoriasMock } from "@/datos/mock.datos";
import type { Solicitud, EstadoSolicitud } from "@/tipos/pos.tipos";

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

// ─── API helpers ─────────────────────────────────────────────────────────────

const fetchSolicitudes = () =>
  apiGet<{ data: Solicitud[] }>("/solicitudes").then(r => r.data)

const crearSolicitud = (body: { pdvId: number; items: { productoId: number; cantidad: number }[]; notas?: string }) =>
  apiPost<{ data: Solicitud }>("/solicitudes", body).then(r => r.data)

// El despacho no se dispara directo: abre ModalDespacharSolicitud, porque mueve
// stock real y el bodeguero debe declarar las cantidades que envía (A15).

const confirmarSolicitud = (id: number) =>
  apiPatch<{ data: Solicitud }>(`/solicitudes/${id}/confirmar`, {}).then(r => r.data)

const rechazarSolicitud = (id: number, motivo?: string) =>
  apiPatch<{ data: Solicitud }>(`/solicitudes/${id}/rechazar`, motivo ? { motivo } : {}).then(r => r.data)

// ─── Chips de estado ─────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<EstadoSolicitud, { label: string; clases: string; icono: React.ReactNode }> = {
  PENDIENTE:  { label: "Pendiente",  clases: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",   icono: <Clock size={12} /> },
  DESPACHADA: { label: "Despachada", clases: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",       icono: <Truck size={12} /> },
  CONFIRMADA: { label: "Confirmada", clases: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400", icono: <CheckCircle2 size={12} /> },
  RECHAZADA:  { label: "Rechazada",  clases: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",           icono: <Ban size={12} /> },
}

function ChipEstado({ estado }: { estado: EstadoSolicitud }) {
  const cfg = ESTADO_CONFIG[estado]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.clases}`}>
      {cfg.icono} {cfg.label}
    </span>
  )
}

// ─── Card de solicitud ───────────────────────────────────────────────────────

function CardSolicitud({
  sol,
  rol,
  onDespachar,
  onConfirmar,
  onRechazar,
}: {
  sol: Solicitud
  rol: string
  onDespachar: (sol: Solicitud) => void
  onConfirmar: (id: number) => void
  onRechazar: (id: number, motivo?: string) => void
}) {
  const esAutorizador  = rol === "BODEGUERO" || rol === "ADMIN" || rol === "SUPERVISOR"
  const puedeDespachar = esAutorizador && sol.estado === "PENDIENTE"
  const puedeRechazar  = esAutorizador && sol.estado === "PENDIENTE"
  const puedeConfirmar = rol === "VENDEDOR" && sol.estado === "DESPACHADA"

  // Las tarjetas accionables arrancan abiertas: el botón vive dentro del detalle,
  // así que colapsadas escondían la única forma de confirmar la recepción (y sin
  // confirmar el stock no entra al punto).
  const [expandida, setExpandida] = useState(puedeConfirmar || puedeDespachar)
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState("")

  const confirmarRechazo = () => {
    onRechazar(sol.id, motivo.trim() || undefined)
    setRechazando(false)
    setMotivo("")
  }
  const cancelarRechazo = () => {
    setRechazando(false)
    setMotivo("")
  }
  const fecha = new Date(sol.fecha).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })

  return (
    <div className={`rounded-2xl border bg-background overflow-hidden shadow-sm ${
      sol.estado === "PENDIENTE" ? "border-amber-300 dark:border-amber-700"
      : sol.estado === "DESPACHADA" ? "border-blue-300 dark:border-blue-700"
      : sol.estado === "RECHAZADA" ? "border-red-300 dark:border-red-800"
      : "border-border"
    }`}>
      {/* Cabecera */}
      <button
        onClick={() => setExpandida(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <ChipEstado estado={sol.estado as EstadoSolicitud} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {rol !== "VENDEDOR" ? sol.pdvNombre : `Solicitud #${sol.id}`}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {rol !== "VENDEDOR" ? `${sol.solicitante} · ` : ""}{fecha}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-xs text-muted-foreground font-medium">{sol.items.length} producto{sol.items.length !== 1 ? "s" : ""}</span>
          {expandida ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
        </div>
      </button>

      {/* Detalle expandido */}
      {expandida && (
        <div className="border-t px-4 py-3 space-y-3">
          {/* Items — mismo orden que el Turno Activo (Mezclas → Paquetes → Líquidos) */}
          <div className="space-y-1.5">
            {[...sol.items].sort(compararProductos).map(it => (
              <div key={it.id} className="flex items-center justify-between text-sm">
                <span className="text-foreground font-medium">{it.producto}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{it.categoria}</span>
                  <span className="font-bold text-foreground tabular-nums bg-muted/60 rounded-md px-2 py-0.5 text-xs">×{it.cantidad}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Notas */}
          {sol.notas && (
            <div className="rounded-xl bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground"><span className="font-semibold">Nota:</span> {sol.notas}</p>
            </div>
          )}

          {/* Motivo de rechazo (visible para todos cuando la solicitud fue rechazada) */}
          {sol.estado === "RECHAZADA" && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3 py-2">
              <p className="text-xs text-red-700 dark:text-red-400">
                <span className="font-semibold">Rechazada</span>
                {sol.motivoRechazo ? <>: {sol.motivoRechazo}</> : " (sin motivo indicado)"}
              </p>
            </div>
          )}

          {/* Despacho: lo que el bodeguero realmente envió + su nota (A15).
              El vendedor ve si le enviaron menos de lo pedido y por qué. */}
          {sol.despachos.length > 0 && (() => {
            const d = sol.despachos[0]  // el más reciente
            const pedidoPorId = new Map(sol.items.map(it => [it.productoId, it.cantidad]))
            // Diferido: mientras la solicitud está DESPACHADA el stock va "en camino"
            // (aún NO sumado al PDV); al confirmar (CONFIRMADA) queda "recibido".
            const enCamino = sol.estado === "DESPACHADA"
            return (
              <div className={`rounded-xl border px-3 py-2.5 space-y-2 ${
                enCamino
                  ? "border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20"
                  : "border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20"
              }`}>
                <p className={`flex items-center gap-1.5 text-xs font-semibold ${
                  enCamino ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"
                }`}>
                  <Truck size={13} />
                  {enCamino
                    ? `En camino: ${d.totalUnidades} unid. — aún no sumado a tu stock`
                    : `Recibido: ${d.totalUnidades} unid.`}
                  {d.enviadoPor ? ` · ${d.enviadoPor}` : ""}
                </p>
                <div className="space-y-1">
                  {d.items.map(it => {
                    const pedido  = pedidoPorId.get(it.productoId)
                    const parcial = pedido != null && it.cantidad < pedido
                    return (
                      <div key={it.productoId} className="flex items-center justify-between text-xs">
                        <span className="text-foreground">{it.producto}</span>
                        <span className={`tabular-nums font-semibold ${parcial ? "text-amber-600" : "text-foreground"}`}>
                          {it.cantidad}{parcial && pedido != null ? ` de ${pedido}` : ""}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {d.observacion && (
                  <p className="border-t border-border/60 pt-2 text-xs text-foreground/80">
                    <span className="font-semibold">Nota del bodeguero:</span> {d.observacion}
                  </p>
                )}
              </div>
            )
          })()}

          {/* Acciones — despachar / rechazar (modo botones) */}
          {(puedeDespachar || puedeRechazar) && !rechazando && (
            <div className="flex gap-2">
              {puedeDespachar && (
                <button
                  onClick={() => onDespachar(sol)}
                  className="flex-1 h-10 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Truck size={16} /> Despachar
                </button>
              )}
              {puedeRechazar && (
                <button
                  onClick={() => setRechazando(true)}
                  className="flex-1 h-10 rounded-xl border border-red-300 dark:border-red-800 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex items-center justify-center gap-2"
                >
                  <Ban size={16} /> Rechazar
                </button>
              )}
            </div>
          )}

          {/* Rechazo con motivo inline (reemplaza el prompt del navegador) */}
          {puedeRechazar && rechazando && (
            <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-3 space-y-2">
              <label className="text-xs font-semibold text-red-700 dark:text-red-400">
                Motivo del rechazo (opcional)
              </label>
              <textarea
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Ej: no hay stock disponible, pedido duplicado…"
                rows={2}
                maxLength={200}
                autoFocus
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-300 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={cancelarRechazo}
                  className="flex-1 h-9 rounded-lg border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarRechazo}
                  className="flex-1 h-9 rounded-lg bg-red-600 text-sm font-bold text-white hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Ban size={15} /> Confirmar rechazo
                </button>
              </div>
            </div>
          )}

          {puedeConfirmar && (
            <div className="space-y-2">
              <p className="rounded-lg bg-emerald-50/70 dark:bg-emerald-950/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                Revisa arriba que llegó todo lo que ves en el despacho y, si está correcto, <span className="font-semibold">confirma la recepción</span> para cerrar el pedido.
              </p>
              <button
                onClick={() => onConfirmar(sol.id)}
                className="w-full h-10 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
              >
                <PackageCheck size={16} /> Confirmar Recepción
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Modal: Nueva solicitud ──────────────────────────────────────────────────
// Lista completa de productos por categoría con stepper +/− por producto: la
// vendedora solo toca lo que necesita (sin ir agregando fila por fila). Pensada
// para smartphone: botones grandes, bottom-sheet y buscador para filtrar rápido.

function StepperCantidad({ valor, onCambio }: { valor: number; onCambio: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        onClick={() => onCambio(Math.max(0, valor - 1))}
        disabled={valor === 0}
        aria-label="Restar"
        className="flex h-9 w-9 items-center justify-center rounded-lg border text-foreground disabled:opacity-30 active:scale-95 transition-transform hover:bg-muted"
      >
        <Minus size={16} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={valor === 0 ? "" : String(valor)}
        placeholder="0"
        onChange={e => {
          const n = parseInt(e.target.value.replace(/\D/g, ""), 10)
          onCambio(isNaN(n) ? 0 : Math.min(n, 999))
        }}
        onFocus={e => e.target.select()}
        className={`w-11 h-9 rounded-lg border text-center text-sm font-bold tabular-nums outline-none focus:ring-2 focus:ring-ring ${
          valor > 0 ? "border-primary/50 text-primary" : "border-input text-muted-foreground"
        }`}
      />
      <button
        onClick={() => onCambio(valor + 1)}
        aria-label="Sumar"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/40 text-primary active:scale-95 transition-transform hover:bg-primary/10"
      >
        <Plus size={16} />
      </button>
    </div>
  )
}

function ModalNuevaSolicitud({
  onCerrar,
  onGuardar,
}: {
  onCerrar: () => void
  onGuardar: (items: { productoId: number; cantidad: number }[], notas: string) => void
}) {
  // Cantidad por producto (productoId → cantidad). 0 = no pedido.
  const [cantidades, setCantidades] = useState<Record<number, number>>({})
  const [notas, setNotas] = useState("")
  const [busqueda, setBusqueda] = useState("")

  const setCantidad = (id: number, n: number) =>
    setCantidades(p => ({ ...p, [id]: Math.max(0, n) }))

  const seleccionados = Object.entries(cantidades).filter(([, c]) => c > 0)
  const totalProductos = seleccionados.length
  const totalUnidades  = seleccionados.reduce((s, [, c]) => s + c, 0)

  const handleGuardar = () => {
    const items = seleccionados.map(([id, cantidad]) => ({ productoId: Number(id), cantidad }))
    if (items.length === 0) return
    onGuardar(items, notas.trim())
  }

  // Productos por categoría, filtrados por el buscador.
  const q = busqueda.trim().toLowerCase()
  const grupos = categoriasMock.map(cat => ({
    categoria: cat.nombre,
    productos: productosMock
      .filter(p => p.categoriaId === cat.id && p.activo)
      .filter(p => !q || p.nombre.toLowerCase().includes(q)),
  })).filter(g => g.productos.length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-0 sm:px-4" onClick={onCerrar}>
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-background border shadow-2xl max-h-[92dvh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="shrink-0 border-b px-4 py-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold">Nueva Solicitud</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Toca + en lo que necesites de bodega</p>
            </div>
            <button onClick={onCerrar} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
              <X size={18} />
            </button>
          </div>
          {/* Buscador */}
          <div className="relative mt-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar producto…"
              className="w-full h-10 rounded-xl border border-input bg-muted/30 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Lista de productos por categoría */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {grupos.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Sin resultados para "{busqueda}"</p>
          ) : grupos.map(g => (
            <div key={g.categoria} className="mb-4 last:mb-0">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{g.categoria}</p>
              <div className="rounded-xl border divide-y overflow-hidden">
                {g.productos.map(p => {
                  const cant = cantidades[p.id] ?? 0
                  return (
                    <div key={p.id} className={`flex items-center justify-between gap-3 px-3 py-2 ${cant > 0 ? "bg-primary/5" : ""}`}>
                      <span className={`text-sm truncate ${cant > 0 ? "font-semibold text-foreground" : "font-medium text-foreground"}`}>
                        {p.nombre}
                      </span>
                      <StepperCantidad valor={cant} onCambio={n => setCantidad(p.id, n)} />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Notas */}
          <div className="space-y-1.5 pt-1 pb-1">
            <label className="text-sm font-medium text-foreground">Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Ej: urgente, falta MM para cocinar…"
              rows={2}
              maxLength={500}
              className="w-full rounded-xl border border-input bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
        </div>

        {/* Footer con resumen + acción */}
        <div className="shrink-0 border-t bg-background px-4 py-3 space-y-2">
          <p className="text-center text-xs text-muted-foreground">
            {totalProductos === 0
              ? "Aún no seleccionas productos"
              : <><b className="text-foreground">{totalProductos}</b> producto{totalProductos !== 1 ? "s" : ""} · <b className="text-foreground">{totalUnidades}</b> unidad{totalUnidades !== 1 ? "es" : ""}</>}
          </p>
          <div className="flex gap-3">
            <button onClick={onCerrar} className="flex-1 h-11 rounded-xl border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleGuardar}
              disabled={totalProductos === 0}
              className="flex-[1.5] h-11 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              Enviar solicitud
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Lista de gastos (vendedor) ──────────────────────────────────────────────

const GASTO_ESTADO: Record<MiSolicitudGasto["estado"], { label: string; clases: string; borde: string; icono: React.ReactNode }> = {
  PENDIENTE: { label: "Pendiente", clases: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",         borde: "border-amber-300 dark:border-amber-700",   icono: <Clock size={12} /> },
  APROBADO:  { label: "Aprobado",  clases: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400", borde: "border-emerald-300 dark:border-emerald-700", icono: <Check size={12} strokeWidth={3} /> },
  RECHAZADO: { label: "Rechazado", clases: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",                 borde: "border-red-300 dark:border-red-800",       icono: <Ban size={12} /> },
}

function ListaGastos({ gastos, isLoading, turnoActivo }: {
  gastos: MiSolicitudGasto[]
  isLoading: boolean
  turnoActivo: boolean
}) {
  if (!turnoActivo) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Receipt size={24} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Necesitas un turno activo para solicitar gastos</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-8">
      {/* Nota informativa del flujo */}
      <div className="rounded-xl border border-dashed bg-muted/30 px-3 py-2.5">
        <p className="text-xs text-muted-foreground">
          Los gastos que solicites quedan <strong>pendientes</strong> hasta que un supervisor o administrador los apruebe.
          Al aprobarse, el gasto se descuenta automáticamente en el cierre de tu caja.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-20 rounded-2xl bg-muted/60 animate-pulse" />)}
        </div>
      ) : gastos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Receipt size={24} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No has solicitado gastos en este turno</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Usa el botón <strong>Solicitar gasto</strong> para pedir autorización (monto, motivo y foto del boucher).
          </p>
        </div>
      ) : (
        gastos.map(g => {
          const est = GASTO_ESTADO[g.estado]
          const fecha = new Date(g.creadoEn).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
          return (
            <div key={g.id} className={`rounded-2xl border bg-background p-4 shadow-sm ${est.borde}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold tabular-nums text-foreground">{formatearCLP(g.monto)}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${est.clases}`}>
                  {est.icono} {est.label}
                </span>
                {g.categoria && (
                  <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{g.categoria}</span>
                )}
              </div>
              <p className="text-sm text-foreground mt-1.5">{g.motivo}</p>
              <p className="text-xs text-muted-foreground mt-1">{fecha}</p>
              {g.comentario && (
                <p className="text-xs text-muted-foreground mt-1 italic">Nota: {g.comentario}</p>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SolicitudesPDV() {
  const { abrirMenu } = useMenuNav()
  const qc = useQueryClient()
  const usuario = useAuthStore(s => s.usuario)
  const pdv     = useAuthStore(s => s.pdv)
  const turno   = useCajaStore(s => s.turno)
  const rol     = usuario?.rol ?? "VENDEDOR"
  // PDV activo: turno actual (vendedores rotativos) o PDV del perfil (fijo)
  const pdvActualId = turno?.pdvId ?? pdv?.id ?? null

  const [tab, setTab] = useState<"insumos" | "gastos">("insumos")
  const [modalAbierto, setModalAbierto] = useState(false)
  // Solicitud que se está despachando (bodeguero): abre el modal de cantidades.
  const [despachando, setDespachando] = useState<Solicitud | null>(null)
  const [modalGastoAbierto, setModalGastoAbierto] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState<EstadoSolicitud | "TODAS">("TODAS")

  const esVendedor = rol === "VENDEDOR"
  const enGastos   = esVendedor && tab === "gastos"

  const { data: solicitudes = [], isLoading } = useQuery({
    queryKey: ["solicitudes"],
    queryFn:  fetchSolicitudes,
    refetchInterval: 30_000,
  })

  // Solicitudes de gasto del turno actual (para la pestaña "Gastos" del vendedor).
  const { data: gastos = [], isLoading: cargandoGastos } = useQuery({
    queryKey: ["solicitudes-gasto-turno", turno?.id],
    queryFn:  () => apiGet<{ data: MiSolicitudGasto[] }>(`/solicitudes-gasto/turno/${turno!.id}`).then(r => r.data),
    enabled:  esVendedor && !!turno?.id,
    refetchInterval: 20_000,
  })
  const gastosPendientes = gastos.filter(g => g.estado === "PENDIENTE").length

  const mutCrear = useMutation({
    mutationFn: (vars: { items: { productoId: number; cantidad: number }[]; notas: string }) => {
      if (!pdvActualId) return Promise.reject(new Error("No tienes un turno activo para solicitar insumos"))
      return crearSolicitud({ pdvId: pdvActualId, items: vars.items, notas: vars.notas || undefined })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solicitudes"] })
      toast.success("Solicitud enviada a bodega")
      setModalAbierto(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const mutConfirmar = useMutation({
    mutationFn: confirmarSolicitud,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solicitudes"] })
      toast.success("Recepción confirmada")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const mutRechazar = useMutation({
    mutationFn: (vars: { id: number; motivo?: string }) => rechazarSolicitud(vars.id, vars.motivo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solicitudes"] })
      toast.success("Solicitud rechazada")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const filtradas = filtroEstado === "TODAS"
    ? solicitudes
    : solicitudes.filter(s => s.estado === filtroEstado)

  const pendientes  = solicitudes.filter(s => s.estado === "PENDIENTE").length
  const despachadas = solicitudes.filter(s => s.estado === "DESPACHADA").length

  return (
    <div className="flex h-full flex-col bg-muted/30">

      {/* Header */}
      <header className="flex items-center justify-between border-b bg-background px-4 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={abrirMenu}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted lg:hidden"
          >
            <Menu size={22} />
          </button>
          <div>
            <h1 className="text-base font-bold text-foreground lg:text-xl">Solicitudes</h1>
            {rol !== "VENDEDOR" && (
              <p className="text-xs text-muted-foreground hidden lg:block">Todas las sucursales</p>
            )}
          </div>
        </div>

        {/* Indicadores rápidos + acción según pestaña */}
        <div className="flex items-center gap-2">
          {!enGastos && pendientes > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500 px-2 text-xs font-bold text-white">
              {pendientes}
            </span>
          )}
          {!enGastos && despachadas > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-500 px-2 text-xs font-bold text-white">
              {despachadas}
            </span>
          )}
          {enGastos ? (
            turno && (
              <button
                onClick={() => setModalGastoAbierto(true)}
                className="flex items-center gap-1.5 h-9 rounded-xl bg-red-500 px-3 text-sm font-bold text-white hover:bg-red-600 transition-colors"
              >
                <Receipt size={16} /> Solicitar gasto
              </button>
            )
          ) : (
            (rol === "VENDEDOR" || rol === "BODEGUERO") && turno && (
              <button
                onClick={() => setModalAbierto(true)}
                className="flex items-center gap-1.5 h-9 rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus size={16} /> Nueva
              </button>
            )
          )}
        </div>
      </header>

      {/* Pestañas Insumos / Gastos (solo vendedor) */}
      {esVendedor && (
        <div className="shrink-0 flex gap-2 px-4 pt-3 pb-2 bg-background">
          {([
            { k: "insumos", label: "Insumos", icono: <PackageCheck size={14} /> },
            { k: "gastos",  label: "Gastos",  icono: <Receipt size={14} /> },
          ] as const).map(t => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
                tab === t.k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {t.icono} {t.label}
              {t.k === "gastos" && gastosPendientes > 0 && (
                <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
                  {gastosPendientes}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {enGastos ? (
        <ListaGastos gastos={gastos} isLoading={cargandoGastos} turnoActivo={!!turno} />
      ) : (
        <>
      {/* Filtros */}
      <div className="shrink-0 flex gap-2 overflow-x-auto px-4 py-3 bg-background border-b scrollbar-none">
        {(["TODAS", "PENDIENTE", "DESPACHADA", "CONFIRMADA", "RECHAZADA"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFiltroEstado(f)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filtroEstado === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f === "TODAS" ? "Todas" : ESTADO_CONFIG[f].label}
            {f !== "TODAS" && (
              <span className="ml-1.5 tabular-nums">
                ({solicitudes.filter(s => s.estado === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-8">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-2xl bg-muted/60 animate-pulse" />
            ))}
          </div>
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <PackageCheck size={24} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {filtroEstado === "TODAS" ? "No hay solicitudes aún" : `No hay solicitudes ${ESTADO_CONFIG[filtroEstado as EstadoSolicitud]?.label.toLowerCase()}`}
            </p>
            {rol === "VENDEDOR" && filtroEstado === "TODAS" && (
              <p className="text-xs text-muted-foreground max-w-xs">
                Usa el botón <strong>+ Nueva</strong> para pedir mezclas, bebidas u otros insumos a la bodega central.
              </p>
            )}
          </div>
        ) : (
          filtradas.map(sol => (
            <CardSolicitud
              key={sol.id}
              sol={sol}
              rol={rol}
              onDespachar={setDespachando}
              onConfirmar={id => mutConfirmar.mutate(id)}
              onRechazar={(id, motivo) => mutRechazar.mutate({ id, motivo })}
            />
          ))
        )}
      </div>
        </>
      )}

      {/* Modal de despacho (bodeguero): declara las cantidades que salen de bodega */}
      {despachando && (
        <ModalDespacharSolicitud
          solicitud={despachando}
          onCerrar={() => setDespachando(null)}
        />
      )}

      {/* Modal nueva solicitud de insumos */}
      {modalAbierto && pdv && (
        <ModalNuevaSolicitud
          onCerrar={() => setModalAbierto(false)}
          onGuardar={(items, notas) => mutCrear.mutate({ items, notas })}
        />
      )}

      {/* Modal solicitar gasto */}
      {modalGastoAbierto && turno?.id && (
        <ModalSolicitarGasto
          turnoId={turno.id}
          onCerrar={() => setModalGastoAbierto(false)}
          onEnviado={() => qc.invalidateQueries({ queryKey: ["solicitudes-gasto-turno"] })}
        />
      )}
    </div>
  )
}
