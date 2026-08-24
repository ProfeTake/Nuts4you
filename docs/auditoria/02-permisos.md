# Fase 2 — Usuarios, roles y permisos

> 4 roles en DB (`Rol.nombre`, String libre): **ADMIN, SUPERVISOR, BODEGUERO, VENDEDOR**. Único punto de **enforcement real** = middleware `autorizar()` en el backend + scopes manuales en algunos servicios. Todo lo del front es cosmético y evadible.

---

## 1. Capas de control (y cuál se puede saltar)

| Capa | Dónde | ¿Enforcement real? | Evadible |
|------|-------|--------------------|----------|
| `autenticar` | middleware, JWT 8h + revalida rol/activo en BD cada request | **Sí** | No (JWT firmado; demo bloqueado fuera de `/auth/*`) |
| `autorizar(...roles)` | por endpoint o `router.use` | **Sí** (única barrera real) | No — corre en servidor |
| Scope manual en servicio | `getTurnoConAcceso`, scope VENDEDOR en inventario/preparacion/despachos | Parcial | Ver P3/P6 (algunos endpoints sin scope) |
| **Menú admin** (`LayoutAdmin` ITEMS_ADMIN/SUPERVISOR) | front | **No** | **Sí**: basta teclear la URL o llamar la API |
| **Ramas de rol en `App.tsx`** | front | No (routing) | Sí (API directa) |
| **`lib/permisos.ts`** (matriz Rol×Módulo×Acción) | front | **No — CÓDIGO MUERTO** (ver P2) | N/A |

**Regla de oro:** el front NO protege nada. Lo único que decide qué puede hacer un rol es `autorizar()`. Por eso el análisis siguiente se basa en el backend.

---

## 2. Matriz Rol × Recurso × Acción (según `autorizar` — enforcement real)

✔ = permitido · — = 403 · *(scope)* = además limitado por PDV/propiedad en el servicio

| Recurso / acción | ADMIN | SUPERV. | BODEG. | VEND. | Ref |
|------------------|:---:|:---:|:---:|:---:|-----|
| Auth login / me | ✔ | ✔ | ✔ | ✔ | auth.rutas |
| POS abrir/cerrar turno | ✔ | ✔ | — | ✔ *(propio)* | pos.rutas:35,65 |
| POS registrar gasto | ✔ | ✔ | — | ✔ *(scope)* | pos.rutas:83 |
| POS eliminar gasto | ✔ | ✔ | — | — | pos.rutas:100 |
| POS retiros crear/ver | ✔ | ✔ | — | **—** | pos.rutas:114,130 |
| POS turno activo (GET) | ✔ | ✔ | ✔ | ✔ **(sin scope)** | pos.rutas:50 · P6 |
| Inventario PDV ver | ✔ | ✔ | ✔ | ✔ *(su PDV)* | inventario.rutas:10 |
| Inventario PDV editar | ✔ | ✔ | ✔ | — | inventario.rutas:38 |
| Bodega ver stock/despachos/historial | ✔ | ✔ | ✔ | — | bodega.rutas |
| Bodega crear inventario/producto | ✔ | ✔ | — | — | bodega.rutas:53,221 |
| Bodega ajustar stock/lote | ✔ | ✔ | ✔ | — | bodega.rutas:72,92 |
| Bodega editar **precio** | ✔ | — | — | — | bodega.servicio:62 |
| Bodega eliminar inventario | ✔ | — | — | — | bodega.rutas:125 |
| Bodega registrar despacho | ✔ | ✔ | ✔ | — | bodega.rutas:141 |
| Bodega confirmar despacho | ✔ | ✔ | — | ✔ *(su PDV)* | bodega.rutas:178 |
| Solicitudes crear/ver/confirmar | ✔ | ✔ | ✔ | ✔ *(propias)* | solicitudes.rutas |
| Solicitudes despachar | ✔ | ✔ | ✔ | — | solicitudes.rutas:49 |
| Solicitud-gasto solicitar | ✔ | ✔ | — | ✔ *(scope)* | gastoAutorizacion.rutas:24 |
| Solicitud-gasto listar/resolver/foto | ✔ | ✔ | — | — | gastoAutorizacion.rutas |
| Preparaciones ver/crear/anular | ✔ | ✔ | — | — | preparacion.rutas |
| Cierre preventivo ver/crear | ✔ | ✔ | — | — | cierrePreventivo.rutas |
| Cierre preventivo tareas/eliminar | ✔ | — | — | — | cierrePreventivo.rutas:77,107 |
| Finanzas depósitos ver/editar | ✔ | ✔ | — | — | finanzas.rutas |
| **Proveedores/Facturas** ver/crear/editar | ✔ | ✔ **⚠️** | — | — | proveedores.rutas · **P1** |
| Proveedores/Facturas eliminar | ✔ | — | — | — | proveedores.rutas:101,188 |
| **RRHH / Nómina / Horarios** (todo) | ✔ | ✔ **⚠️** | — | — | rrhh.rutas:23 · **P1** |
| Admin reportes (resumen/ventas/historial) | ✔ | ✔ | — | — | admin.rutas |
| Admin registro-diario **POST** | ✔ | ✔ | — | ✔ | admin.rutas:193 |
| Admin registro-diario **GET** | ✔ | ✔ | ✔ **⚠️** | ✔ **⚠️** | admin.rutas:213 · **P3** |
| Admin PDVs ver | ✔ | ✔ | — | — | admin.rutas:17 |
| Admin PDVs crear/editar/estado/eliminar | ✔ | — | — | — | admin.rutas |
| Config-bonos ver/editar | ✔ | — | — | — | configBono.rutas |
| Usuarios (CRUD, roles) | ✔ | — | — | — | usuarios.rutas:20 |
| Notificaciones propias | ✔ | ✔ | ✔ | ✔ *(propias)* | notificaciones.rutas |

⚠️ = el backend concede, pero el **menú del front lo oculta** a SUPERVISOR → divergencia (P1).

---

## 3. Divergencias entre las 3 "fuentes de verdad"

Existen **tres** definiciones de qué ve/hace un SUPERVISOR, y **no coinciden**:

| Recurso (para SUPERVISOR) | Backend `autorizar` (real) | Menú front (`LayoutAdmin`) | Matriz `permisos.ts` (muerta) |
|---------------------------|:--:|:--:|:--:|
| RRHH / Nómina | **Permitido** | Oculto | Permitido (rrhh) |
| Facturas / Proveedores | **Permitido** | Oculto | No modelado |
| Dashboard (resumen mensual) | Permitido | Oculto | Permitido (admin:ver) |
| Finanzas | Permitido | Visible | Permitido |
| Usuarios | Denegado | Oculto | No modelado |
| Gastos (autorización) | Permitido | Visible | No modelado |

**Consecuencia (P1):** como el front no protege, un SUPERVISOR llega a `/admin/personal` (RRHH: sueldos, `pago_diario`, nómina) y `/admin/facturas` **escribiendo la URL** o llamando la API directa. La restricción "supervisor sin RRHH ni usuarios" (comentario en `LayoutAdmin.tsx:66`) **no está implementada** donde importa.

**Roles en DB vs código vs UI:**
- DB: 4 roles String libre (seed.ts:23). Sin enum, sin FK a un catálogo tipado.
- Backend: strings mágicos repetidos en 60+ `autorizar('ADMIN'...)`. Un rename del rol en DB o un typo rompe silenciosamente (deniega — fail-safe, pero frágil). → P7.
- UI: `App.tsx` bifurca por rol; `BODEGUERO` no encaja en ninguna vista propia → P5.

---

## 4. Endpoints sin verificación de permiso (solo `autenticar`)

| Endpoint | Riesgo | Sev. |
|----------|--------|------|
| `GET /admin/registro-diario` | Sin `autorizar` ni scope: cualquier autenticado lee el registro diario de **cualquier** sucursal (pdvId+fecha) | Medio (P3) |
| `GET /pos/turnos/activo` | Sin scope: expone id/usuario/saldo inicial del turno activo de cualquier PDV | Bajo (P6) |
| `GET /pos/pdvs` | Lista de PDVs a cualquier autenticado | Bajo |
| `GET /bodega/despachos/pendientes` | Scope solo para VENDEDOR; otros roles ven cualquier PDV | Bajo |
| `GET /preparaciones/pdv/:pdvId` | Idem, scope solo VENDEDOR | Bajo |

Los `notificaciones/*` y `pos GET /turnos/:id/gastos` **sí** están auto-scoped por `usuario.id` / `getTurnoConAcceso` en el servicio → correctos.

---

## 5. Escaladas de privilegio y lockout

| # | Sev. | Descripción | Ref |
|---|------|-------------|-----|
| **P1** | **Alto** | SUPERVISOR accede a RRHH/Nómina y Facturas vía API/URL (backend lo permite; solo el menú lo oculta). Exposición de sueldos y finanzas. | rrhh.rutas:23 · proveedores.rutas |
| **P2** | Alto | `lib/permisos.ts` es **código muerto** (`tienePermiso`/`modulosAccesibles` sin consumidores). Da falsa sensación de matriz centralizada; está desincronizada del backend. | [permisos.ts](frontend/src/lib/permisos.ts) |
| **P3** | Medio | `GET /admin/registro-diario` sin `autorizar` ni scope → fuga de reportes diarios a cualquier autenticado. | [admin.rutas.ts:213-227](backend/src/rutas/admin.rutas.ts#L213-L227) |
| **P4** | Medio | Sin guarda de "último admin" en `editarUsuario`/`cambiarEstadoUsuario`: un ADMIN puede degradar el rol o **desactivar al único admin** → lockout total. Solo `eliminarUsuario` protege. | [usuarios.servicio.ts:83-124](backend/src/servicios/usuarios.servicio.ts#L83-L124) |
| **P5** | Medio | Rol **BODEGUERO medio-cableado**: backend le da bodega/despachos, pero `App.tsx` lo enruta al POS de vendedor y las pantallas de bodega viven en el layout admin (inaccesible). Rol sin superficie de UI. | [App.tsx:173-244](frontend/src/App.tsx#L173-L244) |
| **P6** | Bajo | `GET /pos/turnos/activo` sin scope de PDV. | pos.rutas:50 |
| **P7** | Bajo | Roles como strings mágicos sin enum; `Rol.nombre` String libre. Frágil ante rename/typo. | autorizar.ts · schema.prisma:10 |
| **P8** | Bajo | `pdvId` del JWT no se revalida (sí rol/activo); cambio de asignación tarda ≤8h en propagar. | autenticar.ts:49-61 |

**Lo que está BIEN:** `crearPersonal` (RRHH) fuerza rol VENDEDOR → un supervisor no puede fabricar admins por esa vía (usuarios.servicio via RRHH). Usuarios CRUD con roles arbitrarios es solo-ADMIN. `eliminarUsuario` protege al último admin y contra auto-borrado, con conteo dentro de la transacción. Revocación por BD en cada request. Rate-limit en login. Demo aislado.

---

## 6. Recomendación de arquitectura de permisos

1. **Una sola fuente de verdad tipada.** Crear `roles.ts` compartido (enum `Rol`) y un mapa `permisos: Record<Rol, Recurso[]>` consumido por: (a) `autorizar()` en backend, (b) generación del menú y guards del front. Eliminar la matriz muerta o promoverla a esa fuente.
2. **Decidir la política de SUPERVISOR** (P1): si RRHH/Facturas deben ser admin-only, cambiar `autorizar('ADMIN','SUPERVISOR')` → `autorizar('ADMIN')` en `rrhh.rutas` y las rutas de facturas. Si no, quitar el ocultamiento del menú. Hoy la intención está contradicha entre capas.
3. **Cerrar los huecos de scope** (P3, P6): añadir `autorizar` + scope por PDV.
4. **Guardas de integridad de admin** (P4): replicar la protección del último admin en editar/estado.
5. **Definir el rol BODEGUERO en UI** (P5) o fusionar sus funciones donde correspondan (se retoma en Fase 3/4).

---

## No determinable sin ejecutar
- No verifiqué en runtime que un token de SUPERVISOR efectivamente reciba 200 en `/api/rrhh/nomina` (P1); se infiere del middleware. Un test de integración lo confirmaría en minutos.
- La existencia real de usuarios BODEGUERO en la DB de producción (que agravaría/atenuaría P5) no es observable desde el código.

---

**FASE 2 COMPLETA.** Esperando **"continúa"** para la Fase 3 (redundancia y arquitectura: duplicación real por concepto, esquema objetivo antes→después, análisis de fusión de módulos y riesgos de refactor).
