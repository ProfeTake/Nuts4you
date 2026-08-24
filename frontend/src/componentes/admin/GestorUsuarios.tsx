// ─── GestorUsuarios ───────────────────────────────────────────────────────────
// Panel ADMIN: gestión de usuarios del sistema por rol
// (ADMIN, SUPERVISOR, BODEGUERO, VENDEDOR)
// Conectado a:
//   GET    /api/usuarios
//   POST   /api/usuarios
//   PATCH  /api/usuarios/:id
//   PATCH  /api/usuarios/:id/estado

import { useState, useMemo } from "react";
import { autoFormatRUT } from "@/lib/rut";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Users, Plus, Pencil, ToggleLeft, ToggleRight,
  Loader2, Search, X, ShieldCheck, Trash2, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { formatearCLP } from "@/lib/money";
import type { PDVItem } from "@/tipos/admin.tipos";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Rol = "ADMIN" | "SUPERVISOR" | "BODEGUERO" | "VENDEDOR";

interface Usuario {
  id:          number;
  rut:         string;
  nombre:      string;
  email:       string | null;
  rol:         Rol;
  pdvId:       number | null;
  pdvNombre:   string | null;
  activo:      boolean;
  esDemo:      boolean;
  pagoDiario:  number;
  ultimoTurno: string | null;
}

interface FormUsuario {
  rut:        string;
  nombre:     string;
  email:      string;
  password:   string;
  rol:        Rol;
  pdvId:      string;
  pagoDiario: string;
}

const FORM_VACIO: FormUsuario = {
  rut: "", nombre: "", email: "", password: "", rol: "VENDEDOR", pdvId: "", pagoDiario: "28000",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mismo patrón que el backend (crearUsuarioSchema): 12345678-9 o 1.234.567-8
const RUT_RE = /^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/;
const PASSWORD_MIN = 8;

const ROLES: Rol[] = ["ADMIN", "SUPERVISOR", "BODEGUERO", "VENDEDOR"];

// Etiqueta visible del filtro de estado. Base UI muestra el value crudo en el
// trigger si no se le pasa la etiqueta como children de <SelectValue>.
const ETIQUETA_ACTIVO: Record<"todos" | "activos" | "inactivos", string> = {
  todos:     "Todos",
  activos:   "Activos",
  inactivos: "Inactivos",
};

const ROL_BADGE: Record<Rol, string> = {
  ADMIN:      "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-950/40 dark:text-violet-400",
  SUPERVISOR: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-400",
  BODEGUERO:  "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400",
  VENDEDOR:   "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400",
};

// ─── Modal crear / editar ─────────────────────────────────────────────────────

interface ModalUsuarioProps {
  usuario:  Usuario | null; // null = modo crear
  pdvs:     PDVItem[];
  onCerrar: () => void;
  onGuardar: (data: FormUsuario) => void;
  guardando: boolean;
}

function ModalUsuario({ usuario, pdvs, onCerrar, onGuardar, guardando }: ModalUsuarioProps) {
  const [form, setForm] = useState<FormUsuario>(() =>
    usuario
      ? {
          rut:        usuario.rut,
          nombre:     usuario.nombre,
          email:      usuario.email ?? "",
          password:   "",
          rol:        usuario.rol,
          pdvId:      usuario.pdvId ? String(usuario.pdvId) : "",
          pagoDiario: String(usuario.pagoDiario),
        }
      : FORM_VACIO
  );

  // Errores de validación por campo (se limpian al escribir en ese campo).
  const [errores, setErrores] = useState<Partial<Record<keyof FormUsuario, string>>>({});

  const set = (k: keyof FormUsuario) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((p) => ({ ...p, [k]: e.target.value }));
    setErrores((prev) => (prev[k] ? { ...prev, [k]: undefined } : prev));
  };

  const esNuevo = !usuario;

  // Valida el formulario antes de enviarlo. Devuelve true si es válido.
  // Espeja las reglas del backend (crearUsuarioSchema) para dar feedback
  // inmediato y específico en vez del genérico "Datos inválidos" del servidor.
  const validar = (): boolean => {
    const errs: Partial<Record<keyof FormUsuario, string>> = {};

    if (form.nombre.trim().length < 2) {
      errs.nombre = "Ingresa el nombre completo (mínimo 2 caracteres).";
    }
    if (!RUT_RE.test(form.rut.trim())) {
      errs.rut = "RUT inválido. Formato: 12345678-9.";
    }
    const email = form.email.trim();
    if (esNuevo && !email) {
      errs.email = "El correo es obligatorio para enviar las credenciales.";
    } else if (email && !EMAIL_RE.test(email)) {
      errs.email = "Correo electrónico inválido.";
    }
    // Contraseña: obligatoria al crear; al editar solo se valida si se escribió.
    if (esNuevo || form.password) {
      if (form.password.length < PASSWORD_MIN) {
        errs.password = `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
      }
    }

    setErrores(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validar()) return;
    onGuardar(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onCerrar}>
      <div className="w-full max-w-md rounded-2xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-foreground">
              {esNuevo ? "Nuevo Usuario" : `Editar — ${usuario.nombre}`}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {esNuevo ? "Completa los datos del nuevo usuario" : "Solo los campos que modificues se actualizarán"}
            </p>
          </div>
          <button onClick={onCerrar}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        {/* Formulario */}
        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nombre completo</label>
              <Input
                placeholder="Nombre Apellido"
                value={form.nombre}
                onChange={set("nombre")}
                aria-invalid={!!errores.nombre}
                className={errores.nombre ? "border-destructive focus-visible:ring-destructive/30" : undefined}
              />
              {errores.nombre && <p className="text-xs text-destructive">{errores.nombre}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">RUT</label>
              <Input
                placeholder="12345678-9"
                value={form.rut}
                onChange={(e) => {
                  const rut = autoFormatRUT(e.target.value);
                  setForm((p) => ({ ...p, rut }));
                  setErrores((prev) => (prev.rut ? { ...prev, rut: undefined } : prev));
                }}
                aria-invalid={!!errores.rut}
                className={errores.rut ? "border-destructive focus-visible:ring-destructive/30" : undefined}
              />
              {errores.rut && <p className="text-xs text-destructive">{errores.rut}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Correo electrónico {esNuevo && <span className="text-destructive">*</span>}
            </label>
            <Input
              type="email"
              placeholder="usuario@correo.com"
              value={form.email}
              onChange={set("email")}
              aria-invalid={!!errores.email}
              className={errores.email ? "border-destructive focus-visible:ring-destructive/30" : undefined}
            />
            {errores.email ? (
              <p className="text-xs text-destructive">{errores.email}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {esNuevo
                  ? "Obligatorio. Se enviarán las credenciales de acceso a este correo."
                  : "Si lo cambias, las próximas notificaciones llegarán al nuevo correo."}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Contraseña{!esNuevo && <span className="text-muted-foreground font-normal"> (dejar en blanco para no cambiar)</span>}
            </label>
            <Input
              type="password"
              placeholder={esNuevo ? "Mínimo 8 caracteres" : "Nueva contraseña…"}
              value={form.password}
              onChange={set("password")}
              aria-invalid={!!errores.password}
              className={errores.password ? "border-destructive focus-visible:ring-destructive/30" : undefined}
            />
            {errores.password ? (
              <p className="text-xs text-destructive">{errores.password}</p>
            ) : esNuevo ? (
              <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Rol</label>
              <Select value={form.rol} onValueChange={(v) => setForm((p) => ({ ...p, rol: v as Rol }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Sucursal asignada</label>
              <Select value={form.pdvId} onValueChange={(v) => setForm((p) => ({ ...p, pdvId: v ?? "" }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar">
                    {form.pdvId ? pdvs.find(p => String(p.id) === form.pdvId)?.nombre : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin asignar</SelectItem>
                  {pdvs.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Pago diario (CLP)</label>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="28000"
              value={form.pagoDiario}
              onChange={(e) => setForm((p) => ({ ...p, pagoDiario: e.target.value.replace(/\D/g, "") }))}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t px-5 py-4">
          <button onClick={onCerrar}
            className="flex-1 h-10 rounded-xl border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            Cancelar
          </button>
          <Button className="flex-1" disabled={guardando} onClick={handleSubmit}>
            {guardando ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
            {esNuevo ? "Crear usuario" : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function GestorUsuarios() {
  const queryClient = useQueryClient();

  const [filtroRol, setFiltroRol]       = useState<Rol | "">("");
  const [filtroActivo, setFiltroActivo] = useState<"todos" | "activos" | "inactivos">("todos");
  const [busqueda, setBusqueda]         = useState("");
  const [modalUsuario, setModalUsuario] = useState<Usuario | null | "nuevo">(null);
  const [eliminandoUsuario, setEliminandoUsuario] = useState<Usuario | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ["usuarios"],
    queryFn:  () => apiGet<{ data: Usuario[] }>("/usuarios").then((r) => r.data),
  });

  const { data: pdvs = [] } = useQuery({
    queryKey: ["admin", "pdvs"],
    queryFn:  () => apiGet<{ data: PDVItem[] }>("/admin/pdvs").then((r) => r.data),
  });

  // ── Mutaciones ────────────────────────────────────────────────────────────

  const mutCrear = useMutation({
    mutationFn: (payload: object) =>
      apiPost<{ data: Usuario & { correoEnviado: boolean } }>("/usuarios", payload),
    onSuccess: (res) => {
      if (res.data.correoEnviado) {
        toast.success("Usuario creado", { description: `Credenciales enviadas a ${res.data.email}` });
      } else {
        toast.warning("Usuario creado, pero el correo no se pudo enviar", {
          description: "Revisa la configuración SMTP o entrega las credenciales manualmente.",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      setModalUsuario(null);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Error al crear usuario"),
  });

  const mutEditar = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: object }) =>
      apiPatch<{ data: Usuario }>(`/usuarios/${id}`, payload),
    onSuccess: () => {
      toast.success("Usuario actualizado");
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      setModalUsuario(null);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Error al editar usuario"),
  });

  const mutEstado = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiPatch<{ data: Usuario }>(`/usuarios/${id}/estado`, { activo }),
    onSuccess: (res) => {
      toast.success(res.data.activo ? "Usuario activado" : "Usuario desactivado");
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Error al cambiar estado"),
  });

  const mutEliminar = useMutation({
    mutationFn: (id: number) => apiDelete(`/usuarios/${id}`),
    onSuccess: () => {
      toast.success(`Usuario "${eliminandoUsuario?.nombre}" eliminado`);
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      setEliminandoUsuario(null);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Error al eliminar usuario"),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleGuardar = (form: FormUsuario) => {
    const pdvId = form.pdvId ? parseInt(form.pdvId, 10) : null;
    const pagoDiario = parseInt(form.pagoDiario, 10) || 28000;
    const email = form.email.trim();

    if (modalUsuario === "nuevo") {
      if (!email || !EMAIL_RE.test(email)) {
        toast.error("Ingresa un correo electrónico válido. Es obligatorio para enviar las credenciales.");
        return;
      }
      mutCrear.mutate({
        rut:        form.rut.trim(),
        nombre:     form.nombre.trim(),
        email,
        password:   form.password,
        rol:        form.rol,
        pdvId,
        pagoDiario,
      });
    } else if (modalUsuario) {
      const payload: Record<string, unknown> = { pagoDiario, pdvId, rol: form.rol };
      if (form.nombre.trim())  payload.nombre   = form.nombre.trim();
      if (form.password)       payload.password = form.password;
      if (form.rut.trim())     payload.rut      = form.rut.trim();
      if (email && EMAIL_RE.test(email)) payload.email = email;
      mutEditar.mutate({ id: modalUsuario.id, payload });
    }
  };

  // ── Filtros ───────────────────────────────────────────────────────────────

  const usuariosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase();
    return usuarios.filter((u) => {
      if (filtroRol && u.rol !== filtroRol) return false;
      if (filtroActivo === "activos"   && !u.activo) return false;
      if (filtroActivo === "inactivos" && u.activo)  return false;
      if (busqueda && !u.nombre.toLowerCase().includes(q) && !u.rut.includes(busqueda)) return false;
      return true;
    });
  }, [usuarios, filtroRol, filtroActivo, busqueda]);

  const guardando = mutCrear.isPending || mutEditar.isPending;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestión de Usuarios</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Administra los accesos por rol al sistema ERP
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setModalUsuario("nuevo")}>
          <Plus className="size-4" />
          Nuevo usuario
        </Button>
      </div>

      <Separator />

      {/* ── Filtros ── */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o RUT…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={filtroRol} onValueChange={(v) => setFiltroRol(v as Rol | "")}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="Todos los roles">
              {filtroRol === "" ? "Todos los roles" : filtroRol}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos los roles</SelectItem>
            {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroActivo} onValueChange={(v) => setFiltroActivo(v as typeof filtroActivo)}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue>{ETIQUETA_ACTIVO[filtroActivo]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="activos">Activos</SelectItem>
            <SelectItem value="inactivos">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Tabla ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Cargando usuarios…
        </div>
      ) : usuariosFiltrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed rounded-xl gap-2">
          <Users className="size-8 opacity-40" />
          <p className="text-sm">No se encontraron usuarios con los filtros aplicados</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-left">
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Usuario</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Rol</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Sucursal</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-right text-muted-foreground">Pago / día</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-center text-muted-foreground">Estado</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Último turno</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-right text-muted-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuariosFiltrados.map((u) => (
                  <tr key={u.id} className="border-t hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-foreground">{u.nombre}</p>
                        {u.esDemo && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                            DEMO
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground tabular-nums">{u.rut}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ROL_BADGE[u.rol]}`}>
                        <ShieldCheck className="size-3" />
                        {u.rol}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {u.pdvNombre ?? <span className="italic text-muted-foreground/60">Sin asignar</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatearCLP(u.pagoDiario)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={u.activo ? "secondary" : "outline"}
                        className={u.activo
                          ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                          : "text-muted-foreground"}>
                        {u.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.ultimoTurno
                        ? new Date(u.ultimoTurno).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "2-digit" })
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setModalUsuario(u)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          title="Editar"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => mutEstado.mutate({ id: u.id, activo: !u.activo })}
                          disabled={mutEstado.isPending}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
                          title={u.activo ? "Desactivar" : "Activar"}
                        >
                          {u.activo
                            ? <ToggleRight className="size-4 text-emerald-600" />
                            : <ToggleLeft className="size-4" />}
                        </button>
                        <button
                          onClick={() => setEliminandoUsuario(u)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 transition-colors"
                          title="Eliminar usuario"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            {usuariosFiltrados.length} usuario{usuariosFiltrados.length !== 1 ? "s" : ""} encontrado{usuariosFiltrados.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {/* ── Modal crear/editar ── */}
      {modalUsuario !== null && (
        <ModalUsuario
          usuario={modalUsuario === "nuevo" ? null : modalUsuario}
          pdvs={pdvs}
          onCerrar={() => setModalUsuario(null)}
          onGuardar={handleGuardar}
          guardando={guardando}
        />
      )}

      {/* ── Confirmación eliminar ── */}
      {eliminandoUsuario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => !mutEliminar.isPending && setEliminandoUsuario(null)}>
          <div className="w-full max-w-sm rounded-2xl border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-2 flex flex-col items-center text-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40">
                <AlertTriangle className="size-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold">Eliminar usuario</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Estás a punto de eliminar permanentemente a{" "}
                  <strong className="text-foreground">{eliminandoUsuario.nombre}</strong>{" "}
                  ({eliminandoUsuario.rut}). Esta acción no se puede deshacer.
                </p>
              </div>
              <div className="w-full rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/40 px-4 py-2.5 text-left">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-0.5">Se eliminará:</p>
                <ul className="text-xs text-red-600 dark:text-red-400 space-y-0.5 list-disc list-inside">
                  <li>Perfil y acceso al sistema</li>
                  <li>Historial de turnos, cierres y ventas</li>
                  <li>Registros de gastos y depósitos asociados</li>
                </ul>
              </div>
            </div>
            <div className="flex gap-3 px-5 pb-5 pt-3">
              <button
                onClick={() => setEliminandoUsuario(null)}
                disabled={mutEliminar.isPending}
                className="flex-1 h-10 rounded-xl border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={mutEliminar.isPending}
                onClick={() => mutEliminar.mutate(eliminandoUsuario.id)}
              >
                {mutEliminar.isPending
                  ? <Loader2 className="size-4 animate-spin mr-1" />
                  : <Trash2 className="size-4 mr-1" />}
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
