// Página: Solicitudes de Insumos
//
// VENDEDOR:    Ve sus solicitudes activas + puede crear nuevas + confirma recepción.
// BODEGUERO:   Ve TODAS las solicitudes de todas las sucursales + puede despachar.
// ADMIN/SUPER: Igual que BODEGUERO (visibilidad total).

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Menu, Plus, X, PackageCheck, Truck, Clock, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { useMenuNav } from "@/componentes/layout/BarraLateral";
import { useAuthStore } from "@/store/auth.store";
import { useCajaStore } from "@/store/caja.store";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { productosMock, categoriasMock } from "@/datos/mock.datos";
import type { Solicitud, EstadoSolicitud } from "@/tipos/pos.tipos";

// ─── API helpers ─────────────────────────────────────────────────────────────

const fetchSolicitudes = () =>
  apiGet<{ data: Solicitud[] }>("/solicitudes").then(r => r.data)

const crearSolicitud = (body: { pdvId: number; items: { productoId: number; cantidad: number }[]; notas?: string }) =>
  apiPost<{ data: Solicitud }>("/solicitudes", body).then(r => r.data)

const despacharSolicitud = (id: number) =>
  apiPatch<{ data: Solicitud }>(`/solicitudes/${id}/despachar`, {}).then(r => r.data)

const confirmarSolicitud = (id: number) =>
  apiPatch<{ data: Solicitud }>(`/solicitudes/${id}/confirmar`, {}).then(r => r.data)

// ─── Chips de estado ─────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<EstadoSolicitud, { label: string; clases: string; icono: React.ReactNode }> = {
  PENDIENTE:  { label: "Pendiente",  clases: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",   icono: <Clock size={12} /> },
  DESPACHADA: { label: "Despachada", clases: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",       icono: <Truck size={12} /> },
  CONFIRMADA: { label: "Confirmada", clases: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400", icono: <CheckCircle2 size={12} /> },
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
}: {
  sol: Solicitud
  rol: string
  onDespachar: (id: number) => void
  onConfirmar: (id: number) => void
}) {
  const [expandida, setExpandida] = useState(false)
  const puedeDespachar = (rol === "BODEGUERO" || rol === "ADMIN" || rol === "SUPERVISOR") && sol.estado === "PENDIENTE"
  const puedeConfirmar = rol === "VENDEDOR" && sol.estado === "DESPACHADA"
  const fecha = new Date(sol.fecha).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })

  return (
    <div className={`rounded-2xl border bg-background overflow-hidden shadow-sm ${
      sol.estado === "PENDIENTE" ? "border-amber-300 dark:border-amber-700"
      : sol.estado === "DESPACHADA" ? "border-blue-300 dark:border-blue-700"
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
          {/* Items */}
          <div className="space-y-1.5">
            {sol.items.map(it => (
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

          {/* Acciones */}
          {puedeDespachar && (
            <button
              onClick={() => onDespachar(sol.id)}
              className="w-full h-10 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <Truck size={16} /> Marcar como Despachada
            </button>
          )}
          {puedeConfirmar && (
            <button
              onClick={() => onConfirmar(sol.id)}
              className="w-full h-10 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
            >
              <PackageCheck size={16} /> Confirmar Recepción
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Modal: Nueva solicitud ──────────────────────────────────────────────────

interface ItemForm { productoId: number; cantidad: number; cantidadStr: string }

function ModalNuevaSolicitud({
  onCerrar,
  onGuardar,
}: {
  onCerrar: () => void
  onGuardar: (items: ItemForm[], notas: string) => void
}) {

  const [items, setItems] = useState<ItemForm[]>([{ productoId: productosMock[0].id, cantidad: 1, cantidadStr: "1" }])
  const [notas, setNotas] = useState("")

  const agregarItem = () => setItems(p => [...p, { productoId: productosMock[0].id, cantidad: 1, cantidadStr: "1" }])
  const quitarItem  = (i: number) => setItems(p => p.filter((_, j) => j !== i))
  const setProducto = (i: number, id: number) => setItems(p => p.map((it, j) => j === i ? { ...it, productoId: id } : it))
  const setCantidad = (i: number, v: string) => {
    const soloNums = v.replace(/\D/g, "")
    const n = parseInt(soloNums, 10)
    setItems(p => p.map((it, j) => j === i
      ? { ...it, cantidadStr: soloNums, cantidad: (!isNaN(n) && n > 0) ? n : it.cantidad }
      : it
    ))
  }

  const handleGuardar = () => {
    if (items.length === 0) return
    onGuardar(items, notas.trim())
  }

  const productosPorCategoria = categoriasMock.map(cat => ({
    categoria: cat.nombre,
    productos: productosMock.filter(p => p.categoriaId === cat.id),
  })).filter(g => g.productos.length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-0 sm:px-4" onClick={onCerrar}>
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-background border shadow-2xl max-h-[90dvh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="text-base font-bold">Nueva Solicitud</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Pide mezclas, líquidos u otros insumos a bodega</p>
          </div>
          <button onClick={onCerrar} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1">
                <select
                  value={item.productoId}
                  onChange={e => setProducto(i, parseInt(e.target.value, 10))}
                  className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  {productosPorCategoria.map(g => (
                    <optgroup key={g.categoria} label={g.categoria}>
                      {g.productos.map(p => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <input
                type="text"
                inputMode="numeric"
                value={item.cantidadStr}
                onChange={e => setCantidad(i, e.target.value)}
                onFocus={e => e.target.select()}
                className="w-16 h-10 rounded-xl border border-input bg-background text-center text-sm font-bold tabular-nums outline-none focus:ring-2 focus:ring-ring"
              />
              {items.length > 1 && (
                <button onClick={() => quitarItem(i)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-destructive hover:bg-destructive/10 transition-colors">
                  <X size={16} />
                </button>
              )}
            </div>
          ))}

          <button
            onClick={agregarItem}
            className="w-full h-10 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={16} /> Agregar producto
          </button>

          {/* Notas */}
          <div className="space-y-1.5 pt-1">
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

        {/* Footer */}
        <div className="shrink-0 flex gap-3 border-t bg-background px-5 py-4">
          <button onClick={onCerrar} className="flex-1 h-11 rounded-xl border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={items.length === 0}
            className="flex-1 h-11 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            Enviar solicitud
          </button>
        </div>
      </div>
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

  const [modalAbierto, setModalAbierto] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState<EstadoSolicitud | "TODAS">("TODAS")

  const { data: solicitudes = [], isLoading } = useQuery({
    queryKey: ["solicitudes"],
    queryFn:  fetchSolicitudes,
    refetchInterval: 30_000,
  })

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

  const mutDespachar = useMutation({
    mutationFn: despacharSolicitud,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solicitudes"] })
      toast.success("Solicitud marcada como despachada")
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

        {/* Indicadores rápidos */}
        <div className="flex items-center gap-2">
          {pendientes > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500 px-2 text-xs font-bold text-white">
              {pendientes}
            </span>
          )}
          {despachadas > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-500 px-2 text-xs font-bold text-white">
              {despachadas}
            </span>
          )}
          {(rol === "VENDEDOR" || rol === "BODEGUERO") && turno && (
            <button
              onClick={() => setModalAbierto(true)}
              className="flex items-center gap-1.5 h-9 rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus size={16} /> Nueva
            </button>
          )}
        </div>
      </header>

      {/* Filtros */}
      <div className="shrink-0 flex gap-2 overflow-x-auto px-4 py-3 bg-background border-b scrollbar-none">
        {(["TODAS", "PENDIENTE", "DESPACHADA", "CONFIRMADA"] as const).map(f => (
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
              onDespachar={id => mutDespachar.mutate(id)}
              onConfirmar={id => mutConfirmar.mutate(id)}
            />
          ))
        )}
      </div>

      {/* Modal nueva solicitud */}
      {modalAbierto && pdv && (
        <ModalNuevaSolicitud
          onCerrar={() => setModalAbierto(false)}
          onGuardar={(items, notas) => mutCrear.mutate({ items, notas })}
        />
      )}
    </div>
  )
}
