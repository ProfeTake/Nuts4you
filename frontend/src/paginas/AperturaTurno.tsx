// ─────────────────────────────────────────────────────────────────────────────
// Página: Apertura de Turno
// ─────────────────────────────────────────────────────────────────────────────
//
// Wizard de 3 pasos que el vendedor debe completar antes de usar el POS:
//   Paso 1 → Confirmar PDV asignado y activo
//   Paso 2 → Ingresar saldo inicial de caja (efectivo en CLP)
//   Paso 3 → Verificar inventario inicial del PDV
//
// Al completar los 3 pasos, dispara `onAperturaCompleta` que crea el turno.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from "react";
import { apiGet } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatearCLP } from "@/lib/money";
import { inventarioInicialMock } from "@/datos/mock.datos";
import { compararCategorias, compararProductos } from "@/lib/categorias";
import type {
  SesionPOS,
  PasoApertura,
  ItemInventarioInicial,
} from "@/tipos/pos.tipos";
import { Store, Banknote, Package, Check, AlertTriangle, ArrowRight, Phone } from "lucide-react";

// ─── Constantes ─────────────────────────────────────────────────────────────

const PASOS: PasoApertura[] = ["pdv", "saldo", "inventario"];

const ETIQUETA_PASO: Record<PasoApertura, string> = {
  pdv: "Punto de Venta",
  saldo: "Apertura de Caja",
  inventario: "Inventario Inicial",
};

const MONTOS_RAPIDOS = [20_000, 50_000, 100_000, 150_000];

// Caja chica estándar del negocio (D5/A31): el saldo inicial se precarga con
// este monto y queda editable — en festivos u ocasiones especiales puede variar,
// por eso NO se fuerza ni se hereda del cierre anterior (decisión del cliente).
const CAJA_CHICA_DEFAULT = 20_000;

// Fecha local de hoy como YYYY-MM-DD (en operación el navegador está en Chile).
const fechaHoyISO = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// ─── Props ──────────────────────────────────────────────────────────────────

interface AperturaTurnoProps {
  sesion: SesionPOS;
  pasoInicial?: PasoApertura;
  horaIngreso?: string | null;
  onAperturaCompleta: (
    saldoInicial: number,
    inventario: ItemInventarioInicial[]
  ) => void;
  onVolverAdmin?: () => void;
}

// ─── Componente principal ────────────────────────────────────────────────────────────

export default function AperturaTurno({
  sesion,
  pasoInicial = "saldo",
  horaIngreso,
  onAperturaCompleta,
  onVolverAdmin,
}: AperturaTurnoProps) {
  const [pasoActual, setPasoActual] = useState<PasoApertura>(pasoInicial);
  // Precargado con la caja chica estándar ($20.000), editable por la vendedora.
  const [saldoInicial, setSaldoInicial] = useState(CAJA_CHICA_DEFAULT);
  const [saldoTexto, setSaldoTexto] = useState(CAJA_CHICA_DEFAULT.toLocaleString("es-CL"));
  const [itemsInventario, setItemsInventario] = useState<ItemInventarioInicial[]>(
    () => inventarioInicialMock.map((item) => ({ ...item }))
  );
  // Indica si el admin dejó un ingreso preparado para hoy (para el mensaje de ayuda).
  const [hayIngresoPreparado, setHayIngresoPreparado] = useState(false);
  const inputSaldoRef = useRef<HTMLInputElement>(null);

  const indicePaso = PASOS.indexOf(pasoActual);
  const { usuario, pdv } = sesion;

  // Cargar stock actual del PDV desde la API (saldo del turno anterior)
  useEffect(() => {
    if (!pdv?.id) return;
    apiGet<{ data: { productoId: number; stockActual: number }[] }>(
      `/inventario/${pdv.id}`
    ).then(res => {
      if (!res.data.length) return;
      setItemsInventario(prev =>
        prev.map(item => {
          const stock = res.data.find(s => s.productoId === item.productoId);
          return stock ? { ...item, inicio: stock.stockActual } : item;
        })
      );
    }).catch(() => {
      // Sin inventario previo: queda en 0 (primera vez)
    });
  }, [pdv?.id]);

  // Cargar el INGRESO preparado por el admin/supervisor para hoy. Es solo lectura:
  // la vendedora solo verifica que el inventario recibido esté correcto.
  useEffect(() => {
    if (!pdv?.id) return;
    apiGet<{ data: { estado: string; items: { productoId: number; cantidad: number }[] } | null }>(
      `/preparaciones/pdv/${pdv.id}?fecha=${fechaHoyISO()}`
    ).then(res => {
      const prep = res.data;
      if (!prep || prep.estado === "ANULADA") return;
      const porId = new Map(prep.items.map(i => [i.productoId, i.cantidad]));
      setHayIngresoPreparado(prep.items.some(i => i.cantidad > 0));
      setItemsInventario(prev =>
        prev.map(item => ({ ...item, ingreso: porId.get(item.productoId) ?? 0 }))
      );
    }).catch(() => {
      // Sin preparación para hoy: el ingreso queda en 0
    });
  }, [pdv?.id]);

  // pdv.activo viene directo del login/me — si el admin desactiva el PDV, el vendedor no puede abrir turno
  const pdvActivo = pdv?.activo === true;

  // Focus en input de saldo al llegar al paso 2
  useEffect(() => {
    if (pasoActual === "saldo") {
      setTimeout(() => inputSaldoRef.current?.focus(), 200);
    }
  }, [pasoActual]);

  // ── Navegación entre pasos ──

  const avanzarPaso = useCallback(() => {
    const siguiente = PASOS[indicePaso + 1];
    if (siguiente) setPasoActual(siguiente);
  }, [indicePaso]);

  // ── Manejo del input de saldo ──

  const manejarCambioSaldo = (valor: string) => {
    const soloNumeros = valor.replace(/\D/g, "");
    const numero = parseInt(soloNumeros, 10) || 0;
    setSaldoInicial(numero);
    setSaldoTexto(soloNumeros ? numero.toLocaleString("es-CL") : "");
  };

  const aplicarMontoRapido = (monto: number) => {
    setSaldoInicial(monto);
    setSaldoTexto(monto.toLocaleString("es-CL"));
  };

  // ── Manejo del inventario ──
  // INICIO = saldo del día anterior, precargado desde el stock del PDV (solo lectura).
  // ING = ingreso preparado por el admin/supervisor para hoy (solo lectura).
  // La vendedora únicamente verifica que lo recibido coincida.

  const marcarTodoRevisado = () => {
    setItemsInventario((prev) => prev.map((item) => ({ ...item, verificado: true })));
  };

  const todosVerificados = itemsInventario.every((i) => i.verificado);

  const completarApertura = () => {
    onAperturaCompleta(saldoInicial, itemsInventario);
  };

  // ── Indicador de progreso ──

  const indicadorPasos = (
    <div className="mb-6">
      {/* Barra de progreso */}
      <div className="flex items-center gap-1.5">
        {PASOS.map((paso, i) => (
          <div key={paso} className="flex flex-1 flex-col items-center gap-1.5">
            {/* Segmento de la barra */}
            <div
              className={`h-1.5 w-full rounded-full transition-all duration-500 ${
                i <= indicePaso ? "bg-primary" : "bg-muted"
              }`}
            />
            {/* Etiqueta del paso */}
            <span
              className={`text-[10px] font-medium transition-colors sm:text-xs ${
                i <= indicePaso
                  ? "text-primary"
                  : "text-muted-foreground/60"
              }`}
            >
              {ETIQUETA_PASO[paso]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  // ── Paso 1: Confirmar PDV ──

  const pasoPDV = (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Store size={32} strokeWidth={1.5} />
        </div>
        <CardTitle className="text-lg">Punto de Venta Asignado</CardTitle>
        <CardDescription>
          Confirma que tu punto de venta está listo para operar
        </CardDescription>
      </CardHeader>

      <CardContent>
        {pdvActivo && pdv && usuario ? (
          <div className="space-y-4">
            {/* Info del PDV */}
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {pdv.nombre}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Vendedor: {usuario.nombre}
                  </p>
                </div>
                <Badge
                  variant="default"
                  className="bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                >
                  Activo
                </Badge>
              </div>
              <Separator className="my-3" />
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Tipo: <strong className="text-foreground">{pdv.tipo}</strong></span>
                <span>RUT: <strong className="text-foreground">{usuario.rut}</strong></span>
              </div>
            </div>

            {/* Fecha */}
            <p className="text-center text-xs text-muted-foreground">
              {new Date().toLocaleDateString("es-CL", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        ) : (
          /* PDV no activo */
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle size={16} />
            </div>
            <div>
              <p className="font-semibold text-destructive">
                PDV no disponible
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tu punto de venta no está activo. Contacta a tu supervisor
                para habilitarlo.
              </p>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-center">
        {pdvActivo ? (
          <Button
            size="lg"
            className="w-full max-w-xs gap-2 text-base"
            onClick={avanzarPaso}
          >
            Continuar
            <ArrowRight size={18} />
          </Button>
        ) : (
          <Button
            variant="outline"
            size="lg"
            className="gap-2"
            onClick={() =>
              alert("Contactar supervisor — funcionalidad próximamente")
            }
          >
            <Phone size={20} />
            Contactar Supervisor
          </Button>
        )}
      </CardFooter>
    </Card>
  );

  // ── Paso 2: Saldo Inicial ──

  // Hora de ingreso formateada (registrada en el login)
  const horaIngresoFormateada = horaIngreso
    ? new Date(horaIngreso).toLocaleTimeString("es-CL", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  const pasoSaldo = (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Banknote size={32} strokeWidth={1.5} />
        </div>
        <CardTitle className="text-lg">Apertura de Caja</CardTitle>
        <CardDescription>
          La caja chica estándar es de {formatearCLP(CAJA_CHICA_DEFAULT)} — ajusta el monto solo si hoy es distinto (ej: festivos)
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Contexto de sesión: usuario + PDV + hora ingreso */}
        {usuario && pdv && (
          <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-3 py-2.5 text-xs">
            <div>
              <p className="font-semibold text-foreground">{usuario.nombre}</p>
              <p className="text-muted-foreground">{pdv.nombre}</p>
            </div>
            {horaIngresoFormateada && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ingreso</p>
                <p className="font-mono font-semibold tabular-nums text-foreground">
                  {horaIngresoFormateada}
                </p>
              </div>
            )}
          </div>
        )}
        <div className="text-center">
          <div className="relative mx-auto max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-muted-foreground">
              $
            </span>
            <Input
              ref={inputSaldoRef}
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={saldoTexto}
              onChange={(e) => manejarCambioSaldo(e.target.value)}
              className="h-14 pl-8 text-center text-2xl font-bold tabular-nums"
            />
          </div>
          {saldoInicial > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              {formatearCLP(saldoInicial)}
            </p>
          )}
        </div>

        {/* Montos rápidos */}
        <div>
          <p className="mb-2 text-center text-xs font-medium text-muted-foreground">
            Montos rápidos
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MONTOS_RAPIDOS.map((monto) => (
              <Button
                key={monto}
                variant={saldoInicial === monto ? "default" : "outline"}
                size="sm"
                className="tabular-nums"
                onClick={() => aplicarMontoRapido(monto)}
              >
                {formatearCLP(monto)}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>

      <CardFooter className="justify-center">
        <Button
          size="lg"
          className="w-full max-w-xs gap-2 text-base"
          onClick={avanzarPaso}
          disabled={saldoInicial <= 0}
        >
          Confirmar Saldo
          <ArrowRight size={18} />
        </Button>
      </CardFooter>
    </Card>
  );

  // ── Paso 3: Inventario Inicial ──
  // Tabla estilo planilla papel: ITEM | INICIO | ING, agrupado por categoría

  const fechaHoy = new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "2-digit" });
  // Orden canónico, el mismo del Turno Activo. Antes dependía del orden del array
  // de inventario: funcionaba de casualidad porque el mock viene ordenado a mano,
  // y se habría roto apenas los ítems vinieran de la API (que los devuelve por
  // categoría alfabética). La apertura y el cierre tienen que listar igual: es la
  // misma persona contando los mismos productos.
  const categorias = [...new Set(itemsInventario.map((i) => i.categoria))].sort(compararCategorias);

  const pasoInventario = (
    <div className="flex h-full flex-col">
      {/* Header compacto */}
      <div className="shrink-0 space-y-2 px-4 pb-2 pt-1 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Package size={32} strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Inventario Inicial</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {hayIngresoPreparado
              ? "Verifica que el saldo (INICIO) y el ingreso preparado (ING) coincidan con lo recibido"
              : "Verifica las unidades disponibles al abrir el turno"}
          </p>
        </div>

        {/* Botón "marcar todo revisado" */}
        {!todosVerificados && (
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={marcarTodoRevisado}>
            <Check size={16} strokeWidth={2.5} />
            Marcar todo como revisado
          </Button>
        )}
        {todosVerificados && (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
            <Check size={16} strokeWidth={2.5} />
            <span className="text-sm font-medium">Inventario confirmado</span>
          </div>
        )}
      </div>

      {/* Tabla de inventario — scrollable */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        <table className="w-full border-collapse text-sm">
          <thead>
            {/* Fila vendedor + fecha */}
            <tr className="bg-muted/40">
              <td className="border border-border px-2 py-1.5 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Vendedor(a):</span>{" "}
                {sesion.usuario?.nombre ?? "—"}
              </td>
              <td colSpan={2} className="border border-border px-2 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                <span className="font-semibold text-foreground">Fecha:</span>{" "}
                {fechaHoy}
              </td>
            </tr>
            {/* Cabecera de columnas */}
            <tr className="bg-muted">
              <th className="border border-border px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider">
                ITEM
              </th>
              <th className="w-16 border border-border px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider">
                INICIO
              </th>
              <th className="w-14 border border-border px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider">
                ING
              </th>
            </tr>
          </thead>
          <tbody>
            {categorias.flatMap((cat) => [
              /* Fila de grupo / categoría */
              <tr key={`cat-${cat}`} className="bg-muted/50">
                <td
                  colSpan={3}
                  className="border border-border px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
                >
                  {cat}
                </td>
              </tr>,
              /* Filas de producto */
              ...itemsInventario
                .filter((i) => i.categoria === cat)
                .sort(compararProductos)
                .map((item) => (
                  <tr
                    key={item.productoId}
                    className={
                      item.verificado
                        ? "bg-emerald-50/50 dark:bg-emerald-950/10"
                        : "bg-background"
                    }
                  >
                    <td className="border border-border px-2 py-1.5 font-medium text-foreground">
                      {item.nombre}
                    </td>
                    {/* INICIO — solo lectura (saldo del día anterior) */}
                    <td className="border border-border px-2 py-1.5 text-center text-sm font-semibold tabular-nums text-muted-foreground bg-muted/40">
                      {item.inicio}
                    </td>
                    {/* ING — preparado por el admin, solo lectura */}
                    <td className="border border-border px-2 py-1.5 text-center text-sm font-semibold tabular-nums text-foreground">
                      {item.ingreso > 0 ? (
                        item.ingreso
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                  </tr>
                )),
            ])}
          </tbody>
        </table>
      </div>

      {/* Botón CTA — siempre visible en la parte inferior */}
      <div className="shrink-0 border-t bg-background/95 px-4 pb-6 pt-3 backdrop-blur-sm">
        <Button
          size="lg"
          className="w-full gap-2 text-base"
          onClick={completarApertura}
          disabled={!todosVerificados}
        >
          Confirmar y Abrir Turno
        </Button>
        {!todosVerificados && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Completa o marca el inventario para continuar
          </p>
        )}
      </div>
    </div>
  );

  // ── Render principal ──

  // El paso de inventario ocupa toda la pantalla (tiene su propio scroll interno)
  // Los pasos 1 y 2 son tarjetas centradas con scroll externo si son más altas que la pantalla
  if (pasoActual === "inventario") {
    return (
      <div className="flex h-dvh flex-col bg-gradient-to-b from-background to-muted/30">
        {/* Cabecera fija: Logo + indicador de pasos */}
        <div className="shrink-0 px-4 pb-2 pt-5">
          <h1 className="mb-4 text-center text-xl font-bold text-foreground">
            Nuts 4 You
          </h1>
          {indicadorPasos}
        </div>

        {/* Contenido del paso inventario (gestiona su propio scroll) */}
        <div className="flex min-h-0 flex-1 flex-col">
          {pasoInventario}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
      {/* Botón volver al panel (solo admin/supervisor) */}
      {onVolverAdmin && (
        <button
          onClick={onVolverAdmin}
          className="absolute top-4 left-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Volver al panel
        </button>
      )}
      <div className="w-full max-w-lg">
        {/* Logo */}
        <h1 className="mb-6 text-center text-2xl font-bold text-foreground">
          Nuts 4 You
        </h1>

        {/* Indicador de pasos */}
        {indicadorPasos}

        {/* Contenido del paso actual */}
        {pasoActual === "pdv" && pasoPDV}
        {pasoActual === "saldo" && pasoSaldo}
      </div>
    </div>
  );
}
