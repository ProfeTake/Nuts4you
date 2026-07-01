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
}

// Borrador del conteo en progreso (mezclas cocinadas + saldo final por producto).
// Se persiste para que un refresco del navegador a mitad de turno no pierda el avance.
export interface BorradorConteo {
  cocinadas: Record<number, number>;
  stock:     Record<number, string>;
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
  cerrarTurno:            (payload: CierrePayload) => Promise<void>;
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
          movimientos: [{
            id: 1, tipo: "ingreso",
            descripcion: "Saldo apertura de caja",
            categoria: "Apertura", monto: saldoInicial, hora: ahoraHHMM(),
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
      cerrarTurno: async (payload) => {
        const { turno } = get();

        set((s) => ({
          turno: s.turno ? { ...s.turno, estado: "CERRADO" as const } : null,
          borradorConteo: null,
        }));

        if (turno) {
          try {
            await apiPatch<unknown>(`/pos/turnos/${turno.id}/cerrar`, payload);
          } catch {
            encolarOp("PATCH", `/pos/turnos/${turno.id}/cerrar`, payload)
          }
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
      agregarMovimiento: async (mov) => {
        const localId = _nextMovId++;
        const nuevo: MovimientoCaja = { ...mov, id: localId, hora: ahoraHHMM() };
        set((s) => ({ movimientos: [...s.movimientos, nuevo] }));

        // Solo los gastos se persisten en BD (retiros e ingresos tienen su propio flujo)
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
            // Conservar apertura (id=1) + retiros locales, reemplazar gastos con los de BD
            movimientos: [
              ...s.movimientos.filter((m) => m.tipo !== "gasto"),
              ...gastosApi,
            ],
          }));
        } catch { /* si falla, se muestran solo los gastos locales */ }
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
          }
        } catch {
          /* sin red o error: se mantiene el estado local (offline-first) */
        }
      },
    }),
    { name: "nuts4you-caja" }
  )
);
