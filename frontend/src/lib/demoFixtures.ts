// ─────────────────────────────────────────────────────────────────────────────
// Fixtures del modo demo.
// Ningún dato de este archivo llega jamás al backend real: todo vive en
// memoria del navegador y se reinicia al recargar la página. Se activa solo
// para la cuenta con es_demo=true (ver lib/api.ts).
//
// Para eliminar el modo demo por completo: borrar este archivo, quitar el
// bloque de interceptación en lib/api.ts, y eliminar la cuenta demo desde
// Gestión de Usuarios (o `DELETE FROM Usuario WHERE es_demo = true`).
// ─────────────────────────────────────────────────────────────────────────────

function delay<T>(data: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), 250 + Math.random() * 300));
}

function uid(prefijo: string): string {
  return `${prefijo}-${Math.random().toString(36).slice(2, 9)}`;
}

function isoHace(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString();
}

function fechaHace(dias: number): string {
  return isoHace(dias).slice(0, 10);
}

function diasEnMes(mesISO: string): number {
  const [anio, mes] = mesISO.split("-").map(Number);
  return new Date(anio, mes, 0).getDate();
}

function mesActual(): string {
  return new Date().toISOString().slice(0, 7);
}

// ─── Semilla determinística por sucursal (fija durante la sesión) ───────────

const PDVS_INICIAL = [
  { id: 1, nombre: "Bodega Central", tipo: "BODEGA", activo: true },
  { id: 2, nombre: "Mall Patio", tipo: "PUNTO_VENTA", activo: true },
  { id: 3, nombre: "Paseo Independencia", tipo: "PUNTO_VENTA", activo: true },
  { id: 4, nombre: "Open Plaza", tipo: "PUNTO_VENTA", activo: true },
  { id: 5, nombre: "Cugat Rengo", tipo: "PUNTO_VENTA", activo: true },
  { id: 6, nombre: "Cugat Baquedano", tipo: "PUNTO_VENTA", activo: true },
];
let pdvs = [...PDVS_INICIAL];
let nextPdvId = 7;

const VENTA_BASE: Record<number, number> = {
  2: 260_000 + Math.random() * 80_000,
  3: 190_000 + Math.random() * 60_000,
  4: 150_000 + Math.random() * 50_000,
  5: 120_000 + Math.random() * 40_000,
  6: 110_000 + Math.random() * 40_000,
};

// ─── Usuarios (fuente única para /usuarios y /rrhh/personal) ────────────────

interface UsuarioDemo {
  id: number;
  rut: string;
  nombre: string;
  email: string | null;
  rol: "ADMIN" | "SUPERVISOR" | "VENDEDOR" | "BODEGUERO";
  pdvId: number | null;
  pdvNombre: string | null;
  activo: boolean;
  pagoDiario: number;
  ultimoTurno: string | null;
}

let usuarios: UsuarioDemo[] = [
  { id: 100, rut: "00000000-0", nombre: "Usuario Demo", email: "demo@nuts4you.cl", rol: "ADMIN", pdvId: null, pdvNombre: null, activo: true, pagoDiario: 0, ultimoTurno: null },
  { id: 101, rut: "20111111-1", nombre: "Camila Soto", email: "camila.soto@nuts4you.cl", rol: "VENDEDOR", pdvId: 2, pdvNombre: "Mall Patio", activo: true, pagoDiario: 28000, ultimoTurno: isoHace(1) },
  { id: 102, rut: "20222222-2", nombre: "Javiera Muñoz", email: "javiera.munoz@nuts4you.cl", rol: "VENDEDOR", pdvId: 3, pdvNombre: "Paseo Independencia", activo: true, pagoDiario: 28000, ultimoTurno: isoHace(1) },
  { id: 103, rut: "20333333-3", nombre: "Fernanda Rojas", email: "fernanda.rojas@nuts4you.cl", rol: "VENDEDOR", pdvId: 4, pdvNombre: "Open Plaza", activo: true, pagoDiario: 28000, ultimoTurno: isoHace(2) },
  { id: 104, rut: "20444444-4", nombre: "Constanza Díaz", email: "constanza.diaz@nuts4you.cl", rol: "VENDEDOR", pdvId: 5, pdvNombre: "Cugat Rengo", activo: true, pagoDiario: 28000, ultimoTurno: isoHace(1) },
  { id: 105, rut: "20555555-5", nombre: "Valentina Torres", email: "valentina.torres@nuts4you.cl", rol: "VENDEDOR", pdvId: 6, pdvNombre: "Cugat Baquedano", activo: true, pagoDiario: 28000, ultimoTurno: isoHace(2) },
  { id: 106, rut: "20666666-6", nombre: "Antonia Vega", email: "antonia.vega@nuts4you.cl", rol: "VENDEDOR", pdvId: 2, pdvNombre: "Mall Patio", activo: true, pagoDiario: 28000, ultimoTurno: isoHace(3) },
  { id: 107, rut: "19777777-7", nombre: "Rodrigo Fuentes", email: "rodrigo.fuentes@nuts4you.cl", rol: "BODEGUERO", pdvId: 1, pdvNombre: "Bodega Central", activo: true, pagoDiario: 30000, ultimoTurno: null },
  { id: 108, rut: "18888888-8", nombre: "Patricia Ibáñez", email: "patricia.ibanez@nuts4you.cl", rol: "SUPERVISOR", pdvId: null, pdvNombre: null, activo: true, pagoDiario: 0, ultimoTurno: null },
];
let nextUsuarioId = 109;

const VENDEDORES = () => usuarios.filter((u) => u.rol === "VENDEDOR" && u.activo);
const vendedorPorPdv = (pdvId: number) => VENDEDORES().find((v) => v.pdvId === pdvId) ?? null;

// ─── Bodega: stock ───────────────────────────────────────────────────────────

interface ItemBodegaDemo {
  inventarioId: number;
  productoId: number;
  nombre: string;
  categoria: string;
  precioVenta: number;
  stockActual: number;
  stockCritico: number;
}

let stockBodega: ItemBodegaDemo[] = [
  { inventarioId: 1, productoId: 1, nombre: "Maní Salado", categoria: "Mezclas", precioVenta: 1500, stockActual: 42, stockCritico: 20 },
  { inventarioId: 2, productoId: 2, nombre: "Maní Confitado", categoria: "Mezclas", precioVenta: 1500, stockActual: 8, stockCritico: 20 },
  { inventarioId: 3, productoId: 3, nombre: "Nueces Garrapiñadas", categoria: "Mezclas", precioVenta: 2200, stockActual: 0, stockCritico: 15 },
  { inventarioId: 4, productoId: 4, nombre: "Mix Frutos Secos Premium", categoria: "Mezclas", precioVenta: 2800, stockActual: 65, stockCritico: 20 },
  { inventarioId: 10, productoId: 10, nombre: "Agua Mineral Con Gas", categoria: "Líquidos", precioVenta: 800, stockActual: 30, stockCritico: 15 },
  { inventarioId: 11, productoId: 11, nombre: "Agua Mineral Sin Gas", categoria: "Líquidos", precioVenta: 800, stockActual: 24, stockCritico: 15 },
  { inventarioId: 12, productoId: 12, nombre: "Energéticas", categoria: "Líquidos", precioVenta: 1500, stockActual: 12, stockCritico: 15 },
  { inventarioId: 13, productoId: 13, nombre: "Bebidas", categoria: "Líquidos", precioVenta: 1500, stockActual: 40, stockCritico: 15 },
  { inventarioId: 14, productoId: 14, nombre: "Jugos Kapo", categoria: "Líquidos", precioVenta: 500, stockActual: 18, stockCritico: 10 },
  { inventarioId: 15, productoId: 15, nombre: "Helados", categoria: "Helados", precioVenta: 1000, stockActual: 22, stockCritico: 10 },
];
let nextInventarioId = 16;
let nextProductoId = 16;

const categorias = [
  { id: 1, nombre: "Mezclas" },
  { id: 2, nombre: "Paquetes" },
  { id: 3, nombre: "Promos" },
  { id: 4, nombre: "Líquidos" },
  { id: 5, nombre: "Helados" },
  { id: 6, nombre: "Otros" },
];

interface HistorialItemDemo { id: number; nombre: string; saldoAnterior: number; ingresos: number; utilizadas: number; saldoNuevo: number }
interface HistorialGrupoDemo { loteId: string; fecha: string; usuario: string; cantidad: number; totalIngresos: number; totalUtilizadas: number; items: HistorialItemDemo[] }

let historialInventario: HistorialGrupoDemo[] = [
  {
    loteId: uid("hist"), fecha: isoHace(1), usuario: "Usuario Demo", cantidad: 2, totalIngresos: 50, totalUtilizadas: 8,
    items: [
      { id: 1, nombre: "Maní Salado", saldoAnterior: 30, ingresos: 20, utilizadas: 8, saldoNuevo: 42 },
      { id: 4, nombre: "Mix Frutos Secos Premium", saldoAnterior: 35, ingresos: 30, utilizadas: 0, saldoNuevo: 65 },
    ],
  },
];

interface DespachoItemDemo { id: number; producto: string; cantidad: number }
interface DespachoEventoDemo { loteId: string; fecha: string; origen: string; destino: string; cantidadItems: number; totalUnidades: number; items: DespachoItemDemo[] }

let despachos: DespachoEventoDemo[] = [
  {
    loteId: uid("desp"), fecha: isoHace(2), origen: "Bodega Central", destino: "Mall Patio", cantidadItems: 3, totalUnidades: 45,
    items: [
      { id: 1, producto: "Maní Salado", cantidad: 20 },
      { id: 2, producto: "Agua Mineral Con Gas", cantidad: 15 },
      { id: 3, producto: "Bebidas", cantidad: 10 },
    ],
  },
  {
    loteId: uid("desp"), fecha: isoHace(5), origen: "Bodega Central", destino: "Paseo Independencia", cantidadItems: 2, totalUnidades: 30,
    items: [
      { id: 4, producto: "Maní Confitado", cantidad: 18 },
      { id: 5, producto: "Jugos Kapo", cantidad: 12 },
    ],
  },
];

// ─── Finanzas: depósitos ─────────────────────────────────────────────────────

interface DepositoDemo {
  id: number; turnoId: number; fechaVenta: string; fechaDeposito: string | null;
  pdvId: number; sucursal: string; sucursalNombre: string; vendedor: string;
  montoADepositar: number; montoDepositado: number; faltaDepositar: number;
  estado: "Depositado" | "Transferencia" | "No depositado";
}

let depositos: DepositoDemo[] = [
  { id: 1, turnoId: 501, fechaVenta: fechaHace(0), fechaDeposito: null, pdvId: 2, sucursal: "Mall Patio", sucursalNombre: "Mall Patio", vendedor: "Camila Soto", montoADepositar: 185000, montoDepositado: 0, faltaDepositar: 185000, estado: "No depositado" },
  { id: 2, turnoId: 498, fechaVenta: fechaHace(1), fechaDeposito: fechaHace(1), pdvId: 3, sucursal: "Paseo Independencia", sucursalNombre: "Paseo Independencia", vendedor: "Javiera Muñoz", montoADepositar: 142000, montoDepositado: 142000, faltaDepositar: 0, estado: "Depositado" },
  { id: 3, turnoId: 495, fechaVenta: fechaHace(2), fechaDeposito: fechaHace(2), pdvId: 4, sucursal: "Open Plaza", sucursalNombre: "Open Plaza", vendedor: "Fernanda Rojas", montoADepositar: 98000, montoDepositado: 98000, faltaDepositar: 0, estado: "Transferencia" },
  { id: 4, turnoId: 490, fechaVenta: fechaHace(3), fechaDeposito: null, pdvId: 5, sucursal: "Cugat Rengo", sucursalNombre: "Cugat Rengo", vendedor: "Constanza Díaz", montoADepositar: 76000, montoDepositado: 0, faltaDepositar: 76000, estado: "No depositado" },
  { id: 5, turnoId: 487, fechaVenta: fechaHace(4), fechaDeposito: fechaHace(3), pdvId: 6, sucursal: "Cugat Baquedano", sucursalNombre: "Cugat Baquedano", vendedor: "Valentina Torres", montoADepositar: 64000, montoDepositado: 64000, faltaDepositar: 0, estado: "Depositado" },
];

// ─── Facturas / proveedores ──────────────────────────────────────────────────

interface ProveedorDemo { id: number; nombre: string; rut: string | null; contacto: string | null; activo: boolean; banco: string | null; tipo_cuenta: string | null; numero_cuenta: string | null }

let proveedores: ProveedorDemo[] = [
  { id: 1, nombre: "Distribuidora Frutos del Sur", rut: "76123456-7", contacto: "+56 9 1234 5678", activo: true, banco: "Banco Estado", tipo_cuenta: "Corriente", numero_cuenta: "12345678" },
  { id: 2, nombre: "Envases y Empaques Ltda", rut: "77234567-8", contacto: "contacto@envases.cl", activo: true, banco: "Banco de Chile", tipo_cuenta: "Corriente", numero_cuenta: "87654321" },
];
let nextProveedorId = 3;

interface DetalleFacturaDemo { id: number; descripcion: string; cantidad: number; precioUnitario: number }
interface FacturaDemo {
  id: number; proveedorId: number; proveedorNombre: string; numeroFactura: string;
  fecha: string; fechaVencimiento: string | null; montoTotal: number;
  estado: "PENDIENTE" | "PAGADA" | "ANULADA"; notas: string | null; creadoEn: string;
  items: DetalleFacturaDemo[];
}

let facturas: FacturaDemo[] = [
  { id: 1, proveedorId: 1, proveedorNombre: "Distribuidora Frutos del Sur", numeroFactura: "F-00123", fecha: fechaHace(6), fechaVencimiento: fechaHace(-14), montoTotal: 450000, estado: "PENDIENTE", notas: null, creadoEn: isoHace(6), items: [
    { id: 1, descripcion: "Maní crudo 25kg", cantidad: 5, precioUnitario: 60000 },
    { id: 2, descripcion: "Nueces 10kg", cantidad: 3, precioUnitario: 50000 },
  ] },
  { id: 2, proveedorId: 2, proveedorNombre: "Envases y Empaques Ltda", numeroFactura: "F-00098", fecha: fechaHace(12), fechaVencimiento: null, montoTotal: 120000, estado: "PAGADA", notas: null, creadoEn: isoHace(12), items: [
    { id: 3, descripcion: "Bolsas kraft 1kg (x500)", cantidad: 1, precioUnitario: 120000 },
  ] },
];
let nextFacturaId = 3;

// ─── Cierre preventivo ───────────────────────────────────────────────────────

let tareasChecklist = [
  { id: 1, label: "Verificar caja registradora", orden: 1 },
  { id: 2, label: "Contar stock de mezclas", orden: 2 },
  { id: 3, label: "Revisar cámaras de seguridad", orden: 3 },
  { id: 4, label: "Cerrar llaves de agua/gas", orden: 4 },
];
let nextTareaId = 5;

interface CierrePreventivoDemo {
  id: number; pdvId: number; pdvNombre: string; usuarioNombre: string; fecha: string;
  montoRetiro: number; checklist: { label: string; marcado: boolean }[];
  notasVendedor: string | null; observaciones: string | null;
}

let cierresPreventivos: CierrePreventivoDemo[] = [
  {
    id: 1, pdvId: 2, pdvNombre: "Mall Patio", usuarioNombre: "Camila Soto", fecha: isoHace(1),
    montoRetiro: 50000,
    checklist: [
      { label: "Verificar caja registradora", marcado: true },
      { label: "Contar stock de mezclas", marcado: true },
      { label: "Revisar cámaras de seguridad", marcado: true },
      { label: "Cerrar llaves de agua/gas", marcado: false },
    ],
    notasVendedor: "Todo en orden, cierre normal.",
    observaciones: null,
  },
];
let nextCierreId = 2;

// ─── Config de bonos ─────────────────────────────────────────────────────────

interface TramoDemo { id: number; umbral: number; monto: number; activo: boolean }
let configBonos: Record<number, TramoDemo[]> = {
  2: [
    { id: 1, umbral: 400000, monto: 30000, activo: true },
    { id: 2, umbral: 350000, monto: 19000, activo: true },
    { id: 3, umbral: 300000, monto: 12000, activo: true },
    { id: 4, umbral: 250000, monto: 6000, activo: true },
  ],
  3: [
    { id: 5, umbral: 220000, monto: 15000, activo: true },
    { id: 6, umbral: 180000, monto: 9000, activo: true },
    { id: 7, umbral: 140000, monto: 4000, activo: true },
  ],
  4: [
    { id: 8, umbral: 180000, monto: 12000, activo: true },
    { id: 9, umbral: 140000, monto: 8000, activo: true },
    { id: 10, umbral: 100000, monto: 3000, activo: true },
  ],
  5: [
    { id: 11, umbral: 180000, monto: 12000, activo: true },
    { id: 12, umbral: 140000, monto: 8000, activo: true },
    { id: 13, umbral: 100000, monto: 4000, activo: true },
  ],
  6: [
    { id: 14, umbral: 180000, monto: 12000, activo: true },
    { id: 15, umbral: 140000, monto: 8000, activo: true },
    { id: 16, umbral: 100000, monto: 3000, activo: true },
  ],
};
let nextTramoId = 17;

// ─── Notificaciones ──────────────────────────────────────────────────────────

let notificaciones = [
  { id: 1, titulo: "Horario publicado", mensaje: "Tu horario de este mes ya está disponible.", leida: false, fecha: isoHace(1) },
  { id: 2, titulo: "Recordatorio", mensaje: "No olvides registrar el cierre preventivo al finalizar tu turno.", leida: false, fecha: isoHace(2) },
  { id: 3, titulo: "Bono alcanzado", mensaje: "¡Felicitaciones! Alcanzaste el tramo de bono más alto ayer.", leida: true, fecha: isoHace(3) },
];

// ─── Solicitudes ─────────────────────────────────────────────────────────────

interface SolicitudDemo {
  id: number; pdvId: number; pdvNombre: string; solicitante: string; fecha: string;
  estado: "PENDIENTE" | "DESPACHADA" | "CONFIRMADA";
  items: { id: number; producto: string; cantidad: number }[];
  notas: string | null;
}

let solicitudes: SolicitudDemo[] = [
  {
    id: 1, pdvId: 3, pdvNombre: "Paseo Independencia", solicitante: "Javiera Muñoz", fecha: isoHace(0),
    estado: "PENDIENTE",
    items: [{ id: 1, producto: "Maní Salado", cantidad: 10 }, { id: 2, producto: "Bebidas", cantidad: 6 }],
    notas: "Se está agotando para el fin de semana",
  },
];
let nextSolicitudId = 2;

// ─── Horarios (grilla del mes actual) ────────────────────────────────────────

function generarGridMes(mesISO: string) {
  const grid: Record<string, Record<number, unknown>> = {};
  const [anio, mesNum] = mesISO.split("-").map(Number);
  const hoy = new Date();
  const esMesActual = mesISO === mesActual();
  const totalDias = diasEnMes(mesISO);
  const vendedores = VENDEDORES();
  const puntosVenta = pdvs.filter((p) => p.tipo === "PUNTO_VENTA" && p.activo);

  for (let dia = 1; dia <= totalDias; dia++) {
    const fecha = `${anio}-${String(mesNum).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const fechaDate = new Date(anio, mesNum - 1, dia);
    const esPasado = fechaDate < new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const fila: Record<number, unknown> = {};
    puntosVenta.forEach((pdv, i) => {
      const vendedor = vendedores.length > 0 ? vendedores[(dia + i) % vendedores.length] : null;
      fila[pdv.id] = {
        id: dia * 100 + pdv.id,
        vendedorPlaneado: vendedor ? { id: vendedor.id, nombre: vendedor.nombre } : null,
        vendedorReal: esPasado && vendedor ? { id: vendedor.id, nombre: vendedor.nombre } : null,
        total: esPasado ? Math.round((VENTA_BASE[pdv.id] ?? 150000) * (0.85 + Math.random() * 0.3)) : null,
        estado: esPasado ? "CERRADO" : null,
        publicado: !esMesActual || esPasado,
      };
    });
    grid[fecha] = fila;
  }
  return grid;
}

const horariosCache = new Map<string, Record<string, Record<number, unknown>>>();
function gridDelMes(mes: string) {
  if (!horariosCache.has(mes)) horariosCache.set(mes, generarGridMes(mes));
  return horariosCache.get(mes)!;
}

/** Busca una celda por su id (dia*100+pdvId o generado al importar) en todos los meses en caché */
function buscarCelda(id: number): { fecha: string; pdvId: number } | null {
  for (const grid of horariosCache.values()) {
    for (const [fecha, fila] of Object.entries(grid)) {
      for (const [pdvId, celda] of Object.entries(fila)) {
        if ((celda as { id: number | null }).id === id) return { fecha, pdvId: Number(pdvId) };
      }
    }
  }
  return null;
}

// ─── Dashboard / resumen diario ──────────────────────────────────────────────

function resumenDiario(fecha: string) {
  const mes = fecha.slice(0, 7);
  const dias = diasEnMes(mes);
  const esMesActual = mes === mesActual();
  const diasTranscurridos = esMesActual ? new Date().getDate() : dias;

  const puntosVenta = pdvs.filter((p) => p.tipo === "PUNTO_VENTA" && p.activo);
  const ventasMensualesPorSucursal = puntosVenta.map((pdv) => {
    const base = VENTA_BASE[pdv.id] ?? 150000;
    const ventaTotal = Math.round(base * diasTranscurridos);
    const promedioDiario = Math.round(base);
    return {
      pdvId: pdv.id,
      sucursal: pdv.nombre,
      ventaTotal,
      ventaPorCategoria: {
        Mezclas: Math.round(ventaTotal * 0.45),
        Paquetes: Math.round(ventaTotal * 0.2),
        Promos: Math.round(ventaTotal * 0.1),
        "Líquidos": Math.round(ventaTotal * 0.25),
      },
      promedioDiario,
      proyeccionMes: Math.round(promedioDiario * dias),
      diasConVenta: diasTranscurridos,
    };
  });

  const ventasUltimos7Dias = Array.from({ length: 7 }, (_, i) => {
    const offset = 6 - i;
    const d = new Date();
    d.setDate(d.getDate() - offset);
    const dias7 = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const totalDia = puntosVenta.reduce((s, pdv) => s + (VENTA_BASE[pdv.id] ?? 150000), 0);
    return {
      dia: dias7[d.getDay()],
      fecha: d.toISOString().slice(0, 10),
      monto: Math.round(totalDia * (0.8 + Math.random() * 0.35)),
    };
  });

  const sucursalesHoy = puntosVenta.map((pdv) => {
    const dep = depositos.find((d) => d.pdvId === pdv.id && d.faltaDepositar > 0);
    return {
      pdvId: pdv.id,
      nombre: pdv.nombre,
      ventaHoy: Math.round((VENTA_BASE[pdv.id] ?? 150000) * (0.85 + Math.random() * 0.3)),
      depositoPendiente: dep?.faltaDepositar ?? 0,
      estado: (dep ? "Pendiente" : "Al día") as "Al día" | "Pendiente" | "Sin reporte",
      vendedor: vendedorPorPdv(pdv.id)?.nombre ?? null,
    };
  });

  const alertasBodega = stockBodega.filter((i) => i.stockActual <= i.stockCritico).length;
  const itemsSinStock = stockBodega.filter((i) => i.stockActual <= 0).map((i) => i.nombre);
  const totalMes = ventasMensualesPorSucursal.reduce((s, v) => s + v.ventaTotal, 0);
  const proyeccionTotalMes = ventasMensualesPorSucursal.reduce((s, v) => s + v.proyeccionMes, 0);
  const pendienteDeposito = depositos.reduce((s, d) => s + d.faltaDepositar, 0);

  return {
    ventaTotalDia: sucursalesHoy.reduce((s, x) => s + x.ventaHoy, 0),
    pendienteDeposito,
    faltantesMes: 24000,
    turnosFaltante: 2,
    alertasBodega,
    itemsSinStock,
    ventasMensualesPorSucursal,
    ventasUltimos7Dias,
    sucursalesHoy,
    mes,
    totalMes,
    promedioDiarioTotal: Math.round(totalMes / Math.max(1, diasTranscurridos)),
    proyeccionTotalMes,
    diasMes: dias,
    diasTranscurridos,
  };
}

function resumenVentasSucursal(pdvId: number, _fecha: string) {
  const pdv = pdvs.find((p) => p.id === pdvId);
  const vendedor = vendedorPorPdv(pdvId);
  const base = VENTA_BASE[pdvId] ?? 150000;
  const ventaTotal = Math.round(base * (0.85 + Math.random() * 0.3));
  const ventaEfectivo = Math.round(ventaTotal * 0.55);
  const ventaTarjeta = Math.round(ventaTotal * 0.3);
  const ventaTransferencia = ventaTotal - ventaEfectivo - ventaTarjeta;
  const pagoDiario = vendedor?.pagoDiario ?? 28000;
  const totalRetiros = 0;
  const efectivoDeclarado = ventaEfectivo;
  const diferenciaCaja = efectivoDeclarado - (ventaEfectivo + totalRetiros - pagoDiario) - pagoDiario;
  const dias = diasEnMes(mesActual());
  const diasTranscurridos = new Date().getDate();

  return {
    turnoId: 9000 + pdvId,
    usuarioId: vendedor?.id ?? 0,
    estado: "ABIERTO",
    vendedor: vendedor?.nombre ?? "Sin asignar",
    pagoDiario,
    ventasPorCategoria: {
      Mezclas: Math.round(ventaTotal * 0.45),
      Paquetes: Math.round(ventaTotal * 0.2),
      Promos: Math.round(ventaTotal * 0.1),
      "Líquidos": Math.round(ventaTotal * 0.25),
    },
    totalVentas: ventaTotal,
    ventaEfectivo,
    ventaTarjeta,
    ventaTransferencia,
    efectivoDeclarado,
    diferenciaCaja,
    saldoInicial: 20000,
    totalRetiros,
    metricas: {
      totalMes: Math.round(base * diasTranscurridos),
      promedioDiario: Math.round(base),
      proyeccionMes: Math.round(base * dias),
      diasConVenta: diasTranscurridos,
      diasMes: dias,
      diasTranscurridos,
      categoriasMes: {
        Mezclas: Math.round(base * diasTranscurridos * 0.45),
        Paquetes: Math.round(base * diasTranscurridos * 0.2),
        Promos: Math.round(base * diasTranscurridos * 0.1),
        "Líquidos": Math.round(base * diasTranscurridos * 0.25),
      },
      faltantesMes: 8000,
    },
    pdvNombre: pdv?.nombre,
  };
}

function historialTurnos(pdvId: number, desde: string, hasta: string) {
  const vendedor = vendedorPorPdv(pdvId);
  const inicio = new Date(desde);
  const fin = new Date(hasta);
  const filas = [];
  let turnoId = 8000 + pdvId * 100;
  for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    const base = VENTA_BASE[pdvId] ?? 150000;
    const totalVentas = Math.round(base * (0.8 + Math.random() * 0.35));
    const diferenciaCaja = Math.random() > 0.85 ? -Math.round(2000 + Math.random() * 8000) : 0;
    filas.push({
      turnoId: turnoId++,
      fecha: d.toISOString().slice(0, 10),
      vendedor: vendedor?.nombre ?? "Sin asignar",
      vendedorId: vendedor?.id ?? null,
      totalVentas,
      ventaEfectivo: Math.round(totalVentas * 0.55),
      ventaTarjeta: Math.round(totalVentas * 0.3),
      ventaTransferencia: Math.round(totalVentas * 0.15),
      efectivoDeclarado: Math.round(totalVentas * 0.55) + diferenciaCaja,
      diferenciaCaja,
    });
  }
  return { filas: filas.reverse(), vendedores: VENDEDORES().map((v) => ({ id: v.id, nombre: v.nombre })) };
}

// ─── Router ──────────────────────────────────────────────────────────────────

interface Peticion { metodo: string; path: string; query: Record<string, string>; body: unknown }

function ok<T>(data: T) {
  return delay({ data });
}

function parseEndpoint(endpoint: string) {
  const [path, queryStr] = endpoint.split("?");
  const query = Object.fromEntries(new URLSearchParams(queryStr ?? ""));
  return { path, query };
}

export function esRutaDemo(endpoint: string): boolean {
  return !endpoint.startsWith("/auth/");
}

export function resolverFixtureDemo(metodo: string, endpoint: string, body: unknown): Promise<unknown> | null {
  const { path, query } = parseEndpoint(endpoint);
  const p: Peticion = { metodo, path, query, body };
  const m = (regex: RegExp) => path.match(regex);

  // ── Notificaciones ──
  if (p.metodo === "GET" && path === "/notificaciones/sin-leer") return ok({ count: notificaciones.filter((n) => !n.leida).length });
  if (p.metodo === "GET" && path === "/notificaciones") return ok(notificaciones);
  if (p.metodo === "PATCH" && path === "/notificaciones/leer-todas") { notificaciones = notificaciones.map((n) => ({ ...n, leida: true })); return ok({}); }
  if (p.metodo === "PATCH" && m(/^\/notificaciones\/(\d+)\/leer$/)) {
    const id = Number(m(/^\/notificaciones\/(\d+)\/leer$/)![1]);
    notificaciones = notificaciones.map((n) => (n.id === id ? { ...n, leida: true } : n));
    return ok({});
  }

  // ── PDVs ──
  if (p.metodo === "GET" && path === "/admin/pdvs" && query.todos !== "true") return ok(pdvs.filter((x) => x.activo));
  if (p.metodo === "GET" && path === "/admin/pdvs" && query.todos === "true") return ok(pdvs);
  if (p.metodo === "POST" && path === "/admin/pdvs") {
    const b = body as { nombre: string; tipo: "PUNTO_VENTA" | "BODEGA" };
    const nuevo = { id: nextPdvId++, nombre: b.nombre, tipo: b.tipo, activo: true };
    pdvs = [...pdvs, nuevo];
    return ok(nuevo);
  }
  if (p.metodo === "PATCH" && m(/^\/admin\/pdvs\/(\d+)$/)) {
    const id = Number(m(/^\/admin\/pdvs\/(\d+)$/)![1]);
    const b = body as { nombre: string };
    pdvs = pdvs.map((x) => (x.id === id ? { ...x, nombre: b.nombre } : x));
    return ok(pdvs.find((x) => x.id === id));
  }
  if (p.metodo === "PATCH" && m(/^\/admin\/pdvs\/(\d+)\/estado$/)) {
    const id = Number(m(/^\/admin\/pdvs\/(\d+)\/estado$/)![1]);
    const b = body as { activo: boolean };
    pdvs = pdvs.map((x) => (x.id === id ? { ...x, activo: b.activo } : x));
    return ok(pdvs.find((x) => x.id === id));
  }
  if (p.metodo === "DELETE" && m(/^\/admin\/pdvs\/(\d+)$/)) {
    const id = Number(m(/^\/admin\/pdvs\/(\d+)$/)![1]);
    pdvs = pdvs.filter((x) => x.id !== id);
    return ok({ mensaje: "Sucursal eliminada" });
  }

  // ── Dashboard ──
  if (p.metodo === "GET" && path === "/admin/resumen-diario") return ok(resumenDiario(query.fecha ?? fechaHace(0)));
  if (p.metodo === "GET" && path === "/proveedores/facturas/resumen") {
    const mes = query.mes ?? mesActual();
    const delMes = facturas.filter((f) => f.fecha.slice(0, 7) === mes);
    return ok({
      mes,
      totalFacturas: delMes.length,
      montoTotal: delMes.reduce((s, f) => s + f.montoTotal, 0),
      pendiente: delMes.filter((f) => f.estado === "PENDIENTE").reduce((s, f) => s + f.montoTotal, 0),
      pagada: delMes.filter((f) => f.estado === "PAGADA").reduce((s, f) => s + f.montoTotal, 0),
    });
  }
  if (p.metodo === "GET" && path === "/cierres-preventivos/hoy") {
    const hoyStr = fechaHace(0);
    return ok(cierresPreventivos.filter((c) => c.fecha.slice(0, 10) === hoyStr).map((c) => c.pdvId));
  }

  // ── Ventas por sucursal / historial ──
  if (p.metodo === "GET" && path === "/admin/ventas-sucursal") return ok(resumenVentasSucursal(Number(query.pdvId), query.fecha));
  if (p.metodo === "GET" && path === "/admin/historial-turnos") return ok(historialTurnos(Number(query.pdvId), query.desde, query.hasta));
  if (p.metodo === "GET" && m(/^\/admin\/vendedores\/(\d+)\/faltantes$/)) {
    const uid_ = Number(m(/^\/admin\/vendedores\/(\d+)\/faltantes$/)![1]);
    const u = usuarios.find((x) => x.id === uid_);
    if (!u || !u.pdvId) return ok([]);
    return ok([
      { turnoId: 7001, fecha: fechaHace(4), pdvNombre: u.pdvNombre ?? "", faltante: 5000 },
    ]);
  }
  if (p.metodo === "POST" && m(/^\/pos\/turnos\/(\d+)\/retiros$/)) return ok({ mensaje: "Retiro registrado" });

  // ── Solicitudes ──
  if (p.metodo === "GET" && path === "/solicitudes") return ok(solicitudes);
  if (p.metodo === "POST" && path === "/solicitudes") {
    const b = body as { pdvId: number; items: { productoId: number; cantidad: number }[]; notas?: string };
    const nueva = { id: nextSolicitudId++, pdvId: b.pdvId, pdvNombre: pdvs.find((x) => x.id === b.pdvId)?.nombre ?? "", solicitante: "Usuario Demo", fecha: new Date().toISOString(), estado: "PENDIENTE" as const, items: b.items.map((it, i) => ({ id: i + 1, producto: stockBodega.find((s) => s.productoId === it.productoId)?.nombre ?? "Producto", cantidad: it.cantidad })), notas: b.notas ?? null };
    solicitudes = [nueva, ...solicitudes];
    return ok(nueva);
  }
  if (p.metodo === "PATCH" && m(/^\/solicitudes\/(\d+)\/despachar$/)) {
    const id = Number(m(/^\/solicitudes\/(\d+)\/despachar$/)![1]);
    solicitudes = solicitudes.map((s) => (s.id === id ? { ...s, estado: "DESPACHADA" as const } : s));
    return ok(solicitudes.find((s) => s.id === id));
  }
  if (p.metodo === "PATCH" && m(/^\/solicitudes\/(\d+)\/confirmar$/)) {
    const id = Number(m(/^\/solicitudes\/(\d+)\/confirmar$/)![1]);
    solicitudes = solicitudes.map((s) => (s.id === id ? { ...s, estado: "CONFIRMADA" as const } : s));
    return ok(solicitudes.find((s) => s.id === id));
  }

  // ── Bodega: stock ──
  if (p.metodo === "GET" && path === "/bodega/stock") return ok(stockBodega);
  if (p.metodo === "GET" && path === "/bodega/categorias") return ok(categorias);
  if (p.metodo === "GET" && path === "/bodega/despachos") return ok(despachos);
  if (p.metodo === "GET" && path === "/bodega/historial") return ok(historialInventario);
  if (p.metodo === "GET" && path === "/bodega/buscar-codigo") return Promise.reject(new Error("Producto no encontrado"));
  if (p.metodo === "PATCH" && m(/^\/bodega\/stock\/(\d+)$/)) {
    const id = Number(m(/^\/bodega\/stock\/(\d+)$/)![1]);
    const b = body as { nombre?: string; stockActual: number; stockCritico: number };
    stockBodega = stockBodega.map((it) => (it.inventarioId === id ? { ...it, nombre: b.nombre ?? it.nombre, stockActual: b.stockActual, stockCritico: b.stockCritico } : it));
    return ok(stockBodega.find((it) => it.inventarioId === id));
  }
  if (p.metodo === "DELETE" && m(/^\/bodega\/stock\/(\d+)$/)) {
    const id = Number(m(/^\/bodega\/stock\/(\d+)$/)![1]);
    stockBodega = stockBodega.filter((it) => it.inventarioId !== id);
    return ok({ eliminado: id });
  }
  if (p.metodo === "POST" && path === "/bodega/productos") {
    const b = body as { nombre: string; categoriaNombre?: string; categoriaId?: number; precioVenta: number; stockActual: number; stockCritico: number };
    const cat = categorias.find((c) => c.id === b.categoriaId)?.nombre ?? b.categoriaNombre ?? "Otros";
    const nuevo: ItemBodegaDemo = { inventarioId: nextInventarioId++, productoId: nextProductoId++, nombre: b.nombre, categoria: cat, precioVenta: b.precioVenta, stockActual: b.stockActual, stockCritico: b.stockCritico };
    stockBodega = [...stockBodega, nuevo];
    return ok(nuevo);
  }
  if (p.metodo === "POST" && path === "/bodega/stock/lote") {
    const b = body as { items: { inventarioId: number; ingresos: number; utilizadas: number }[] };
    const itemsHist: HistorialItemDemo[] = [];
    stockBodega = stockBodega.map((it) => {
      const cambio = b.items.find((x) => x.inventarioId === it.inventarioId);
      if (!cambio) return it;
      const saldoNuevo = it.stockActual + cambio.ingresos - cambio.utilizadas;
      itemsHist.push({ id: it.inventarioId, nombre: it.nombre, saldoAnterior: it.stockActual, ingresos: cambio.ingresos, utilizadas: cambio.utilizadas, saldoNuevo });
      return { ...it, stockActual: saldoNuevo };
    });
    historialInventario = [{
      loteId: uid("hist"), fecha: new Date().toISOString(), usuario: "Usuario Demo",
      cantidad: itemsHist.length,
      totalIngresos: itemsHist.reduce((s, x) => s + x.ingresos, 0),
      totalUtilizadas: itemsHist.reduce((s, x) => s + x.utilizadas, 0),
      items: itemsHist,
    }, ...historialInventario];
    return ok({ guardados: itemsHist.length });
  }

  // ── Bodega: despachos ──
  if (p.metodo === "POST" && path === "/bodega/despachos") {
    const b = body as { pdvDestinoId: number; items: { productoId: number; cantidad: number }[]; observacion?: string };
    const destino = pdvs.find((x) => x.id === b.pdvDestinoId)?.nombre ?? "Sucursal";
    despachos = [{
      loteId: uid("desp"), fecha: new Date().toISOString(), origen: "Bodega Central", destino,
      cantidadItems: b.items.length, totalUnidades: b.items.reduce((s, x) => s + x.cantidad, 0),
      items: b.items.map((it, i) => ({ id: i + 1, producto: stockBodega.find((s) => s.productoId === it.productoId)?.nombre ?? "Producto", cantidad: it.cantidad })),
    }, ...despachos];
    return ok({ mensaje: "Despacho registrado", destino });
  }

  // ── Finanzas ──
  if (p.metodo === "GET" && path === "/finanzas/depositos") return ok(depositos);
  if (p.metodo === "PATCH" && m(/^\/finanzas\/depositos\/(\d+)$/)) {
    const id = Number(m(/^\/finanzas\/depositos\/(\d+)$/)![1]);
    depositos = depositos.map((d) => (d.id === id ? { ...d, montoDepositado: d.montoADepositar, faltaDepositar: 0, estado: "Depositado" as const, fechaDeposito: fechaHace(0) } : d));
    return ok({});
  }

  // ── Facturas / proveedores ──
  if (p.metodo === "GET" && path === "/proveedores") return ok(proveedores);
  if (p.metodo === "POST" && path === "/proveedores") {
    const b = body as { nombre: string; rut?: string; contacto?: string; banco?: string; tipoCuenta?: string; numeroCuenta?: string };
    const nuevo: ProveedorDemo = { id: nextProveedorId++, nombre: b.nombre, rut: b.rut ?? null, contacto: b.contacto ?? null, activo: true, banco: b.banco ?? null, tipo_cuenta: b.tipoCuenta ?? null, numero_cuenta: b.numeroCuenta ?? null };
    proveedores = [...proveedores, nuevo];
    return ok(nuevo);
  }
  if (p.metodo === "PATCH" && m(/^\/proveedores\/(\d+)\/activo$/)) {
    const id = Number(m(/^\/proveedores\/(\d+)\/activo$/)![1]);
    const b = body as { activo: boolean };
    proveedores = proveedores.map((x) => (x.id === id ? { ...x, activo: b.activo } : x));
    return ok(proveedores.find((x) => x.id === id));
  }
  if (p.metodo === "PATCH" && m(/^\/proveedores\/(\d+)$/)) {
    const id = Number(m(/^\/proveedores\/(\d+)$/)![1]);
    proveedores = proveedores.map((x) => (x.id === id ? { ...x, ...(body as object) } : x));
    return ok(proveedores.find((x) => x.id === id));
  }
  if (p.metodo === "DELETE" && m(/^\/proveedores\/(\d+)$/)) {
    const id = Number(m(/^\/proveedores\/(\d+)$/)![1]);
    proveedores = proveedores.filter((x) => x.id !== id);
    return ok({ id });
  }
  if (p.metodo === "GET" && path === "/proveedores/facturas") {
    const mes = query.mes ?? mesActual();
    return ok(facturas.filter((f) => f.fecha.slice(0, 7) === mes));
  }
  if (p.metodo === "POST" && path === "/proveedores/facturas") {
    const b = body as { proveedorId: number; numeroFactura: string; fecha: string; fechaVencimiento?: string; montoTotal: number; notas?: string; items: { descripcion: string; cantidad: number; precioUnitario: number }[] };
    const nueva: FacturaDemo = {
      id: nextFacturaId++, proveedorId: b.proveedorId, proveedorNombre: proveedores.find((x) => x.id === b.proveedorId)?.nombre ?? "", numeroFactura: b.numeroFactura,
      fecha: b.fecha, fechaVencimiento: b.fechaVencimiento ?? null, montoTotal: b.montoTotal, estado: "PENDIENTE", notas: b.notas ?? null, creadoEn: new Date().toISOString(),
      items: b.items.map((it, i) => ({ id: i + 1, ...it })),
    };
    facturas = [nueva, ...facturas];
    return ok(nueva);
  }
  if (p.metodo === "PATCH" && m(/^\/proveedores\/facturas\/(\d+)\/estado$/)) {
    const id = Number(m(/^\/proveedores\/facturas\/(\d+)\/estado$/)![1]);
    const b = body as { estado: "PAGADA" | "ANULADA" };
    facturas = facturas.map((f) => (f.id === id ? { ...f, estado: b.estado } : f));
    return ok({ id });
  }
  if (p.metodo === "DELETE" && m(/^\/proveedores\/facturas\/(\d+)$/)) {
    const id = Number(m(/^\/proveedores\/facturas\/(\d+)$/)![1]);
    facturas = facturas.filter((f) => f.id !== id);
    return ok({ id });
  }

  // ── Cierre preventivo ──
  if (p.metodo === "GET" && path === "/cierres-preventivos/tareas") return ok(tareasChecklist);
  if (p.metodo === "POST" && path === "/cierres-preventivos/tareas") {
    const b = body as { label: string };
    const nueva = { id: nextTareaId++, label: b.label, orden: tareasChecklist.length + 1 };
    tareasChecklist = [...tareasChecklist, nueva];
    return ok(nueva);
  }
  if (p.metodo === "DELETE" && m(/^\/cierres-preventivos\/tareas\/(\d+)$/)) {
    const id = Number(m(/^\/cierres-preventivos\/tareas\/(\d+)$/)![1]);
    tareasChecklist = tareasChecklist.filter((t) => t.id !== id);
    return ok({ id });
  }
  if (p.metodo === "GET" && path === "/cierres-preventivos") return ok(cierresPreventivos);
  if (p.metodo === "POST" && path === "/cierres-preventivos") {
    const b = body as { pdvId: number; montoRetiro: number; checklist: { label: string; marcado: boolean }[]; notasVendedor?: string; observaciones?: string };
    const nuevo = { id: nextCierreId++, pdvId: b.pdvId, pdvNombre: pdvs.find((x) => x.id === b.pdvId)?.nombre ?? "", usuarioNombre: "Usuario Demo", fecha: new Date().toISOString(), montoRetiro: b.montoRetiro, checklist: b.checklist, notasVendedor: b.notasVendedor ?? null, observaciones: b.observaciones ?? null };
    cierresPreventivos = [nuevo, ...cierresPreventivos];
    return ok(nuevo);
  }
  if (p.metodo === "DELETE" && m(/^\/cierres-preventivos\/(\d+)$/)) {
    const id = Number(m(/^\/cierres-preventivos\/(\d+)$/)![1]);
    cierresPreventivos = cierresPreventivos.filter((c) => c.id !== id);
    return ok({ id });
  }

  // ── RRHH: personal / turnos / nómina ──
  if (p.metodo === "GET" && path === "/rrhh/personal") {
    return ok(usuarios.filter((u) => u.rol === "VENDEDOR").map((u) => ({ id: u.id, nombre: u.nombre, rut: u.rut, email: u.email, pdvId: u.pdvId, pdvNombre: u.pdvNombre, pagoDiario: u.pagoDiario, activo: u.activo, ultimoTurno: u.ultimoTurno })));
  }
  if (p.metodo === "POST" && path === "/rrhh/personal") {
    const b = body as { nombre: string; rut: string; pdvId?: number; pagoDiario: number; email?: string };
    const nuevo: UsuarioDemo = { id: nextUsuarioId++, rut: b.rut, nombre: b.nombre, email: b.email ?? null, rol: "VENDEDOR", pdvId: b.pdvId ?? null, pdvNombre: pdvs.find((x) => x.id === b.pdvId)?.nombre ?? null, activo: true, pagoDiario: b.pagoDiario, ultimoTurno: null };
    usuarios = [...usuarios, nuevo];
    return ok(nuevo);
  }
  if (p.metodo === "PATCH" && m(/^\/rrhh\/personal\/(\d+)$/)) {
    const id = Number(m(/^\/rrhh\/personal\/(\d+)$/)![1]);
    const b = body as Partial<UsuarioDemo> & { pdvId?: number };
    usuarios = usuarios.map((u) => (u.id === id ? { ...u, ...b, pdvNombre: b.pdvId !== undefined ? (pdvs.find((x) => x.id === b.pdvId)?.nombre ?? null) : u.pdvNombre } : u));
    return ok(usuarios.find((u) => u.id === id));
  }
  if (p.metodo === "GET" && path === "/rrhh/turnos") {
    const mes = query.mes ?? mesActual();
    const [anio, mesNum] = mes.split("-").map(Number);
    const dias = mes === mesActual() ? new Date().getDate() : diasEnMes(mes);
    const filas = [];
    let id = 6000;
    for (const v of VENDEDORES()) {
      for (let d = Math.max(1, dias - 6); d <= dias; d++) {
        const fecha = `${anio}-${String(mesNum).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        filas.push({ id: id++, fecha, usuarioId: v.id, usuarioNombre: v.nombre, pdvId: v.pdvId ?? 0, pdvNombre: v.pdvNombre ?? "", estado: "CERRADO", horaApertura: `${fecha}T09:00:00`, horaCierre: `${fecha}T21:00:00` });
      }
    }
    return ok(filas);
  }
  if (p.metodo === "GET" && path === "/rrhh/nomina") {
    const mes = query.mes ?? mesActual();
    const dias = mes === mesActual() ? new Date().getDate() : diasEnMes(mes);
    return ok(VENDEDORES().map((v) => {
      const promedioVentaDiaria = Math.round(VENTA_BASE[v.pdvId ?? 2] ?? 150000);
      const diasTrabajados = Math.max(1, dias - Math.floor(Math.random() * 3));
      const pagoBase = diasTrabajados * v.pagoDiario;
      const bonos = Math.round(promedioVentaDiaria > 200000 ? diasTrabajados * 8000 : diasTrabajados * 3000);
      const descuentosCaja = Math.random() > 0.7 ? 8000 : 0;
      return { usuarioId: v.id, nombre: v.nombre, diasTrabajados, promedioVentaDiaria, pagoBase, bonos, descuentosCaja, sueldoLiquido: pagoBase + bonos - descuentosCaja };
    }));
  }

  // ── RRHH: horarios ──
  if (p.metodo === "GET" && path === "/rrhh/horarios") {
    const mes = query.mes ?? mesActual();
    return ok({ pdvs: pdvs.filter((x) => x.tipo === "PUNTO_VENTA" && x.activo).map((x) => ({ id: x.id, nombre: x.nombre })), grid: gridDelMes(mes) });
  }
  if (p.metodo === "PATCH" && m(/^\/rrhh\/horarios\/(\d+)$/)) {
    const id = Number(m(/^\/rrhh\/horarios\/(\d+)$/)![1]);
    const b = body as { usuarioId: number | null };
    const ubicacion = buscarCelda(id);
    if (ubicacion) {
      const grid = gridDelMes(ubicacion.fecha.slice(0, 7));
      const celda = grid[ubicacion.fecha][ubicacion.pdvId] as Record<string, unknown>;
      const vendedor = b.usuarioId ? usuarios.find((u) => u.id === b.usuarioId) : null;
      grid[ubicacion.fecha][ubicacion.pdvId] = { ...celda, vendedorPlaneado: vendedor ? { id: vendedor.id, nombre: vendedor.nombre } : null };
    }
    return Promise.resolve({ message: "Actualizado" });
  }
  if (p.metodo === "DELETE" && m(/^\/rrhh\/horarios\/(\d+)$/)) {
    const id = Number(m(/^\/rrhh\/horarios\/(\d+)$/)![1]);
    const ubicacion = buscarCelda(id);
    if (ubicacion) {
      const grid = gridDelMes(ubicacion.fecha.slice(0, 7));
      const celda = grid[ubicacion.fecha][ubicacion.pdvId] as Record<string, unknown>;
      grid[ubicacion.fecha][ubicacion.pdvId] = { ...celda, vendedorPlaneado: null };
    }
    return Promise.resolve({ message: "Eliminado" });
  }
  if (p.metodo === "DELETE" && m(/^\/rrhh\/horarios\/mes\/[\d-]+$/)) return ok({ eliminados: 0 });
  if (p.metodo === "POST" && path === "/rrhh/horarios/importar") {
    const b = body as { items?: { fecha: string; pdvId: number; usuarioId: number }[] };
    const items = b.items ?? [];
    for (const it of items) {
      const grid = gridDelMes(it.fecha.slice(0, 7));
      const vendedor = usuarios.find((u) => u.id === it.usuarioId);
      const celda = (grid[it.fecha]?.[it.pdvId] ?? {}) as Record<string, unknown>;
      grid[it.fecha] = {
        ...(grid[it.fecha] ?? {}),
        [it.pdvId]: {
          id: celda.id ?? Math.floor(Math.random() * 100000),
          vendedorPlaneado: vendedor ? { id: vendedor.id, nombre: vendedor.nombre } : null,
          vendedorReal: celda.vendedorReal ?? null,
          total: celda.total ?? null,
          estado: celda.estado ?? null,
          publicado: false,
        },
      };
    }
    return Promise.resolve({ message: "Importado", data: { procesados: items.length, importados: items.length, errores: [] } });
  }
  if (p.metodo === "POST" && path === "/rrhh/horarios/publicar") return ok({ publicados: VENDEDORES().length, vendedores: VENDEDORES().map((v) => v.nombre) });

  // ── RRHH: seguimiento ──
  if (p.metodo === "GET" && path === "/rrhh/seguimiento") {
    return ok(VENDEDORES().map((v) => {
      const promedioDiario = Math.round(VENTA_BASE[v.pdvId ?? 2] ?? 150000);
      const totalTurnos = 16 + Math.floor(Math.random() * 6);
      const totalVentas = promedioDiario * totalTurnos;
      const faltantes = Math.random() > 0.6 ? Math.round(3000 + Math.random() * 6000) : 0;
      return {
        id: v.id, nombre: v.nombre, rut: v.rut, pagoDiario: v.pagoDiario, activo: v.activo,
        totalTurnos, turnosCerrados: totalTurnos, totalVentas, promedioDiario,
        faltantes, sobrantes: Math.random() > 0.7 ? Math.round(2000 + Math.random() * 4000) : 0,
        turnosConFaltante: faltantes > 0 ? 1 : 0,
        porPDV: v.pdvId ? [{ pdvId: v.pdvId, pdvNombre: v.pdvNombre ?? "", dias: totalTurnos, ventas: totalVentas }] : [],
        historial: Array.from({ length: Math.min(6, totalTurnos) }, (_, i) => ({
          id: 5000 + v.id * 10 + i,
          fecha: fechaHace(i),
          pdvNombre: v.pdvNombre ?? "",
          total: Math.round(promedioDiario * (0.85 + Math.random() * 0.3)),
          diferencia: i === 1 && faltantes > 0 ? -faltantes : 0,
          estado: "CERRADO",
        })),
      };
    }));
  }

  // ── Config de bonos ──
  if (p.metodo === "GET" && path === "/config-bonos") {
    return ok(Object.entries(configBonos).map(([pdvId, tramos]) => ({
      pdvId: Number(pdvId), pdvNombre: pdvs.find((x) => x.id === Number(pdvId))?.nombre ?? "", activo: true, tramos,
    })));
  }
  if (p.metodo === "PUT" && m(/^\/config-bonos\/(\d+)$/)) {
    const pdvId = Number(m(/^\/config-bonos\/(\d+)$/)![1]);
    const b = body as { tramos: { umbral: number; monto: number }[] };
    configBonos[pdvId] = b.tramos.map((t) => ({ id: nextTramoId++, umbral: t.umbral, monto: t.monto, activo: true }));
    return ok({ pdvId, tramos: configBonos[pdvId] });
  }

  // ── Usuarios ──
  if (p.metodo === "GET" && path === "/usuarios") return ok(usuarios);
  if (p.metodo === "POST" && path === "/usuarios") {
    const b = body as { rut: string; nombre: string; email: string; rol: UsuarioDemo["rol"]; pdvId?: number; pagoDiario: number };
    const nuevo: UsuarioDemo = { id: nextUsuarioId++, rut: b.rut, nombre: b.nombre, email: b.email, rol: b.rol, pdvId: b.pdvId ?? null, pdvNombre: pdvs.find((x) => x.id === b.pdvId)?.nombre ?? null, activo: true, pagoDiario: b.pagoDiario, ultimoTurno: null };
    usuarios = [...usuarios, nuevo];
    return ok({ ...nuevo, correoEnviado: false });
  }
  if (p.metodo === "PATCH" && m(/^\/usuarios\/(\d+)\/estado$/)) {
    const id = Number(m(/^\/usuarios\/(\d+)\/estado$/)![1]);
    const b = body as { activo: boolean };
    usuarios = usuarios.map((u) => (u.id === id ? { ...u, activo: b.activo } : u));
    return ok(usuarios.find((u) => u.id === id));
  }
  if (p.metodo === "PATCH" && m(/^\/usuarios\/(\d+)$/)) {
    const id = Number(m(/^\/usuarios\/(\d+)$/)![1]);
    const b = body as Partial<UsuarioDemo>;
    usuarios = usuarios.map((u) => (u.id === id ? { ...u, ...b, pdvNombre: b.pdvId !== undefined ? (pdvs.find((x) => x.id === b.pdvId)?.nombre ?? null) : u.pdvNombre } : u));
    return ok(usuarios.find((u) => u.id === id));
  }
  if (p.metodo === "DELETE" && m(/^\/usuarios\/(\d+)$/)) {
    const id = Number(m(/^\/usuarios\/(\d+)$/)![1]);
    const u = usuarios.find((x) => x.id === id);
    usuarios = usuarios.filter((x) => x.id !== id);
    return ok({ eliminado: id, nombre: u?.nombre });
  }

  // Sin fixture específico: lib/api.ts lanza un error controlado (no llega a la red real)
  return null;
}
