// ─────────────────────────────────────────────────────────────────────────────
// Página: Login
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { User, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";

import { autoFormatRUT } from "@/lib/rut";

// ─── Props ──────────────────────────────────────────────────────────────────

interface LoginProps {
  onLogin: (rut: string, password: string) => boolean | Promise<boolean>;
  errorExterno: string | null;
}

// ─── Componente principal ───────────────────────────────────────────────────

export default function Login({ onLogin, errorExterno }: LoginProps) {
  const [rut, setRut] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const inputRutRef = useRef<HTMLInputElement>(null);

  const error = errorLocal ?? errorExterno;

  useEffect(() => {
    inputRutRef.current?.focus();
  }, []);

  const manejarRUT = (valor: string) => {
    setErrorLocal(null);
    setRut(autoFormatRUT(valor));
  };

  const manejarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!rut.trim()) {
      setErrorLocal("Ingresa tu RUT");
      return;
    }
    if (!password) {
      setErrorLocal("Ingresa tu contraseña");
      return;
    }

    setCargando(true);
    setErrorLocal(null);

    const exito = await onLogin(rut, password);
    if (!exito) setCargando(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted/40 p-4">
      <div className="w-full max-w-sm">

        {/* Logo + nombre empresa */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-foreground text-background shadow-lg">
            <span className="text-2xl font-black">N4</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Nuts 4 You</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sistema POS · Punto de Venta
          </p>
        </div>

        {/* Card de login */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Iniciar Sesión</CardTitle>
            <CardDescription>
              Ingresa con tu RUT y contraseña asignada
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={manejarSubmit} className="space-y-4" noValidate>

              {/* Campo RUT */}
              <div className="space-y-1.5">
                <label
                  htmlFor="rut"
                  className="text-sm font-medium text-foreground"
                >
                  RUT
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <User size={18} />
                  </div>
                  <Input
                    ref={inputRutRef}
                    id="rut"
                    type="text"
                    inputMode="numeric"
                    placeholder="12345678-9"
                    value={rut}
                    onChange={(e) => manejarRUT(e.target.value)}
                    className="h-11 pl-10"
                    autoComplete="username"
                    aria-invalid={!!error}
                    maxLength={10}
                  />
                </div>
              </div>

              {/* Campo Contraseña */}
              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-foreground"
                >
                  Contraseña
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Lock size={18} />
                  </div>
                  <Input
                    id="password"
                    type={mostrarPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setErrorLocal(null);
                      setPassword(e.target.value);
                    }}
                    className="h-11 pl-10 pr-11"
                    autoComplete="current-password"
                    aria-invalid={!!error}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setMostrarPassword(!mostrarPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={
                      mostrarPassword
                        ? "Ocultar contraseña"
                        : "Mostrar contraseña"
                    }
                  >
                    {mostrarPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                </div>
              </div>

              {/* Mensaje de error */}
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle size={15} />
                  <span>{error}</span>
                </div>
              )}

              {/* Botón de submit */}
              <Button
                type="submit"
                size="lg"
                className="w-full text-base font-semibold"
                disabled={cargando}
              >
                {cargando ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Ingresando…
                  </span>
                ) : (
                  "Ingresar"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Fecha actual */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {new Date().toLocaleDateString("es-CL", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>
    </div>
  );
}
