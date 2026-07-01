// ─── ConfigBonos ──────────────────────────────────────────────────────────────
// Panel admin para editar los tramos de bono por sucursal (P6).
// Reemplaza la tabla hardcodeada del backend: la fuente de verdad es `ConfigBono`.
// El admin edita la lista de tramos (umbral de venta diaria → monto de bono) por
// PDV y guarda; el backend reemplaza el set completo del PDV.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gift, Plus, Trash2, Save, Loader2, Info } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatearCLP } from "@/lib/money";
import { apiGet, api } from "@/lib/api";

interface Tramo  { id?: number; umbral: number; monto: number; activo?: boolean }
interface ConfigPdv { pdvId: number; pdvNombre: string; activo: boolean; tramos: Tramo[] }

export function ConfigBonos() {
  const queryClient = useQueryClient();
  const [pdvSeleccionado, setPdvSeleccionado] = useState<number | null>(null);
  const [tramos, setTramos] = useState<Tramo[]>([]);

  const { data: config = [], isLoading } = useQuery({
    queryKey: ["config-bonos"],
    queryFn:  () => apiGet<{ data: ConfigPdv[] }>("/config-bonos").then((r) => r.data),
  });

  // Selecciona el primer PDV por defecto al cargar
  useEffect(() => {
    if (pdvSeleccionado === null && config.length > 0) {
      setPdvSeleccionado(config[0].pdvId);
    }
  }, [config, pdvSeleccionado]);

  const pdvActual = useMemo(
    () => config.find((c) => c.pdvId === pdvSeleccionado) ?? null,
    [config, pdvSeleccionado],
  );

  // Sincroniza los tramos editables al cambiar de PDV o recargar datos
  useEffect(() => {
    if (pdvActual) {
      setTramos(pdvActual.tramos.map((t) => ({ umbral: t.umbral, monto: t.monto })));
    }
  }, [pdvActual]);

  const mutGuardar = useMutation({
    mutationFn: (payload: { pdvId: number; tramos: Tramo[] }) =>
      api(`/config-bonos/${payload.pdvId}`, {
        method: "PUT",
        body: { tramos: payload.tramos.map((t) => ({ umbral: t.umbral, monto: t.monto })) },
      }),
    onSuccess: () => {
      toast.success("Tramos de bono guardados");
      queryClient.invalidateQueries({ queryKey: ["config-bonos"] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Error al guardar"),
  });

  const actualizarTramo = (i: number, campo: "umbral" | "monto", valor: number) =>
    setTramos((prev) => prev.map((t, idx) => (idx === i ? { ...t, [campo]: valor } : t)));

  const agregarTramo = () => setTramos((prev) => [...prev, { umbral: 0, monto: 0 }]);
  const eliminarTramo = (i: number) => setTramos((prev) => prev.filter((_, idx) => idx !== i));

  const hayDuplicados = useMemo(() => {
    const us = tramos.map((t) => t.umbral);
    return new Set(us).size !== us.length;
  }, [tramos]);

  const guardar = () => {
    if (pdvSeleccionado === null) return;
    if (hayDuplicados) { toast.error("Hay umbrales duplicados"); return; }
    mutGuardar.mutate({ pdvId: pdvSeleccionado, tramos });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando configuración…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 px-3 py-2.5 text-xs text-blue-700 dark:text-blue-400">
        <Info className="size-4 mt-0.5 shrink-0" />
        <span>
          Define los tramos de bono por sucursal. Si la venta diaria de un turno alcanza un umbral,
          el vendedor recibe el monto correspondiente (gana el umbral más alto alcanzado).
          Los cambios afectan el cálculo de liquidaciones.
        </span>
      </div>

      {/* Selector de sucursal */}
      <div className="flex items-center gap-3">
        <Label className="text-sm shrink-0 text-muted-foreground">Sucursal:</Label>
        <Select
          value={pdvSeleccionado !== null ? String(pdvSeleccionado) : undefined}
          onValueChange={(v) => setPdvSeleccionado(Number(v))}
        >
          <SelectTrigger className="h-9 w-56">
            <SelectValue placeholder="Selecciona una sucursal" />
          </SelectTrigger>
          <SelectContent>
            {config.map((c) => (
              <SelectItem key={c.pdvId} value={String(c.pdvId)}>{c.pdvNombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {pdvActual && (
        <Card>
          <CardContent className="px-4 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <Gift className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Tramos de bono — {pdvActual.pdvNombre}</h3>
            </div>

            {tramos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Sin tramos configurados. Agrega uno para empezar.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground px-1">
                  <span>Venta diaria desde (CLP)</span>
                  <span>Bono (CLP)</span>
                  <span></span>
                </div>
                {tramos.map((t, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <Input
                      type="number" min={0} inputMode="numeric"
                      value={t.umbral || ""}
                      onChange={(e) => actualizarTramo(i, "umbral", Number(e.target.value) || 0)}
                      placeholder="250000"
                      className="text-right tabular-nums"
                    />
                    <Input
                      type="number" min={0} inputMode="numeric"
                      value={t.monto || ""}
                      onChange={(e) => actualizarTramo(i, "monto", Number(e.target.value) || 0)}
                      placeholder="6000"
                      className="text-right tabular-nums"
                    />
                    <Button
                      variant="ghost" size="icon" className="size-9 text-red-500 hover:bg-red-500/10"
                      title="Eliminar tramo" onClick={() => eliminarTramo(i)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {hayDuplicados && (
              <p className="text-xs text-red-600">Hay dos tramos con el mismo umbral. Corrige antes de guardar.</p>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={agregarTramo}>
                <Plus className="size-4 mr-1" /> Agregar tramo
              </Button>
              <Button
                size="sm" className="sm:ml-auto"
                onClick={guardar}
                disabled={mutGuardar.isPending || hayDuplicados}
              >
                {mutGuardar.isPending
                  ? <Loader2 className="size-4 mr-1 animate-spin" />
                  : <Save className="size-4 mr-1" />}
                Guardar tramos
              </Button>
            </div>

            {/* Vista previa */}
            {tramos.length > 0 && (
              <div className="border-t pt-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Vista previa:</p>
                {[...tramos].sort((a, b) => b.umbral - a.umbral).map((t, i) => (
                  <p key={i}>
                    Venta ≥ {formatearCLP(t.umbral)} → bono {formatearCLP(t.monto)}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
