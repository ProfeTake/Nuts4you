// ─── HorariosVendedoras ──────────────────────────────────────────────────────
// Módulo de planificación de horarios de personal.
// Permite importar turnos planeados desde un Excel (.xlsx) y visualizar el
// calendario mensual con el estado planeado vs real por PDV.
//
// Módulo: RRHH → Horarios
// API:
//   GET  /api/rrhh/horarios?mes=YYYY-MM  → grid mensual
//   GET  /api/rrhh/personal              → lista de vendedores activos
//   POST /api/rrhh/horarios/importar     → importar turnos desde Excel
//   PATCH /api/rrhh/horarios/:id         → editar turno planeado
//   DELETE /api/rrhh/horarios/:id        → eliminar turno planeado

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import {
  Upload,
  Calendar,
  FileSpreadsheet,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Trash2,
  Save,
  Plus,
  Download,
  Wand2,
  Zap,
  Send,
  CheckCircle2,
  Mail,
} from "lucide-react";
import { toast } from "sonner";

// shadcn/ui
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// API
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";

// ─── Tipos de dominio ────────────────────────────────────────────────────────

interface PDV {
  id: number;
  nombre: string;
}

interface Vendedor {
  id: number;
  nombre: string;
}

interface CeldaHorario {
  id: number | null;
  vendedorPlaneado: { id: number; nombre: string } | null;
  vendedorReal: { id: number; nombre: string } | null;
  total: number | null;
  estado: string | null;
  publicado: boolean;
}

interface HorariosAPI {
  data: {
    pdvs: PDV[];
    grid: Record<string, Record<number, CeldaHorario>>;
  };
}

interface PersonalAPI {
  data: { id: number; nombre: string; activo: boolean; email: string | null }[];
}

// ─── Tipos del parser Excel ──────────────────────────────────────────────────

interface ParseItem {
  fecha: string;          // YYYY-MM-DD
  pdvId: number;
  pdvNombre: string;
  celda: string;          // texto original de la celda
  usuarioId: number | null;
  usuarioNombre: string | null;
  matched: boolean;
}

interface ParseResult {
  items: ParseItem[];
  sinMatchar: string[];       // valores de celda que no pudieron matchearse
  columnasSinPDV: string[];   // columnas de cabecera que no matchearon PDV
  totalFilas: number;
}

// ─── Tipos de estado del panel de edición ───────────────────────────────────

type PanelEdicion = {
  celdaId: number;
  pdvNombre: string;
  fecha: string;
  vendedorActualId: number | null;
} | null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Genera los últimos 3 meses + el actual + los próximos 3 en formato YYYY-MM */
function generarOpcionesMes(): { valor: string; etiqueta: string }[] {
  const hoy   = new Date();
  const opciones: { valor: string; etiqueta: string }[] = [];
  const nombres = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  for (let delta = -3; delta <= 3; delta++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + delta, 1);
    const valor   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const etiqueta = `${nombres[d.getMonth()]} ${d.getFullYear()}`;
    opciones.push({ valor, etiqueta });
  }
  return opciones;
}

function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Fecha de hoy en Chile como YYYY-MM-DD (espejo del helper del backend).
 *  La grilla compara días calendario chilenos: usar la zona del navegador
 *  desfasaría el corte "pasado vs futuro" para usuarios fuera de Chile. */
function fechaHoyChile(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/** Devuelve todos los días de un mes dado como strings YYYY-MM-DD */
function diasDelMes(mesISO: string): string[] {
  const [anio, mes] = mesISO.split("-").map(Number);
  const total = new Date(anio, mes, 0).getDate(); // día 0 del mes siguiente = último del actual
  return Array.from({ length: total }, (_, i) => {
    const dia = String(i + 1).padStart(2, "0");
    return `${mesISO}-${dia}`;
  });
}

/** dd/MM (para mostrar en la grilla) */
function formatDiaCorto(fechaISO: string): string {
  const [, m, d] = fechaISO.split("-");
  return `${d}/${m}`;
}

/** Día de semana abreviado en español */
function diaSemana(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.split("-").map(Number);
  const d = new Date(anio, mes - 1, dia);
  return ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d.getDay()];
}

/** Normaliza string para comparaciones fuzzy: minúsculas, sin acentos */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Iniciales de un nombre (hasta 2 letras) */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

/** Formatea CLP sin decimales */
const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

// ─── Parser de Excel — formato real "Turnos Vendedoras 2026.xlsx" ─────────────
//
// Estructura por hoja (ej: "Mayo 2026"):
//   Fila 4 (idx 3):  cabecera ["","","Mall","Paseo","OPEN","Libre","","","","Mall","Paseo","OPEN","Libre",...]
//   Filas 6–21 (idx 5–20): datos
//
//   MITAD IZQUIERDA (días 1–15):
//     idx 0 = nombre día   (ignorar)
//     idx 1 = fecha "D-Mon" (ej: "1-May")
//     idx 2 = Mall Patio
//     idx 3 = Paseo Independencia
//     idx 4 = Open Plaza
//     idx 5 = "Libre": solo nombre → libre; "Nombre Baq" → Baquedano; "Nombre Rengo" → Rengo
//
//   MITAD DERECHA (días 16–31):
//     idx 7 = nombre día   (ignorar)
//     idx 8 = fecha "D-Mon"
//     idx 9 = Mall Patio
//     idx 10 = Paseo Independencia
//     idx 11 = Open Plaza
//     idx 12 = "Libre" (misma lógica)
//
//   Valores especiales: "Todas" / "" → feriado o vacío → ignorar

const MESES_EN: Record<string, string> = {
  Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06",
  Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12",
};

function parsearFechaExcel(celda: string, anio: string): string | null {
  const m = celda.trim().match(/^(\d{1,2})-([A-Za-z]{3})$/);
  if (!m) return null;
  const mes = MESES_EN[m[2]];
  if (!mes) return null;
  return `${anio}-${mes}-${m[1].padStart(2, "0")}`;
}

function esVacioOFeriado(s: string): boolean {
  const n = normalizar(s);
  return !n || n === "-" || n === "todas" || n === "libre" || n === "descanso";
}

function matchVendedor(celda: string, vendNorm: (Vendedor & { norm: string })[]): Vendedor | undefined {
  const cn = normalizar(celda.replace(/\s*(baq|rengo)\s*/gi, "").trim());
  if (!cn) return undefined;

  const cnParts = cn.split(/\s+/);

  return vendNorm.find((v) => {
    // 1. Coincidencia exacta completa
    if (v.norm === cn) return true;

    const vParts = v.norm.split(/\s+/);

    // 2. Alguna PALABRA completa del vendedor (≥ 4 chars) coincide exactamente
    //    con alguna palabra de la celda — evita que "ana" matchee "luisana"
    return vParts.some(
      (vw) => vw.length >= 4 && cnParts.some((cw) => cw === vw)
    );
  });
}

function pdvLibreDesde(celda: string, pdvBaq: PDV | undefined, pdvRengo: PDV | undefined): PDV | null {
  const lower = celda.toLowerCase();
  if (lower.includes("baq") && pdvBaq)   return pdvBaq;
  if (lower.includes("rengo") && pdvRengo) return pdvRengo;
  return null; // solo nombre = esta persona es libre ese día
}

// Mapeo número de mes → palabras clave para encontrar la hoja
const HOJA_KEYWORDS: Record<string, string[]> = {
  "01": ["ene", "enero"],   "02": ["feb", "febrero"],
  "03": ["mar", "marzo"],   "04": ["abr", "abril"],
  "05": ["may", "mayo"],    "06": ["jun", "junio"],
  "07": ["jul", "julio"],   "08": ["ago", "agosto"],
  "09": ["sep", "septiembre"], "10": ["oct", "octubre"],
  "11": ["nov", "noviembre"],  "12": ["dic", "diciembre"],
};

function parsearFormatoSimple(
  filas: string[][],
  headerIdx: number,
  pdvsNorm: (PDV & { norm: string })[],
  vendNorm: (Vendedor & { norm: string })[],
): ParseResult {
  const headerRow = filas[headerIdx];
  const findPDV = (texto: string) =>
    pdvsNorm.find((p) => {
      const nt = normalizar(texto);
      return nt.includes(p.norm) || p.norm.includes(nt);
    }) ?? null;

  const colPDV = headerRow.map((h, i) => (i === 0 ? null : findPDV(String(h))));
  const columnasSinPDV = headerRow
    .slice(1)
    .filter((h, i) => h && !colPDV[i + 1])
    .map(String);

  const items: ParseItem[] = [];
  const sinMatcharSet = new Set<string>();

  for (let r = headerIdx + 1; r < filas.length; r++) {
    const fila = filas[r];
    const fechaStr = String(fila[0] ?? '').trim();
    if (!fechaStr) continue;
    const m = fechaStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) continue;
    const fechaISO = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

    for (let c = 1; c < headerRow.length; c++) {
      const pdv = colPDV[c];
      if (!pdv) continue;
      const texto = String(fila[c] ?? '').trim();
      if (!texto || esVacioOFeriado(texto)) continue;
      const vend = matchVendedor(texto, vendNorm);
      if (!vend) sinMatcharSet.add(texto);
      items.push({
        fecha: fechaISO, pdvId: pdv.id, pdvNombre: pdv.nombre,
        celda: texto, usuarioId: vend?.id ?? null,
        usuarioNombre: vend?.nombre ?? null, matched: !!vend,
      });
    }
  }

  return {
    items,
    sinMatchar: [...sinMatcharSet],
    columnasSinPDV,
    totalFilas: filas.length - headerIdx - 1,
  };
}

function parsearExcel(buffer: ArrayBuffer, pdvs: PDV[], vendedores: Vendedor[], mes: string): ParseResult {
  const wb = XLSX.read(buffer, { type: "array", raw: false });

  // ── Seleccionar hoja que corresponde al mes ──
  const [anioMes, numMes] = mes.split("-");
  const keywords = HOJA_KEYWORDS[numMes] ?? [];
  const nombreHoja =
    wb.SheetNames.find((s) => {
      const sn = normalizar(s);
      return keywords.some((k) => sn.includes(k)) && sn.includes(anioMes);
    }) ??
    wb.SheetNames.find((s) => keywords.some((k) => normalizar(s).includes(k))) ??
    wb.SheetNames[wb.SheetNames.length - 1];

  const hoja = wb.Sheets[nombreHoja];

  const filas = XLSX.utils.sheet_to_json<string[]>(hoja, { header: 1, defval: "", raw: false }) as string[][];

  // Año viene del parámetro mes ("2026-05" → "2026")
  const anio = anioMes;

  // Detectar formato simple: buscar fila con "fecha" en col 0
  const pdvsNormLocal = pdvs.map((p) => ({ ...p, norm: normalizar(p.nombre) }));
  const vendNormLocal  = vendedores.map((v) => ({ ...v, norm: normalizar(v.nombre) }));
  for (let i = 0; i < Math.min(6, filas.length); i++) {
    if (normalizar(String(filas[i][0] ?? '')) === 'fecha') {
      return parsearFormatoSimple(filas, i, pdvsNormLocal, vendNormLocal);
    }
  }

  // Mapear PDVs disponibles
  const pdvsNorm  = pdvs.map((p) => ({ ...p, norm: normalizar(p.nombre) }));
  const vendNorm  = vendedores.map((v) => ({ ...v, norm: normalizar(v.nombre) }));

  const findPDV = (...palabras: string[]) =>
    pdvsNorm.find((p) => palabras.some((w) => p.norm.includes(normalizar(w))));

  const pdvMall  = findPDV("mall", "patio");
  const pdvPaseo = findPDV("paseo");
  const pdvOpen  = findPDV("open", "plaza");
  const pdvBaq   = findPDV("baquedano", "baq");
  const pdvRengo = findPDV("rengo");

  // Columnas fijas del Excel: [índice, PDV]
  const COLS_IZQ:  [number, PDV | undefined][] = [[2, pdvMall], [3, pdvPaseo], [4, pdvOpen]];
  const COLS_DER:  [number, PDV | undefined][] = [[9, pdvMall], [10, pdvPaseo], [11, pdvOpen]];
  const IDX_FECHA_IZQ = 1;
  const IDX_LIBRE_IZQ = 5;
  const IDX_FECHA_DER = 8;
  const IDX_LIBRE_DER = 12;

  const items:       ParseItem[] = [];
  const sinMatchar:  string[]    = [];
  const columnasSinPDV: string[] = [];
  let totalFilas = 0;

  // Procesar filas 6–21 (idx 5–20, según especificación del usuario)
  const FILA_INICIO = 5;
  const FILA_FIN    = Math.min(20, filas.length - 1);

  for (let r = FILA_INICIO; r <= FILA_FIN; r++) {
    const fila = filas[r];
    if (!fila) continue;

    // ── Procesador de una mitad (izquierda o derecha) ──
    const procesarMitad = (
      idxFecha: number,
      colsPDV: [number, PDV | undefined][],
      idxLibre: number
    ) => {
      const fechaStr = String(fila[idxFecha] ?? "").trim();
      if (!fechaStr) return;
      const fechaISO = parsearFechaExcel(fechaStr, anio);
      if (!fechaISO) return;

      totalFilas++;

      // Columnas Mall / Paseo / Open
      for (const [col, pdv] of colsPDV) {
        if (!pdv) continue;
        const texto = String(fila[col] ?? "").trim();
        if (esVacioOFeriado(texto)) continue;

        const vend = matchVendedor(texto, vendNorm);
        if (!vend && !sinMatchar.includes(texto)) sinMatchar.push(texto);

        items.push({
          fecha:         fechaISO,
          pdvId:         pdv.id,
          pdvNombre:     pdv.nombre,
          celda:         texto,
          usuarioId:     vend?.id ?? null,
          usuarioNombre: vend?.nombre ?? null,
          matched:       !!vend,
        });
      }

      // Columna "Libre" → solo agrega si tiene sufijo Baq/Rengo
      const libreTexto = String(fila[idxLibre] ?? "").trim();
      if (!esVacioOFeriado(libreTexto)) {
        const pdvLibre = pdvLibreDesde(libreTexto, pdvBaq, pdvRengo);
        if (pdvLibre) {
          const vend = matchVendedor(libreTexto, vendNorm);
          if (!vend && !sinMatchar.includes(libreTexto)) sinMatchar.push(libreTexto);
          items.push({
            fecha:         fechaISO,
            pdvId:         pdvLibre.id,
            pdvNombre:     pdvLibre.nombre,
            celda:         libreTexto,
            usuarioId:     vend?.id ?? null,
            usuarioNombre: vend?.nombre ?? null,
            matched:       !!vend,
          });
        }
        // Si es solo nombre (libre ese día) → no se agrega al calendario
      }
    };

    procesarMitad(IDX_FECHA_IZQ, COLS_IZQ, IDX_LIBRE_IZQ);
    procesarMitad(IDX_FECHA_DER, COLS_DER, IDX_LIBRE_DER);
  }

  // Reportar PDVs no reconocidos (Mall/Paseo/Open que no matchearon)
  if (!pdvMall)  columnasSinPDV.push("Mall Patio");
  if (!pdvPaseo) columnasSinPDV.push("Paseo Independencia");
  if (!pdvOpen)  columnasSinPDV.push("Open Plaza");

  return { items, sinMatchar, columnasSinPDV, totalFilas };
}

// ─── Descarga de plantilla Excel ─────────────────────────────────────────────

function descargarPlantilla(mes: string, pdvs: PDV[], etiquetaMes: string) {
  if (pdvs.length === 0) return;
  const dias = diasDelMes(mes);
  const filas: unknown[][] = [
    [`HORARIOS DE PERSONAL — ${etiquetaMes.toUpperCase()}`],
    [],
    ['FECHA', ...pdvs.map((p) => p.nombre)],
    ...dias.map((fecha) => {
      const [a, m, d] = fecha.split('-');
      return [`${d}/${m}/${a}`, ...pdvs.map(() => '')];
    }),
    [],
    ['Instrucciones:'],
    ['• Escriba el nombre del vendedor/a en cada celda (ej: María, Alexandra)'],
    ['• Deje vacío si no hay asignación ese día'],
    ['• Importa este archivo desde el botón "Importar Excel" cuando esté listo'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(filas);
  ws['!cols'] = [{ wch: 13 }, ...pdvs.map(() => ({ wch: 22 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, etiquetaMes);
  XLSX.writeFile(wb, `Horarios ${etiquetaMes}.xlsx`);
}

// ─── Algoritmo de auto-relleno ───────────────────────────────────────────────
// Regla: cada vendedor cumple N turnos CONSECUTIVOS en el mismo PDV antes de
// rotar al siguiente. Los bloques NO se reinician al cambiar de mes — continúan
// desde una fecha de referencia fija (01/01/2026) para mantener continuidad
// entre meses aunque se generen por separado.

const FECHA_REFERENCIA = "2026-01-01"; // ancla fija para calcular bloques

function generarHorarioAuto(
  vendedores: Vendedor[],
  pdvs:       PDV[],
  desde:      string,   // YYYY-MM-DD primer día del rango
  hasta:      string,   // YYYY-MM-DD último día del rango
  bloque:     number,   // turnos consecutivos por PDV (default 5)
): Array<{ fecha: string; pdvId: number; usuarioId: number }> {
  if (!vendedores.length || !pdvs.length) return [];

  const ref  = new Date(FECHA_REFERENCIA);
  const items: Array<{ fecha: string; pdvId: number; usuarioId: number }> = [];

  const dia = new Date(desde);
  const fin = new Date(hasta);

  while (dia <= fin) {
    const fechaISO   = dia.toISOString().slice(0, 10);
    const diasDesdeRef = Math.floor((dia.getTime() - ref.getTime()) / 86_400_000);
    const numBloque    = Math.floor(diasDesdeRef / bloque);

    for (let slot = 0; slot < pdvs.length; slot++) {
      const idxVendedor = (numBloque + slot) % vendedores.length;
      items.push({
        fecha:     fechaISO,
        pdvId:     pdvs[slot].id,
        usuarioId: vendedores[idxVendedor].id,
      });
    }

    dia.setDate(dia.getDate() + 1);
  }

  return items;
}

/** Último día de un mes dado como "YYYY-MM" */
function ultimoDiaMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(y, m, 0); // día 0 del mes siguiente = último del actual
  return `${mes}-${String(ultimo.getDate()).padStart(2, "0")}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// Componente principal
// ══════════════════════════════════════════════════════════════════════════════

interface HorariosTurnosProps {
  /** Modo consulta: solo ver la grilla, sin importar/editar/publicar.
   *  Usado por el rol SUPERVISOR (el backend también bloquea las mutaciones). */
  soloLectura?: boolean;
}

export function HorariosTurnos({ soloLectura = false }: HorariosTurnosProps = {}) {
  const queryClient = useQueryClient();

  const [mes, setMes]                               = useState(mesActual);
  const [importModalAbierto, setImportModalAbierto] = useState(false);
  const [parseResult, setParseResult]               = useState<ParseResult | null>(null);
  const [arrastrando, setArrastrando]               = useState(false);
  const [panelEdicion, setPanelEdicion]             = useState<PanelEdicion>(null);
  const [vendedorEditId, setVendedorEditId]         = useState<string>("");
  const [crearManual, setCrearManual]               = useState<{
    pdvId: number; pdvNombre: string; fecha: string;
  } | null>(null);
  const [vendedorNuevoId, setVendedorNuevoId]       = useState("");

  const [confirmarLimpiar, setConfirmarLimpiar] = useState(false);

  // ── Auto-relleno ─────────────────────────────────────────────────────────
  const [autoFillOpen,   setAutoFillOpen]   = useState(false);
  const [autoFillBloque, setAutoFillBloque] = useState(5);
  const [autoFillDesde,  setAutoFillDesde]  = useState(mes);
  const [autoFillHasta,  setAutoFillHasta]  = useState(mes);
  const [autoFillVends,  setAutoFillVends]  = useState<Set<number>>(new Set());
  const [autoFillPDVs,   setAutoFillPDVs]   = useState<Set<number>>(new Set());

  const inputRef = useRef<HTMLInputElement>(null);

  const opcionesMes = useMemo(() => generarOpcionesMes(), []);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: horariosData, isLoading: cargandoHorarios } = useQuery({
    queryKey: ["rrhh", "horarios", mes],
    queryFn: () =>
      apiGet<HorariosAPI>(`/rrhh/horarios?mes=${mes}`).then((r) => r.data),
  });

  const { data: personalData = [] } = useQuery({
    queryKey: ["rrhh", "personal"],
    queryFn: () =>
      apiGet<PersonalAPI>("/rrhh/personal").then((r) =>
        r.data.filter((p) => p.activo)
      ),
    // En modo consulta no se editan turnos, así que no se necesita (ni se puede,
    // por permisos) cargar el listado de personal.
    enabled: !soloLectura,
  });

  // Memoizados porque `?? []` / `?? {}` crean un objeto nuevo en cada render:
  // sin esto los useCallback/useMemo que dependen de ellos se recreaban siempre,
  // arrastrando a re-renderizar toda la grilla del mes en cada tecla.
  const pdvs: PDV[] = useMemo(() => horariosData?.pdvs ?? [], [horariosData]);
  const grid        = useMemo(() => horariosData?.grid ?? {}, [horariosData]);
  const dias        = useMemo(() => diasDelMes(mes), [mes]);

  // ── Mutaciones ────────────────────────────────────────────────────────────

  const mutImportar = useMutation({
    mutationFn: (payload: object) =>
      apiPost<{ message: string }>("/rrhh/horarios/importar", payload),
    onSuccess: (res) => {
      toast.success("Importación exitosa", { description: res.message });
      queryClient.invalidateQueries({ queryKey: ["rrhh", "horarios"] });
      setImportModalAbierto(false);
      setParseResult(null);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al importar"),
  });

  const mutEditar = useMutation({
    mutationFn: ({ id, usuarioId }: { id: number; usuarioId: number }) =>
      apiPatch<{ message: string }>(`/rrhh/horarios/${id}`, { usuarioId }),
    onSuccess: () => {
      toast.success("Turno actualizado");
      queryClient.invalidateQueries({ queryKey: ["rrhh", "horarios"] });
      setPanelEdicion(null);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al guardar"),
  });

  const mutEliminar = useMutation({
    mutationFn: (id: number) =>
      apiDelete<{ message: string }>(`/rrhh/horarios/${id}`),
    onSuccess: () => {
      toast.success("Turno eliminado");
      queryClient.invalidateQueries({ queryKey: ["rrhh", "horarios"] });
      setPanelEdicion(null);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al eliminar"),
  });

  const mutCrearManual = useMutation({
    mutationFn: (item: { fecha: string; pdvId: number; usuarioId: number }) =>
      apiPost<{ data: unknown }>("/rrhh/horarios/importar", { items: [item] }),
    onSuccess: () => {
      toast.success("Turno asignado");
      queryClient.invalidateQueries({ queryKey: ["rrhh", "horarios"] });
      setCrearManual(null);
      setVendedorNuevoId("");
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al asignar turno"),
  });

  const mutLimpiar = useMutation({
    mutationFn: (mes: string) =>
      apiDelete<{ data: { eliminados: number } }>(`/rrhh/horarios/mes/${mes}`),
    onSuccess: (res) => {
      toast.success(`${res.data.eliminados} turnos eliminados`);
      queryClient.invalidateQueries({ queryKey: ["rrhh", "horarios"] });
      setConfirmarLimpiar(false);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al limpiar"),
  });

  const mutAutoFill = useMutation({
    mutationFn: (items: Array<{ fecha: string; pdvId: number; usuarioId: number }>) =>
      apiPost<{ data: { procesados: number } }>("/rrhh/horarios/importar", { items }),
    onSuccess: (res) => {
      toast.success(`${res.data.procesados} turnos generados`);
      queryClient.invalidateQueries({ queryKey: ["rrhh", "horarios"] });
      setAutoFillOpen(false);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al generar horario"),
  });

  const mutDragFill = useMutation({
    mutationFn: (items: { fecha: string; pdvId: number; usuarioId: number }[]) =>
      apiPost<{ data: { procesados: number } }>("/rrhh/horarios/importar", { items }),
    onSuccess: (res) => {
      const n = res.data.procesados;
      toast.success(`${n} turno${n !== 1 ? "s" : ""} asignado${n !== 1 ? "s" : ""}`);
      queryClient.invalidateQueries({ queryKey: ["rrhh", "horarios"] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al rellenar turnos"),
  });

  const [publicarOpen, setPublicarOpen] = useState(false);

  const mutPublicar = useMutation({
    mutationFn: () =>
      apiPost<{ data: { publicados: number; vendedores: string[] } }>(
        "/rrhh/horarios/publicar", { mes }
      ),
    onSuccess: (res) => {
      toast.success(
        `Horario publicado — ${res.data.publicados} vendedor${res.data.publicados !== 1 ? "es" : ""} notificado${res.data.publicados !== 1 ? "s" : ""}`
      );
      setPublicarOpen(false);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al publicar"),
  });

  const abrirAutoFill = useCallback(() => {
    setAutoFillDesde(mes);
    setAutoFillHasta(mes);
    setAutoFillBloque(5);
    setAutoFillVends(new Set(personalData.map((v) => v.id)));
    setAutoFillPDVs(new Set(pdvs.map((p) => p.id)));
    setAutoFillOpen(true);
  }, [mes, personalData, pdvs]);

  const confirmarAutoFill = useCallback(() => {
    const vends = personalData.filter((v) => autoFillVends.has(v.id));
    const pvds  = pdvs.filter((p) => autoFillPDVs.has(p.id));
    const items = generarHorarioAuto(
      vends, pvds,
      `${autoFillDesde}-01`,
      ultimoDiaMes(autoFillHasta),
      autoFillBloque,
    );
    if (!items.length) { toast.error("Sin turnos para generar con esos parámetros"); return; }
    mutAutoFill.mutate(items);
  }, [personalData, pdvs, autoFillVends, autoFillPDVs, autoFillDesde, autoFillHasta, autoFillBloque, mutAutoFill]);

  // ── Handlers de importación ──────────────────────────────────────────────

  const procesarArchivo = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
        toast.error("Solo se aceptan archivos .xlsx o .xls");
        return;
      }
      const buffer = await file.arrayBuffer();
      const result = parsearExcel(buffer, pdvs, personalData, mes);
      setParseResult(result);
    },
    [pdvs, personalData, mes]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setArrastrando(false);
      const file = e.dataTransfer.files[0];
      if (file) void procesarArchivo(file);
    },
    [procesarArchivo]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void procesarArchivo(file);
    },
    [procesarArchivo]
  );

  const confirmarImportacion = useCallback(() => {
    if (!parseResult) return;
    const items = parseResult.items
      .filter((i) => i.matched && i.usuarioId !== null)
      .map((i) => ({ fecha: i.fecha, pdvId: i.pdvId, usuarioId: i.usuarioId! }));
    if (items.length === 0) { toast.error("No hay turnos válidos para importar"); return; }
    mutImportar.mutate({ items });
  }, [parseResult, mutImportar]);

  // ── Handler de edición de celda ──────────────────────────────────────────

  const abrirEdicion = useCallback(
    (celdaId: number, pdvNombre: string, fecha: string, vendedorActualId: number | null) => {
      setPanelEdicion({ celdaId, pdvNombre, fecha, vendedorActualId });
      setVendedorEditId(vendedorActualId ? String(vendedorActualId) : "");
    },
    []
  );

  const abrirCrear = useCallback(
    (pdvId: number, pdvNombre: string, fecha: string) => {
      setCrearManual({ pdvId, pdvNombre, fecha });
      setVendedorNuevoId("");
    },
    []
  );

  // ── Navegación de mes ───────────────────────────────────────────────────

  const irMesAnterior = useCallback(() => {
    const idx = opcionesMes.findIndex((o) => o.valor === mes);
    if (idx > 0) setMes(opcionesMes[idx - 1].valor);
  }, [mes, opcionesMes]);

  const irMesSiguiente = useCallback(() => {
    const idx = opcionesMes.findIndex((o) => o.valor === mes);
    if (idx < opcionesMes.length - 1) setMes(opcionesMes[idx + 1].valor);
  }, [mes, opcionesMes]);

  const etiquetaMes = opcionesMes.find((o) => o.valor === mes)?.etiqueta ?? mes;
  const idxMes      = opcionesMes.findIndex((o) => o.valor === mes);

  // ── Verificar si hay algún dato en la grilla ─────────────────────────────

  const hayDatos = useMemo(
    () => Object.keys(grid).some((fecha) => Object.keys(grid[fecha] ?? {}).length > 0),
    [grid]
  );

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Horarios de Personal</h1>
        <p className="text-sm text-muted-foreground">
          {soloLectura
            ? "Consulta la planificación mensual de turnos por sucursal (solo lectura)."
            : "Planificación mensual de turnos por sucursal — importa desde Excel y compara con los turnos reales."}
        </p>
      </div>

      <Separator />

      {/* ── Barra de controles ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Selector de mes — grilla tipo calendario */}
        <div className="flex items-center gap-1 rounded-lg border bg-background shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-l-lg"
            onClick={irMesAnterior}
            disabled={idxMes === 0}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <SelectorMesPicker
            mes={mes}
            opciones={opcionesMes}
            onChange={setMes}
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-r-lg"
            onClick={irMesSiguiente}
            disabled={idxMes === opcionesMes.length - 1}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Acciones de edición: ocultas en modo consulta (SUPERVISOR) */}
        {!soloLectura && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => descargarPlantilla(mes, pdvs, etiquetaMes)}
              disabled={pdvs.length === 0}
              className="gap-1.5"
            >
              <Download className="size-4" />
              Descargar Plantilla
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setImportModalAbierto(true)}
              className="gap-1.5"
            >
              <FileSpreadsheet className="size-4" />
              Importar Excel
            </Button>

            <Button
              size="sm"
              onClick={abrirAutoFill}
              disabled={personalData.length === 0 || pdvs.length === 0}
              className="gap-1.5"
            >
              <Wand2 className="size-4" />
              Generar automático
            </Button>

            {hayDatos && (
              <Button
                size="sm"
                onClick={() => setPublicarOpen(true)}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Send className="size-4" />
                Publicar horario
              </Button>
            )}

            {hayDatos && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmarLimpiar(true)}
                className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-400 dark:hover:bg-red-950/30"
              >
                <Trash2 className="size-4" />
                Limpiar mes
              </Button>
            )}
          </>
        )}

      </div>

      {/* ── Grilla de calendario — siempre visible ── */}
      {cargandoHorarios ? (
        <div className="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Cargando horarios…
        </div>
      ) : (
        <GrillaCalendario
          dias={dias}
          pdvs={pdvs}
          grid={grid}
          soloLectura={soloLectura}
          onEditarCelda={abrirEdicion}
          onAgregarCelda={abrirCrear}
          onBulkCrear={(items) => mutDragFill.mutate(items)}
        />
      )}

      {/* ── Leyenda ── */}
      {!cargandoHorarios && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex size-5 items-center justify-center rounded bg-blue-100 text-blue-700 font-bold text-[10px] dark:bg-blue-900/40 dark:text-blue-300">P</span>
            <span>Planeado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] px-1 py-0.5 dark:bg-emerald-900/40 dark:text-emerald-300">
              <Send className="size-2.5" />P
            </span>
            <span>Publicado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] px-1 py-0.5 dark:bg-emerald-900/40 dark:text-emerald-300">
              <Check className="size-2.5" />C
            </span>
            <span>Confirmado (turno real)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex size-5 items-center justify-center rounded bg-orange-100 text-orange-700 font-bold text-[10px] dark:bg-orange-900/40 dark:text-orange-300">C</span>
            <span>Cambio de vendedor/a</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex size-5 items-center justify-center rounded bg-slate-100 text-slate-600 font-bold text-[10px] dark:bg-slate-800 dark:text-slate-300">R</span>
            <span>Solo real (sin plan)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5 rounded bg-red-100 text-red-700 text-[10px] px-1 py-0.5 dark:bg-red-900/40 dark:text-red-300">
              <X className="size-2.5" />N
            </span>
            <span>No llegó (día pasado sin turno)</span>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BOTTOM SHEET: Importar Excel
          ══════════════════════════════════════════════════════════════════════ */}
      {importModalAbierto && (
        <BottomSheet onClose={() => { setImportModalAbierto(false); setParseResult(null); }}>
          {/* Cabecera fija */}
          <div className="sticky top-0 bg-background px-4 pt-5 pb-3 border-b z-10">
            <Handle />
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-emerald-600" />
              <h2 className="text-lg font-bold">Importar Excel de Turnos</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Sube el archivo <em>turnos vendedoras 2026.xlsx</em> para planificar{" "}
              <strong>{etiquetaMes}</strong>.
            </p>
          </div>

          <div className="px-4 py-5 space-y-5 overflow-y-auto">
            {/* Zona de drop */}
            <div
              className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors cursor-pointer ${
                arrastrando
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"
              }`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={onDrop}
            >
              <Upload className="size-8 mb-3 text-muted-foreground/50" />
              <p className="text-sm font-medium">
                {arrastrando ? "Suelta el archivo aquí" : "Haz clic o arrastra un archivo .xlsx"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Solo archivos Excel (.xlsx, .xls)</p>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={onFileChange}
              />
            </div>

            {/* Resultado del parse */}
            {parseResult && (
              <div className="space-y-4">
                {/* Resumen */}
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-muted px-3 py-1">
                    {parseResult.totalFilas} filas
                  </span>
                  <span className="rounded-full bg-muted px-3 py-1">
                    {parseResult.items.length} turnos encontrados
                  </span>
                  <span className={`rounded-full px-3 py-1 font-medium ${
                    parseResult.items.filter((i) => i.matched).length === parseResult.items.length
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  }`}>
                    {parseResult.items.filter((i) => i.matched).length} identificados
                  </span>
                  {parseResult.sinMatchar.length > 0 && (
                    <span className="rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 px-3 py-1 font-medium">
                      {parseResult.sinMatchar.length} sin match
                    </span>
                  )}
                </div>

                {/* Advertencias */}
                {(parseResult.columnasSinPDV.length > 0 || parseResult.sinMatchar.length > 0) && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                      <AlertCircle className="size-3.5 shrink-0" />
                      Advertencias de importación
                    </div>
                    {parseResult.columnasSinPDV.length > 0 && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Columnas sin sucursal coincidente:{" "}
                        <strong>{parseResult.columnasSinPDV.join(", ")}</strong>
                      </p>
                    )}
                    {parseResult.sinMatchar.length > 0 && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Vendedoras no encontradas:{" "}
                        <strong>{parseResult.sinMatchar.join(", ")}</strong>
                      </p>
                    )}
                  </div>
                )}

                {/* Tabla de preview */}
                {parseResult.items.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs min-w-[400px]">
                      <thead>
                        <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Fecha</th>
                          <th className="px-3 py-2 font-medium">Sucursal</th>
                          <th className="px-3 py-2 font-medium">Celda Excel</th>
                          <th className="px-3 py-2 font-medium">Vendedor/a</th>
                          <th className="px-3 py-2 font-medium text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parseResult.items.map((item, idx) => (
                          <tr
                            key={idx}
                            className={`border-b last:border-0 ${
                              item.matched ? "" : "bg-red-50/60 dark:bg-red-950/20"
                            }`}
                          >
                            <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">
                              {formatDiaCorto(item.fecha)}
                            </td>
                            <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                              {item.pdvNombre}
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground">{item.celda}</td>
                            <td className={`px-3 py-1.5 font-medium ${
                              item.matched ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"
                            }`}>
                              {item.usuarioNombre ?? "—"}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {item.matched ? (
                                <Check className="size-3.5 text-emerald-600 inline" />
                              ) : (
                                <X className="size-3.5 text-red-500 inline" />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Pie fijo */}
          <div className="sticky bottom-0 bg-background border-t px-4 py-3 flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => { setImportModalAbierto(false); setParseResult(null); }}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 gap-1.5"
              disabled={
                !parseResult ||
                parseResult.items.filter((i) => i.matched).length === 0 ||
                mutImportar.isPending
              }
              onClick={confirmarImportacion}
            >
              {mutImportar.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Confirmar importación
              {parseResult && parseResult.items.filter((i) => i.matched).length > 0 && (
                <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-xs font-bold tabular-nums">
                  {parseResult.items.filter((i) => i.matched).length}
                </span>
              )}
            </Button>
          </div>
        </BottomSheet>
      )}

      {/* ══ BOTTOM SHEET: Crear turno manual ══ */}
      {crearManual && (
        <BottomSheet onClose={() => { setCrearManual(null); setVendedorNuevoId(""); }}>
          <div className="px-4 pt-5 pb-6 space-y-4">
            <Handle />
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Plus className="size-4 text-muted-foreground" />
                <h2 className="text-base font-bold">Asignar turno</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {crearManual.pdvNombre} — {formatDiaCorto(crearManual.fecha)}
              </p>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="sel-nuevo">
                Vendedor/a
              </label>
              <select
                id="sel-nuevo"
                value={vendedorNuevoId}
                onChange={(e) => setVendedorNuevoId(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Seleccionar vendedor/a —</option>
                {personalData.map((v) => (
                  <option key={v.id} value={String(v.id)}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setCrearManual(null); setVendedorNuevoId(""); }}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 gap-1.5"
                disabled={!vendedorNuevoId || mutCrearManual.isPending}
                onClick={() => {
                  if (vendedorNuevoId && crearManual) {
                    mutCrearManual.mutate({
                      fecha: crearManual.fecha,
                      pdvId: crearManual.pdvId,
                      usuarioId: parseInt(vendedorNuevoId, 10),
                    });
                  }
                }}
              >
                {mutCrearManual.isPending
                  ? <Loader2 className="size-4 animate-spin" />
                  : <Save className="size-4" />}
                Asignar
              </Button>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BOTTOM SHEET: Editar celda planeada
          ══════════════════════════════════════════════════════════════════════ */}
      {panelEdicion && (
        <BottomSheet onClose={() => setPanelEdicion(null)}>
          <div className="px-4 pt-5 pb-6 space-y-4">
            <Handle />
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Calendar className="size-4 text-muted-foreground" />
                <h2 className="text-base font-bold">Turno planeado</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {panelEdicion.pdvNombre} — {formatDiaCorto(panelEdicion.fecha)}
              </p>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="sel-vendedor">
                Vendedor/a asignado/a
              </label>
              <select
                id="sel-vendedor"
                value={vendedorEditId}
                onChange={(e) => setVendedorEditId(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Sin asignar —</option>
                {personalData.map((v) => (
                  <option key={v.id} value={String(v.id)}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setPanelEdicion(null)}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 gap-1.5"
                  disabled={!vendedorEditId || mutEditar.isPending}
                  onClick={() => {
                    if (vendedorEditId) {
                      mutEditar.mutate({
                        id: panelEdicion.celdaId,
                        usuarioId: parseInt(vendedorEditId, 10),
                      });
                    }
                  }}
                >
                  {mutEditar.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Guardar
                </Button>
              </div>
              <Button
                variant="outline"
                className="w-full gap-1.5 text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400 dark:hover:bg-red-950/30"
                disabled={mutEliminar.isPending}
                onClick={() => mutEliminar.mutate(panelEdicion.celdaId)}
              >
                {mutEliminar.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Eliminar turno
              </Button>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* ══ BOTTOM SHEET: Publicar horario ══ */}
      {publicarOpen && (
        <BottomSheet onClose={() => !mutPublicar.isPending && setPublicarOpen(false)}>
          <div className="px-4 pt-5 pb-6 space-y-4">
            <Handle />
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
                <Send className="size-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-base font-bold">Publicar horario de {etiquetaMes}</h2>
                <p className="text-sm text-muted-foreground">
                  Se notificará a cada vendedor/a con sus turnos asignados.
                </p>
              </div>
            </div>

            <Separator />

            {/* Resumen por vendedor */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                Vendedores con turnos asignados este mes
              </p>
              {(() => {
                // Mapa id → email de personal
                const emailPorId = new Map(personalData.map((p) => [p.id, p.email]));

                // Agrupar planeados por vendedor (id → { nombre, dias, email })
                const resumen = new Map<number, { nombre: string; dias: number; email: string | null }>();
                Object.entries(grid).forEach(([, pdvMap]) => {
                  Object.values(pdvMap).forEach((celda) => {
                    if (!celda.vendedorPlaneado) return;
                    const { id, nombre } = celda.vendedorPlaneado;
                    if (!resumen.has(id)) {
                      resumen.set(id, { nombre, dias: 0, email: emailPorId.get(id) ?? null });
                    }
                    resumen.get(id)!.dias++;
                  });
                });
                const entries = [...resumen.entries()];
                if (entries.length === 0) {
                  return <p className="text-sm text-muted-foreground">No hay turnos planeados para notificar.</p>;
                }
                const conCorreo = entries.filter(([, v]) => v.email).length;
                return (
                  <>
                    {entries.map(([id, info]) => (
                      <div key={id} className="flex items-center justify-between rounded-xl border px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                            {info.nombre.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-sm font-medium">{info.nombre}</span>
                            {info.email
                              ? <p className="text-[10px] text-sky-600 flex items-center gap-0.5"><Mail className="size-2.5" />{info.email}</p>
                              : <p className="text-[10px] text-muted-foreground/60">Sin correo configurado</p>}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {info.dias} día{info.dias !== 1 ? "s" : ""}
                        </span>
                      </div>
                    ))}
                    {conCorreo < entries.length && (
                      <p className="text-[11px] text-amber-600 pt-1">
                        {entries.length - conCorreo} vendedor{entries.length - conCorreo !== 1 ? "es" : ""} sin correo — solo recibirán notificación en el sistema. Configura el correo en RRHH → Personal.
                      </p>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="rounded-xl border border-sky-200 bg-sky-50 dark:bg-sky-950/20 dark:border-sky-800/40 px-4 py-3 flex gap-2.5">
              <Mail className="size-4 text-sky-600 shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p className="font-semibold text-foreground">Correo electrónico</p>
                <p>Los vendedores con correo configurado recibirán un email con sus turnos. El resto recibirá solo la notificación interna del sistema.</p>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline" className="flex-1"
                onClick={() => setPublicarOpen(false)}
                disabled={mutPublicar.isPending}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={mutPublicar.isPending || !hayDatos}
                onClick={() => mutPublicar.mutate()}
              >
                {mutPublicar.isPending
                  ? <Loader2 className="size-4 animate-spin" />
                  : <CheckCircle2 className="size-4" />}
                Confirmar y publicar
              </Button>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* ══ BOTTOM SHEET: Confirmar limpiar mes ══ */}
      {confirmarLimpiar && (
        <BottomSheet onClose={() => setConfirmarLimpiar(false)}>
          <div className="px-4 pt-5 pb-6 space-y-4">
            <Handle />
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40">
                <Trash2 className="size-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-bold">Limpiar horario de {etiquetaMes}</h2>
                <p className="text-sm text-muted-foreground">
                  Se eliminarán todos los turnos <strong>planeados</strong> del mes. Los turnos reales trabajados no se modifican.
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmarLimpiar(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="flex-1 gap-1.5"
                disabled={mutLimpiar.isPending}
                onClick={() => mutLimpiar.mutate(mes)}
              >
                {mutLimpiar.isPending
                  ? <Loader2 className="size-4 animate-spin" />
                  : <Trash2 className="size-4" />}
                Eliminar todos
              </Button>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* ══ BOTTOM SHEET: Generar horario automático ══ */}
      {autoFillOpen && (
        <BottomSheet onClose={() => setAutoFillOpen(false)}>
          <div className="px-4 pt-5 pb-6 space-y-5">
            <Handle />
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Wand2 className="size-4 text-primary" />
                <h2 className="text-base font-bold">Generar horario automático</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Cada vendedor/a trabajará <strong>{autoFillBloque} días consecutivos</strong> en el mismo PDV antes de rotar al siguiente. Los bloques continúan entre meses.
              </p>
            </div>

            <Separator />

            {/* Rango de meses */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Desde</label>
                <select
                  value={autoFillDesde}
                  onChange={(e) => setAutoFillDesde(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {opcionesMes.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hasta</label>
                <select
                  value={autoFillHasta}
                  onChange={(e) => setAutoFillHasta(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {opcionesMes
                    .filter((o) => o.valor >= autoFillDesde)
                    .map((o) => (
                      <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                    ))}
                </select>
              </div>
            </div>

            {/* Tamaño de bloque */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Turnos consecutivos por PDV: <strong className="text-primary">{autoFillBloque}</strong>
              </label>
              <input
                type="range" min={3} max={10} value={autoFillBloque}
                onChange={(e) => setAutoFillBloque(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>3 días</span><span>5 días (recomendado)</span><span>10 días</span>
              </div>
            </div>

            {/* Vendedores */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Vendedores/as incluidos</label>
                <button
                  className="text-xs text-primary underline"
                  onClick={() => setAutoFillVends(
                    autoFillVends.size === personalData.length
                      ? new Set()
                      : new Set(personalData.map((v) => v.id))
                  )}
                >
                  {autoFillVends.size === personalData.length ? "Deseleccionar todos" : "Seleccionar todos"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                {personalData.map((v) => (
                  <label key={v.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer hover:bg-muted/40 text-sm">
                    <input
                      type="checkbox"
                      checked={autoFillVends.has(v.id)}
                      onChange={(e) => {
                        const s = new Set(autoFillVends);
                        if (e.target.checked) s.add(v.id);
                        else s.delete(v.id);
                        setAutoFillVends(s);
                      }}
                      className="accent-primary"
                    />
                    {v.nombre}
                  </label>
                ))}
              </div>
            </div>

            {/* PDVs */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Sucursales incluidas</label>
              <div className="grid grid-cols-1 gap-1.5">
                {pdvs.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer hover:bg-muted/40 text-sm">
                    <input
                      type="checkbox"
                      checked={autoFillPDVs.has(p.id)}
                      onChange={(e) => {
                        const s = new Set(autoFillPDVs);
                        if (e.target.checked) s.add(p.id);
                        else s.delete(p.id);
                        setAutoFillPDVs(s);
                      }}
                      className="accent-primary"
                    />
                    {p.nombre}
                  </label>
                ))}
              </div>
            </div>

            {/* Resumen */}
            {autoFillVends.size > 0 && autoFillPDVs.size > 0 && (
              <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 flex items-start gap-2">
                <Zap className="size-4 text-primary shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p className="font-semibold text-foreground">Vista previa</p>
                  <p>
                    {autoFillVends.size} vendedor{autoFillVends.size !== 1 ? "es" : ""} ·{" "}
                    {autoFillPDVs.size} sucursal{autoFillPDVs.size !== 1 ? "es" : ""} ·{" "}
                    bloques de {autoFillBloque} días · rotación continua entre meses
                  </p>
                  {autoFillVends.size < autoFillPDVs.size && (
                    <p className="text-amber-600">
                      ⚠ Hay más sucursales ({autoFillPDVs.size}) que vendedores ({autoFillVends.size}) — algunos PDVs compartirán vendedor/a.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setAutoFillOpen(false)}>
                Cancelar
              </Button>
              <Button
                className="flex-1 gap-1.5"
                disabled={
                  autoFillVends.size === 0 || autoFillPDVs.size === 0 ||
                  autoFillDesde > autoFillHasta || mutAutoFill.isPending
                }
                onClick={confirmarAutoFill}
              >
                {mutAutoFill.isPending
                  ? <Loader2 className="size-4 animate-spin" />
                  : <Wand2 className="size-4" />}
                Generar horario
              </Button>
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

// ─── Subcomponente: Grilla de calendario ─────────────────────────────────────

interface GrillaProps {
  dias: string[];
  pdvs: PDV[];
  grid: Record<string, Record<number, CeldaHorario>>;
  soloLectura?: boolean;
  onEditarCelda: (celdaId: number, pdvNombre: string, fecha: string, vendedorActualId: number | null) => void;
  onAgregarCelda: (pdvId: number, pdvNombre: string, fecha: string) => void;
  onBulkCrear: (items: { fecha: string; pdvId: number; usuarioId: number }[]) => void;
}

function GrillaCalendario({ dias, pdvs, grid, soloLectura = false, onEditarCelda, onAgregarCelda, onBulkCrear }: GrillaProps) {
  const [dragInfo, setDragInfo] = useState<{
    pdvId: number;
    fechaInicio: string;
    vendedorId: number;
    fechaFin: string;
  } | null>(null);

  // Refs para que el mouseup global vea los valores actuales sin re-registrarse
  const dragInfoRef = useRef(dragInfo);
  const diasRef     = useRef(dias);
  const gridRef     = useRef(grid);
  const onBulkRef   = useRef(onBulkCrear);
  useEffect(() => { dragInfoRef.current = dragInfo; },     [dragInfo]);
  useEffect(() => { diasRef.current     = dias; },         [dias]);
  useEffect(() => { gridRef.current     = grid; },         [grid]);
  useEffect(() => { onBulkRef.current   = onBulkCrear; }, [onBulkCrear]);

  // Registrar mouseup global una sola vez — finaliza el drag-fill
  useEffect(() => {
    const onMouseUp = () => {
      const info = dragInfoRef.current;
      if (!info) return;
      const { pdvId, fechaInicio, vendedorId, fechaFin } = info;
      const allDias     = diasRef.current;
      const currentGrid = gridRef.current;
      const i = allDias.indexOf(fechaInicio);
      const j = allDias.indexOf(fechaFin);
      if (i !== -1 && j !== -1 && i !== j) {
        const [min, max] = i <= j ? [i, j] : [j, i];
        const items = allDias.slice(min, max + 1)
          .filter((fecha) => {
            if (fecha === fechaInicio) return false;
            const celda = (currentGrid[fecha] ?? {})[pdvId];
            return !celda?.vendedorPlaneado;
          })
          .map((fecha) => ({ fecha, pdvId, usuarioId: vendedorId }));
        if (items.length > 0) onBulkRef.current(items);
      }
      setDragInfo(null);
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, []);

  const handleDragStart = useCallback((pdvId: number, fechaInicio: string, vendedorId: number) => {
    setDragInfo({ pdvId, fechaInicio, vendedorId, fechaFin: fechaInicio });
  }, []);

  const handleCellEnter = useCallback((pdvId: number, fecha: string) => {
    setDragInfo((cur) => cur && cur.pdvId === pdvId ? { ...cur, fechaFin: fecha } : cur);
  }, []);

  const dragRangoSet = useMemo((): Set<string> => {
    if (!dragInfo) return new Set();
    const i = dias.indexOf(dragInfo.fechaInicio);
    const j = dias.indexOf(dragInfo.fechaFin);
    if (i === -1 || j === -1) return new Set();
    const [min, max] = i <= j ? [i, j] : [j, i];
    return new Set(dias.slice(min, max + 1));
  }, [dragInfo, dias]);

  return (
    <div className="overflow-x-auto rounded-xl border shadow-sm -mx-1 px-1">
      <table className={`text-xs min-w-[460px] w-full border-collapse${dragInfo ? " select-none cursor-crosshair" : ""}`}>
        {/* Cabecera con nombres de PDV */}
        <thead>
          <tr className="bg-muted/60 border-b">
            <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap w-16 sticky left-0 bg-muted/60">
              Día
            </th>
            {pdvs.map((pdv) => (
              <th
                key={pdv.id}
                className="px-2 py-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap min-w-[100px]"
              >
                {pdv.nombre}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {dias.map((fecha) => {
            const filaDatos = grid[fecha] ?? {};
            const esDomingo = new Date(
              parseInt(fecha.slice(0, 4)),
              parseInt(fecha.slice(5, 7)) - 1,
              parseInt(fecha.slice(8, 10))
            ).getDay() === 0;

            return (
              <tr
                key={fecha}
                className={`border-b transition-colors ${
                  esDomingo
                    ? "bg-slate-50 dark:bg-slate-900/30"
                    : "hover:bg-muted/20"
                }`}
              >
                {/* Columna de fecha */}
                <td className="px-3 py-2 whitespace-nowrap sticky left-0 bg-inherit border-r">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-bold tabular-nums">{fecha.slice(8, 10)}</span>
                    <span className={`text-[10px] font-medium ${
                      esDomingo ? "text-red-500" : "text-muted-foreground"
                    }`}>
                      {diaSemana(fecha)}
                    </span>
                  </div>
                </td>

                {/* Columnas de PDV */}
                {pdvs.map((pdv) => {
                  const celda    = filaDatos[pdv.id];
                  const enRango  = dragInfo?.pdvId === pdv.id && dragRangoSet.has(fecha);
                  const esFuente = fecha === dragInfo?.fechaInicio && dragInfo?.pdvId === pdv.id;
                  return (
                    <td
                      key={pdv.id}
                      className="px-1.5 py-1.5 text-center align-middle"
                      onMouseEnter={() => dragInfo && handleCellEnter(pdv.id, fecha)}
                    >
                      <CeldaVista
                        celda={celda ?? null}
                        pdvNombre={pdv.nombre}
                        pdvId={pdv.id}
                        fecha={fecha}
                        soloLectura={soloLectura}
                        onEditar={onEditarCelda}
                        onAgregar={onAgregarCelda}
                        onDragStart={handleDragStart}
                        dragHighlight={enRango && !esFuente && !celda?.vendedorPlaneado}
                        isDragging={!!dragInfo}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Subcomponente: Celda individual de la grilla ────────────────────────────

interface CeldaVistaProps {
  celda: CeldaHorario | null;
  pdvNombre: string;
  pdvId: number;
  fecha: string;
  soloLectura?: boolean;
  onEditar: (celdaId: number, pdvNombre: string, fecha: string, vendedorActualId: number | null) => void;
  onAgregar: (pdvId: number, pdvNombre: string, fecha: string) => void;
  onDragStart: (pdvId: number, fecha: string, vendedorId: number) => void;
  dragHighlight: boolean;
  isDragging: boolean;
}

function CeldaVista({ celda, pdvNombre, pdvId, fecha, soloLectura = false, onEditar, onAgregar, onDragStart, dragHighlight, isDragging }: CeldaVistaProps) {
  if (!celda) {
    // En modo consulta, un día sin turno no ofrece el botón "+" de asignar.
    if (soloLectura) {
      return <span className="text-muted-foreground/25">—</span>;
    }
    return (
      <button
        onClick={() => !isDragging && onAgregar(pdvId, pdvNombre, fecha)}
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors mx-auto ${
          dragHighlight
            ? "bg-blue-100 border-2 border-dashed border-blue-400 text-blue-500 dark:bg-blue-900/30 dark:border-blue-500"
            : "text-muted-foreground/30 hover:bg-primary/10 hover:text-primary"
        }`}
        title={`Asignar vendedor/a — ${pdvNombre}`}
      >
        <Plus size={14} />
      </button>
    );
  }

  const { vendedorPlaneado, vendedorReal, id, total, publicado } = celda;

  // Caso: solo real (sin plan)
  if (!vendedorPlaneado && vendedorReal) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0.5 h-auto bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600"
          title={vendedorReal.nombre}
        >
          {iniciales(vendedorReal.nombre)}
        </Badge>
        {total !== null && total > 0 && (
          <span className="text-[9px] text-muted-foreground tabular-nums">
            {fmtCLP.format(total)}
          </span>
        )}
      </div>
    );
  }

  // Caso: planeado confirmado (misma persona)
  if (vendedorPlaneado && vendedorReal && vendedorPlaneado.id === vendedorReal.id) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <button
          className="group disabled:cursor-default"
          disabled={soloLectura}
          title={`${vendedorReal.nombre} — Confirmado`}
          onClick={() =>
            id !== null && onEditar(id, pdvNombre, fecha, vendedorPlaneado.id)
          }
        >
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0.5 h-auto bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700 group-hover:brightness-95 transition-all"
          >
            <Check className="size-2.5 mr-0.5" />
            {iniciales(vendedorReal.nombre)}
          </Badge>
        </button>
        {total !== null && total > 0 && (
          <span className="text-[9px] text-muted-foreground tabular-nums">
            {fmtCLP.format(total)}
          </span>
        )}
      </div>
    );
  }

  // Caso: planeado con cambio (personas distintas)
  if (vendedorPlaneado && vendedorReal && vendedorPlaneado.id !== vendedorReal.id) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center gap-0.5">
          <button
            className="disabled:cursor-default"
            disabled={soloLectura}
            title={`Planeado: ${vendedorPlaneado.nombre}`}
            onClick={() =>
              id !== null && onEditar(id, pdvNombre, fecha, vendedorPlaneado.id)
            }
          >
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0.5 h-auto bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700 hover:brightness-95 transition-all"
            >
              {iniciales(vendedorPlaneado.nombre)}
            </Badge>
          </button>
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0.5 h-auto bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700"
            title={`Real: ${vendedorReal.nombre}`}
          >
            {iniciales(vendedorReal.nombre)}
          </Badge>
        </div>
        {total !== null && total > 0 && (
          <span className="text-[9px] text-muted-foreground tabular-nums">
            {fmtCLP.format(total)}
          </span>
        )}
      </div>
    );
  }

  // Caso: planeado en fecha ya pasada y sin turno real → inasistencia (C16/A37).
  // Antes se pintaba igual que un turno futuro, ocultando los no-show.
  if (vendedorPlaneado && !vendedorReal && fecha < fechaHoyChile()) {
    return (
      <button
        title={`No llegó: ${vendedorPlaneado.nombre} (planeado, sin turno abierto)`}
        onClick={() => !isDragging && id !== null && onEditar(id, pdvNombre, fecha, vendedorPlaneado.id)}
        disabled={soloLectura}
        className="group/badge disabled:cursor-default"
      >
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0.5 h-auto bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700 group-hover/badge:brightness-95 transition-all"
        >
          <X className="size-2.5 mr-0.5" />
          {iniciales(vendedorPlaneado.nombre)}
        </Badge>
      </button>
    );
  }

  // Caso: solo planeado (sin real aún) — publicado o pendiente
  if (vendedorPlaneado && !vendedorReal) {
    return (
      <div className="relative inline-flex items-center justify-center group/drag">
        <button
          title={publicado ? `Publicado: ${vendedorPlaneado.nombre}` : `Planeado: ${vendedorPlaneado.nombre}`}
          onClick={() => !isDragging && id !== null && onEditar(id, pdvNombre, fecha, vendedorPlaneado.id)}
          disabled={soloLectura}
          className="group/badge disabled:cursor-default"
        >
          <Badge
            variant="outline"
            className={publicado
              ? "text-[10px] px-1.5 py-0.5 h-auto bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700 group-hover/badge:brightness-95 transition-all"
              : "text-[10px] px-1.5 py-0.5 h-auto bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700 group-hover/badge:brightness-95 transition-all"
            }
          >
            {publicado && <Send className="size-2 mr-0.5" />}
            {iniciales(vendedorPlaneado.nombre)}
          </Badge>
        </button>
        {/* Manija de arrastre estilo Excel — solo en modo edición */}
        {!soloLectura && (
          <div
            className={`absolute -bottom-1 -right-1 size-2.5 rounded-[2px] cursor-crosshair opacity-0 group-hover/drag:opacity-100 transition-opacity z-10 ${publicado ? "bg-emerald-500" : "bg-blue-500"}`}
            title="Arrastrar para rellenar celdas vacías hacia abajo"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDragStart(pdvId, fecha, vendedorPlaneado.id);
            }}
          />
        )}
      </div>
    );
  }

  return <span className="text-muted-foreground/30">—</span>;
}

// ─── Subcomponentes primitivos ────────────────────────────────────────────────

function BottomSheet({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 max-h-[92dvh] animate-in slide-in-from-bottom duration-300">
        <div className="rounded-t-2xl bg-background overflow-y-auto max-h-[92dvh]">
          {children}
        </div>
      </div>
    </div>
  );
}

function Handle() {
  return (
    <div className="mb-3 flex justify-center">
      <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
    </div>
  );
}

// ─── SelectorMesPicker — grilla tipo calendario de meses ─────────────────────

const NOMBRES_MES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

interface SelectorMesPickerProps {
  mes:      string;                                  // YYYY-MM seleccionado
  opciones: { valor: string; etiqueta: string }[];   // meses disponibles
  onChange: (valor: string) => void;
}

function SelectorMesPicker({ mes, opciones, onChange }: SelectorMesPickerProps) {
  const [abierto, setAbierto] = useState(false);
  const [anioVista, setAnioVista] = useState(() => parseInt(mes.slice(0, 4)));
  const ref = useRef<HTMLDivElement>(null);

  // Nombre largo del mes seleccionado
  const etiqueta = opciones.find((o) => o.valor === mes)?.etiqueta ?? mes;

  // Conjunto de valores disponibles
  const disponibles = new Set(opciones.map((o) => o.valor));

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!abierto) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [abierto]);

  const seleccionar = (valor: string) => {
    if (!disponibles.has(valor)) return;
    onChange(valor);
    setAbierto(false);
  };

  return (
    <div ref={ref} className="relative">
      {/* Botón que muestra el mes actual */}
      <button
        type="button"
        onClick={() => { setAnioVista(parseInt(mes.slice(0, 4))); setAbierto((p) => !p); }}
        className="h-9 min-w-[9rem] px-3 text-sm font-medium text-center hover:bg-muted/50 transition-colors rounded-md"
      >
        {etiqueta}
      </button>

      {/* Popover con grilla de meses */}
      {abierto && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 w-64 rounded-xl border bg-background shadow-xl p-3 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Navegación de año */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setAnioVista((y) => y - 1)}
              className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-bold">{anioVista}</span>
            <button
              type="button"
              onClick={() => setAnioVista((y) => y + 1)}
              className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {/* Grilla 4×3 de meses */}
          <div className="grid grid-cols-4 gap-1">
            {NOMBRES_MES.map((nombre, idx) => {
              const numMes  = String(idx + 1).padStart(2, "0");
              const valor   = `${anioVista}-${numMes}`;
              const activo  = valor === mes;
              const habilitado = disponibles.has(valor);

              return (
                <button
                  key={valor}
                  type="button"
                  onClick={() => seleccionar(valor)}
                  disabled={!habilitado}
                  className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                    activo
                      ? "bg-primary text-primary-foreground"
                      : habilitado
                      ? "hover:bg-muted text-foreground"
                      : "text-muted-foreground/30 cursor-not-allowed"
                  }`}
                >
                  {nombre}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
