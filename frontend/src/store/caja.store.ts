// Store del turno activo y caja (Zustand + persist).
// Offline-first: guarda operaciones fallidas en una cola y las reintenta
// cuando el navegador recupera conectividad (evento "online").

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiPost, apiPatch, apiGet, apiDelete } from "@/lib/api";
import type {
  TurnoActivo,
  ItemCarrito,
  ItemInventarioInicial,
  VentaLocal,
  MovimientoCaja,
  MetodoPago,
} from "@/tipos/pos.tipos";

// ─── Cola offline ─────────────────────────────────────────────────────────────

interface PendingOp {
  id:      number;
  metodo:  "POST" | "PATCH";
  ruta:    string;
  payload: unknown;
}

let _pendingQueue: PendingOp[] = []
let _nextOpId = 1

function encolarOp(metodo: "POST" | "PATCH", ruta: string, payload: unknown) {
  _pendingQueue.push({ id: _nextOpId++, metodo, ruta, payload })
}

async function drainQueue() {
  const pendientes = [..._pendingQueue]
  _pendingQueue = []
  for (const op of pendientes) {
    try {
      if (op.metodo === "POST") await apiPost(op.ruta, op.payload)
      else                      await apiPatch(op.ruta, op.payload)
    } catch {
      _pendingQueue.push(op)
    }
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (_pendingQueue.length > 0) drainQueue()
  })
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

const ahoraHHMM = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

let _nextVentaId = 1;
let _nextMovId   = 10;

/**
 * Categoría del movimiento que registra el saldo de apertura (caja chica).
 *
 * Decisión del negocio: la caja chica NO participa del cuadre — el vendedor cuenta
 * y entrega solo el efectivo de ventas, y esos billetes se quedan en el punto para
 * el turno siguiente. El movimiento existe únicamente como referencia visible en la
 * lista de movimientos, así que todo cálculo de efectivo esperado debe excluirlo
 * (ver POSDashboard: `esperadoCaja`).
 */
export const CATEGORIA_APERTURA = "Apertura";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface TurnoApiResponse {
  data: {
    id: number; pdvId: number; usuarioId: number;
    fechaApertura: string; saldoInicial: number; estado: string;
  };
}


export interface CuadreCaja {
  efectivo:      number;
  tarjeta:       number;
  transferencia: number;
  totalEstimado: number; // stock flow total en el momento del cuadre
}

export interface CierrePayload {
  efectivoContado:    number;
  ventaEfectivo:      number;
  ventaTarjeta:       number;
  ventaTransferencia: number;
  totalCalculado:     number;
  diferenciaCaja:     number;
  stockFinal:         { productoId: number; cantidad: number }[];
  // Detalle de ventas por producto (para el panel admin; el vendedor no ve montos).
  ventaDetalle:       { productoId: number; cantidad: number; precioUnitario: number }[];
}

// Borrador del conteo en progreso (saldo final por producto).
// Se persiste para que un refresco del navegador a mitad de turno no pierda el avance.
// `cocinadas` quedó obsoleto (las mezclas ahora se cuentan por saldo final); se
// mantiene opcional por compatibilidad con borradores persistidos antiguos.
export interface BorradorConteo {
  cocinadas?: Record<number, number>;
  stock:      Record<number, string>;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface CajaState {
  turno:             TurnoActivo | null;
  ventas:            VentaLocal[];
  movimientos:       MovimientoCaja[];
  inventarioInicial: ItemInventarioInicial[];
  inventarioSaldo:   Record<number, number>;
  cuadreCaja:        CuadreCaja | null;
  borradorConteo:    BorradorConteo | null;

  abrirTurno: (
    saldoInicial: number,
    pdvId: number,
    usuarioId: number,
    inventario: ItemInventarioInicial[]
  ) => Promise<void>;
  cerrarTurno:            (payload: CierrePayload) => Promise<boolean>;
  guardarCuadre:          (cuadre: CuadreCaja) => void;
  registrarVenta: (
    items: ItemCarrito[],
    categoriaPorId: Record<number, string>,
    total: number,
    metodoPago: MetodoPago,
    vendedorNombre: string
  ) => number;
  agregarMovimiento:      (mov: Omit<MovimientoCaja, "id" | "hora">) => Promise<void>;
  eliminarMovimiento:     (id: number) => Promise<void>;
  cargarGastosDesdeAPI:   (turnoId: number) => Promise<void>;
  cargarRetirosDesdeAPI:  (turnoId: number) => Promise<void>;
  guardarInventarioSaldo: (saldos: Record<number, number>) => void;
  guardarBorradorConteo:  (borrador: BorradorConteo) => void;
  sincronizarTurnoActivo: (pdvId: number) => Promise<void>;
}

export const useCajaStore = create<CajaState>()(
  persist(
    (set, get) => ({
      turno:             null,
      ventas:            [],
      movimientos:       [],
      inventarioInicial: [],
      inventarioSaldo:   {},
      cuadreCaja:        null,
      borradorConteo:    null,

      // ─── Abrir turno ────────────────────────────────────────────────────────
      abrirTurno: async (saldoInicial, pdvId, usuarioId, inventario) => {
        _nextVentaId = 1;
        _nextMovId   = 10;

        const tempId = Math.floor(Math.random() * 9000) + 1000;
        const turnoLocal: TurnoActivo = {
          id: tempId, pdvId, usuarioId,
          fechaApertura: new Date().toISOString(),
          saldoInicial,  estado: "ABIERTO",
        };
        set({
          turno:       turnoLocal,
          ventas:      [],
          // Referencia informativa del fondo que quedó en el punto. NO suma al
          // efectivo esperado del cuadre (ver CATEGORIA_APERTURA).
          movimientos: [{
            id: 1, tipo: "ingreso",
            descripcion: "Saldo apertura de caja (no entra al cuadre)",
            categoria: CATEGORIA_APERTURA, monto: saldoInicial, hora: ahoraHHMM(),
          }],
          inventarioInicial: inventario,
          inventarioSaldo:   {},
          cuadreCaja:        null,
          borradorConteo:    null,
        });

        try {
          const res = await apiPost<TurnoApiResponse>("/pos/turnos", {
            pdvId, saldoInicial,
            inventarioInicial: inventario.map((i) => ({
              productoId: i.productoId,
              inicio: i.inicio,
              ingreso: i.ingreso,
            })),
          });
          set((s) => ({
            turno: s.turno ? { ...s.turno, id: res.data.id } : null,
          }));
        } catch {
          encolarOp("POST", "/pos/turnos", {
            pdvId, saldoInicial,
            inventarioInicial: inventario.map((i) => ({
              productoId: i.productoId,
              inicio: i.inicio,
              ingreso: i.ingreso,
            })),
          })
        }
      },

      // ─── Cerrar turno ───────────────────────────────────────────────────────
      // El cierre es la operación crítica del turno: SOLO se marca CERRADO (y se
      // limpia el borrador) si el backend confirma la persistencia. Si falla, se
      // devuelve false SIN tocar el estado local, para que la UI muestre el error
      // y el vendedor pueda reintentar — antes se marcaba CERRADO igual y la UI
      // cerraba sesión, dejando el turno ABIERTO para siempre en el servidor
      // (cierres "fantasma" que nunca llegaban a Sucursales). No se encola en la
      // cola offline en memoria: para el cierre es preferible el reintento
      // explícito a un envío diferido que se pierde al cerrar el navegador.
      cerrarTurno: async (payload) => {
        const { turno } = get();
        if (!turno) return false;

        try {
          await apiPatch<unknown>(`/pos/turnos/${turno.id}/cerrar`, payload);
          // El turno terminó: se limpia TODO su estado en vez de dejarlo marcado
          // "CERRADO". Antes quedaba persistido en localStorage y sobrevivía al
          // logout; cualquier pantalla que distinguiera "sin turno" de "turno
          // cerrado" se quedaba pegada en el turno viejo al volver a entrar.
          set({
            turno:             null,
            ventas:            [],
            movimientos:       [],
            inventarioInicial: [],
            inventarioSaldo:   {},
            cuadreCaja:        null,
            borradorConteo:    null,
          });
          return true;
        } catch {
          return false;
        }
      },

      // ─── Cuadre de caja ─────────────────────────────────────────────────────
      guardarCuadre: (cuadre) => set({ cuadreCaja: cuadre }),

      // ─── Registrar venta ────────────────────────────────────────────────────
      registrarVenta: (items, categoriaPorId, total, metodoPago, vendedorNombre) => {
        const { turno } = get();
        const id = _nextVentaId++;

        const venta: VentaLocal = {
          id,
          turnoId: turno?.id ?? 0,
          vendedorNombre,
          items: items.map((it) => ({
            productoId:     it.producto.id,
            nombre:         it.producto.nombre,
            categoria:      categoriaPorId[it.producto.categoriaId] ?? "",
            cantidad:       it.cantidad,
            precioUnitario: it.producto.precioVenta,
          })),
          total, metodoPago, horaVenta: ahoraHHMM(),
        };

        set((s) => ({ ventas: [...s.ventas, venta] }));
        // El modelo es stock-flow: el total real se calcula en el cierre,
        // no se registran ventas individuales en el backend.
        return id;
      },

      // ─── Movimientos de caja ────────────────────────────────────────────────
      // Los RETIROS no se crean por aquí: los registra el admin/supervisor desde
      // el panel (POST /pos/turnos/:id/retiros) y el POS los lee con
      // `cargarRetirosDesdeAPI`. El vendedor nunca retira dinero del punto.
      agregarMovimiento: async (mov) => {
        if (mov.tipo === "retiro") {
          console.warn("[caja] los retiros los registra el admin/supervisor, no el POS");
          return;
        }
        const localId = _nextMovId++;
        const nuevo: MovimientoCaja = { ...mov, id: localId, hora: ahoraHHMM() };
        set((s) => ({ movimientos: [...s.movimientos, nuevo] }));

        // Solo los gastos se persisten en BD (los ingresos tienen su propio flujo)
        if (mov.tipo === "gasto") {
          const turnoId = get().turno?.id;
          if (turnoId) {
            try {
              const res = await apiPost<{ data: { id: number } }>(
                `/pos/turnos/${turnoId}/gastos`,
                { descripcion: mov.descripcion, monto: mov.monto }
              );
              // Asociar el backendId al movimiento local
              set((s) => ({
                movimientos: s.movimientos.map((m) =>
                  m.id === localId ? { ...m, backendId: res.data.id } : m
                ),
              }));
            } catch {
              encolarOp("POST", `/pos/turnos/${turnoId}/gastos`, {
                descripcion: mov.descripcion, monto: mov.monto,
              });
            }
          }
        }
      },

      eliminarMovimiento: async (id) => {
        if (id === 1) return; // saldo de apertura: intocable
        const mov = get().movimientos.find((m) => m.id === id);
        // Los retiros del admin son solo lectura para el vendedor: borrarlos aquí
        // solo desincronizaría su cuadre del que calcula el servidor.
        if (mov?.soloLectura) return;
        set((s) => ({ movimientos: s.movimientos.filter((m) => m.id !== id) }));

        // Eliminar del backend si tiene backendId y es un gasto
        if (mov?.backendId && mov.tipo === "gasto") {
          const turnoId = get().turno?.id;
          if (turnoId) {
            try {
              await apiDelete(`/pos/turnos/${turnoId}/gastos/${mov.backendId}`);
            } catch { /* si falla, el gasto quedará huérfano — aceptable */ }
          }
        }
      },

      // Carga gastos existentes desde la BD al retomar un turno abierto
      cargarGastosDesdeAPI: async (turnoId) => {
        try {
          const res = await apiGet<{ data: { id: number; descripcion: string; monto: number }[] }>(
            `/pos/turnos/${turnoId}/gastos`
          );
          const gastosApi = res.data.map((g) => ({
            id:          _nextMovId++,
            backendId:   g.id,
            tipo:        "gasto" as const,
            descripcion: g.descripcion,
            categoria:   "Gasto registrado",
            monto:       g.monto,
            hora:        "—",
          }));
          set((s) => ({
            // Conservar apertura (id=1) + retiros, reemplazar gastos con los de BD
            movimientos: [
              ...s.movimientos.filter((m) => m.tipo !== "gasto"),
              ...gastosApi,
            ],
          }));
        } catch { /* si falla, se muestran solo los gastos locales */ }
      },

      /**
       * Trae los retiros del turno desde la BD. Los registra el admin/supervisor
       * durante su visita al punto, así que son la única forma que tiene el POS
       * de enterarse: sin esto el vendedor cuenta menos efectivo del esperado y
       * declara un faltante fantasma del porte del retiro.
       */
      cargarRetirosDesdeAPI: async (turnoId) => {
        try {
          const res = await apiGet<{
            data: { id: number; monto: number; descripcion: string | null; realizadoPor: string; fechaHora: string }[]
          }>(`/pos/turnos/${turnoId}/retiros`);
          const retirosApi: MovimientoCaja[] = res.data.map((r) => ({
            id:           _nextMovId++,
            backendId:    r.id,
            tipo:         "retiro" as const,
            descripcion:  r.descripcion ?? "Retiro de efectivo",
            categoria:    "Retiro del punto",
            monto:        r.monto,
            hora:         r.fechaHora,
            soloLectura:  true,
            realizadoPor: r.realizadoPor,
          }));
          set((s) => ({
            movimientos: [
              ...s.movimientos.filter((m) => m.tipo !== "retiro"),
              ...retirosApi,
            ],
          }));
        } catch { /* sin red: se conserva lo que ya se había cargado */ }
      },

      guardarInventarioSaldo: (saldos) => set({ inventarioSaldo: saldos }),

      // Guarda el avance del conteo (persistido) para sobrevivir a un refresco.
      guardarBorradorConteo: (borrador) => set({ borradorConteo: borrador }),

      // Reconcilia el turno local con el backend: corrige el id temporal que se
      // asignó si el turno se abrió offline, y descarta un turno local "abierto"
      // que el servidor ya no tiene como ABIERTO (cerrado desde otro dispositivo).
      sincronizarTurnoActivo: async (pdvId) => {
        try {
          const res = await apiGet<{ data: TurnoApiResponse["data"] | null }>(
            `/pos/turnos/activo?pdvId=${pdvId}`
          );
          const remoto = res.data;
          const local  = get().turno;
          if (!local || local.estado !== "ABIERTO") return;

          if (remoto && remoto.pdvId === local.pdvId) {
            // Alinear id/fecha/saldo con la fuente de verdad del servidor.
            if (remoto.id !== local.id) {
              set((s) => ({
                turno: s.turno
                  ? {
                      ...s.turno,
                      id:            remoto.id,
                      fechaApertura: remoto.fechaApertura,
                      saldoInicial:  remoto.saldoInicial,
                    }
                  : null,
              }));
            }
            return;
          }

          // El servidor (accesible) NO tiene un turno ABIERTO para este PDV, pero
          // localmente sí. Es un turno "fantasma": la apertura nunca se persistió
          // (quedó con id temporal), o el turno se cerró/eliminó en el servidor, o
          // se reseteó la BD. Se descarta el estado local para que el vendedor
          // vuelva al asistente de apertura y abra un turno que SÍ quede en la BD
          // (si no, el POS muestra un turno que no existe para Sucursales, cierre
          // preventivo, nómina, etc.).
          // Excepción: si hay una apertura encolada offline, NO se descarta —
          // se persistirá al reconectar.
          const aperturaPendiente = _pendingQueue.some((op) => op.ruta === "/pos/turnos");
          if (!aperturaPendiente) {
            set({
              turno:             null,
              ventas:            [],
              movimientos:       [],
              inventarioInicial: [],
              inventarioSaldo:   {},
              cuadreCaja:        null,
              borradorConteo:    null,
            });
          }
        } catch {
          /* sin red o error: se mantiene el estado local (offline-first) */
        }
      },
    }),
    { name: "nuts4you-caja" }
  )
);
