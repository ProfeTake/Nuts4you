# Plan de Mejoras — Nuts 4 You ERP/POS
_Auditoría realizada el 2026-06-15. Codebase en commit `e42a4e6`._

---

## 0. Estado de Implementación (actualizado 2026-06-15)

Implementado en código en esta sesión (sin commit/push aún, builds back+front verdes):

| Ítem | Estado | Notas |
|------|--------|-------|
| SEC-02 / A3 | ✅ Hecho | Fail-fast de `JWT_SECRET` en producción (`entorno.ts`) |
| SEC-04 / A4 | ✅ Hecho | `express-rate-limit` (10/15min) en `/auth/login` |
| SEC-09 / A5 | ✅ Hecho | Password `min(8).max(128)` en `usuarios.schema.ts` |
| SEC-06 / B1 | ✅ Hecho | Check de último admin movido dentro de la transacción |
| SEC-07 / B2 | ✅ Hecho | 403 simplificado a "Acceso denegado" (detalle solo en log) |
| SEC-10 / B3 | ✅ Hecho | Schema Zod en `POST /admin/registro-diario` |
| SEC-08 / B4 | ✅ Hecho | Scope de PDV para VENDEDOR en `GET /inventario/:pdvId` |
| SEC-12 / B5 | ✅ Hecho | `express.json({ limit: '100kb' })` + urlencoded |
| SEC-11 | ✅ Hecho | CORS falla seguro en prod si falta `FRONTEND_URL` |
| OPT-04 / C1 | ✅ Hecho | Import estático de prisma en `pos.rutas.ts` |
| OPT-03 / C2 | ✅ Hecho | N+1 de últimos 7 días → 1 query agrupada |
| OPT-06 / C3 | ✅ Hecho | Timezone Chile DST-aware (`lib/tiempoChile.ts`, sin deps externas) |
| OPT-10 / C4 | ✅ Hecho | Timeouts en Nodemailer |
| OPT-01 / C5 | ✅ Hecho | `BODEGA_PDV_ID` resuelto por tipo BODEGA y cacheado |
| OPT-05 / C6 | ✅ Hecho | Seed upsert de PDV por nombre (no por índice) |
| OPT-08 / C7 | ✅ Hecho | Manejo de 401 → limpia token y redirige a /login |
| OPT-02 | ⚠️ Parcial | Advertencia + TODO P6 documentados (migración a BD = Fase D) |

**Pendiente de acción manual tuya (no código):**
- **SEC-01 / A1** — Revocar el token `ghp_...` en GitHub (P7 de PENDIENTES).
- **SEC-03 / A2** — Cambiar contraseñas de admin y vendedoras en producción.

**Implementado además (PENDIENTES, autorizado por el usuario):**
- **P4** — Formulario RegistroDiario montado en ruta `/pos/registro-diario` + ítem de menú; funciones duplicadas en `admin.servicio.ts` eliminadas.
- **P6 / D1 / OPT-02** — Tabla `ConfigBono` + migración con seed, endpoints CRUD, pestaña **Bonos** en RRHH, `calcularBono` lee de BD. ⚠️ Falta `migrate deploy` en prod.
- **P5** — Borrador de conteo del POSDashboard persistido en el store (sobrevive refrescos) + sincronización del turno con el backend.

**Diferido (Fase D / estructural):** SEC-05 (cookies httpOnly), SEC-13 (reemplazar `xlsx`), OPT-07 (paginación), OPT-09 (DRY queries usuario).

---

## 1. Resumen Ejecutivo

El proyecto se encuentra en un estado **sólido para una versión 1.0 en producción**. La arquitectura de capas (rutas → servicios → Prisma) es coherente, las validaciones Zod cubren todos los endpoints públicos, y el modelo de datos en 3FN es correcto. Sin embargo, la auditoría identificó **4 vulnerabilidades de seguridad de prioridad alta** que deben corregirse antes de que el sistema maneje dinero real de forma continua, más un conjunto de deuda técnica de prioridad media-baja que impacta la mantenibilidad a largo plazo.

Los puntos más urgentes del `PENDIENTES.md` que coinciden con hallazgos de esta auditoría son:
- **P7 pendiente menor**: Rotar el token `ghp_...` en el historial de git — **es el ítem #1 de seguridad**.
- **P6**: Los bonos hardcodeados por nombre de PDV crean un bug silencioso si el nombre del PDV cambia en la UI de admin.
- **P4**: El `RegistroDiario` recibe el campo `datos` sin validación de esquema Zod, lo cual es una brecha menor pero real.

---

## 2. Reporte de Seguridad

### 🔴 RIESGO ALTO

---

#### SEC-01 — Token de GitHub expuesto en historial de git
**Archivo:** Historial de git (mencionado en `PENDIENTES.md` P7)
**Descripción:** Un Personal Access Token de GitHub (`ghp_...`) fue embebido en la URL del remoto durante el setup de Railway y quedó en el historial de commits. Cualquier persona con acceso al repositorio (o a una copia clonada del mismo) puede leer ese token desde el historial.
**Impacto:** Acceso potencial completo a la cuenta de GitHub, incluyendo fuerza de push a `main`, lectura de secrets de GitHub Actions, y administración de repositorios.
**Solución:**
1. Revocar el token inmediatamente en `github.com → Settings → Developer settings → Personal access tokens`.
2. Generar un token nuevo solo con los permisos mínimos necesarios (scope `repo` solo si Railway lo requiere).
3. Reconfigurar el remoto usando el nuevo token o, preferiblemente, usando la integración OAuth de Railway sin tokens en URLs.
4. Purgar el commit del historial con `git filter-repo --path-glob '*' --replace-refs delete-no-add` (si el repo es privado, purgar es opcional pero recomendable).

---

#### SEC-02 — JWT Secret con fallback débil predecible
**Archivo:** `backend/src/config/entorno.ts:25`
```typescript
jwtSecret: process.env.JWT_SECRET || "nuts4you_dev_secret_cambiar_en_prod",
```
**Descripción:** Si la variable `JWT_SECRET` no está definida en el entorno de producción (Railway), el sistema cae silenciosamente al valor literal `"nuts4you_dev_secret_cambiar_en_prod"`. Este valor está **en el código fuente del repositorio**, lo que significa que cualquier persona con acceso al repo puede forjar tokens JWT válidos para cualquier usuario, incluyendo ADMIN.
**Impacto:** Compromiso total de autenticación. Un atacante puede generar un token para `{ rol: "ADMIN" }` y acceder a cualquier endpoint.
**Solución:**
```typescript
// backend/src/config/entorno.ts
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('[FATAL] JWT_SECRET no está configurado en producción. El servidor no puede arrancar.')
}
jwtSecret: process.env.JWT_SECRET || "nuts4you_dev_secret_cambiar_en_prod",
```
Esto hace que el servidor falle en el arranque en producción si el secret no está configurado, en lugar de correr silenciosamente con el valor inseguro.

---

#### SEC-03 — Credenciales débiles hardcodeadas en seed (y replicadas en producción)
**Archivo:** `backend/prisma/seeds/seed.ts:116-156`
**Descripción:** El seed crea usuarios con contraseñas en texto plano en el código fuente:
- Admin (`11111111-1`): password `"admin"`
- Supervisor y todas las vendedoras: password `"1234"`

El seed **se ejecutó en producción** (Railway, según `PENDIENTES.md` P7 completado). Estas contraseñas están activas en el sistema en producción en este momento.
**Impacto:** Un atacante que conozca el RUT de cualquier empleada (dato semi-público) puede autenticarse con `"1234"`.
**Solución a corto plazo:** Forzar un cambio de contraseña inmediato para todos los usuarios en producción desde la interfaz de Gestión de Usuarios.
**Solución estructural:**
1. El seed debe leer contraseñas desde variables de entorno o un archivo `.env.seed` excluido del repositorio.
2. Agregar un campo `debe_cambiar_password: Boolean @default(false)` al modelo `Usuario` para forzar el cambio en el primer login.
3. El endpoint `POST /api/rrhh/personal` en `rrhh.servicio.ts:69` también hardcodea `'1234'` para nuevos empleados — aplicar la misma solución.

---

#### SEC-04 — Sin rate limiting en el endpoint de login
**Archivo:** `backend/src/rutas/auth.rutas.ts:9`
**Descripción:** El endpoint `POST /api/auth/login` no tiene limitación de intentos. Un atacante puede hacer miles de peticiones por segundo probando contraseñas contra el sistema.
**Impacto:** Con contraseñas de solo 4 caracteres (`min(4)` en `usuarios.schema.ts:8`), un ataque de diccionario contra los RUTs conocidos es trivial.
**Solución:** Instalar `express-rate-limit` y aplicarlo al router de auth:
```typescript
// backend/src/rutas/auth.rutas.ts
import rateLimit from 'express-rate-limit'

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,                   // 10 intentos por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login. Intenta en 15 minutos.' },
})

router.post('/login', loginLimiter, async (req, res, next) => { ... })
```
**Dependencia a agregar:** `npm install express-rate-limit` (0 dependencias adicionales, ~3KB).

---

### 🟠 RIESGO MEDIO

---

#### SEC-05 — JWT almacenado en localStorage (vulnerable a XSS)
**Archivo:** `frontend/src/lib/api.ts:17`
```typescript
const token = localStorage.getItem('token')
```
**Descripción:** El token JWT se guarda en `localStorage`, que es accesible desde cualquier JavaScript que corra en el origen. Si en algún momento se introduce una vulnerabilidad XSS (incluyendo una dependencia comprometida), el token puede ser robado.
**Impacto:** Robo de sesión persistente. El atacante puede operar como el usuario víctima durante toda la vida del token (8h).
**Solución ideal (requiere cambios en backend):** Migrar a cookies `httpOnly` + `SameSite=Strict`. El backend debe emitir la cookie en el login y leerla en el middleware de auth.
**Solución intermedia (sin cambios de backend):** Guardar el token en `sessionStorage` en lugar de `localStorage`. El token solo persiste mientras la pestaña está abierta y no es accesible desde otros orígenes.
**Nota:** Para una aplicación interna sin datos de tarjetas de crédito, el riesgo es manejable si se evita cargar scripts de terceros sin revisar.

---

#### SEC-06 — Race condition al verificar el último administrador
**Archivo:** `backend/src/servicios/usuarios.servicio.ts:135-139`
```typescript
const totalAdmins = await prisma.usuario.count({ where: { rol: { nombre: 'ADMIN' }, activo: true } })
if (totalAdmins <= 1) throw new Error('...')
await tx.usuario.delete({ where: { id } })
```
**Descripción:** El conteo de admins ocurre fuera de la transacción. Si dos requests simultáneos intentan eliminar los dos últimos admins, ambos pasan el check y el sistema queda sin administrador.
**Solución:** Mover la verificación dentro de la transacción `$transaction` ya existente:
```typescript
await prisma.$transaction(async (tx) => {
  if (usuario.rol.nombre === 'ADMIN') {
    const totalAdmins = await tx.usuario.count({ where: { rol: { nombre: 'ADMIN' }, activo: true } })
    if (totalAdmins <= 1) throw new Error('No se puede eliminar el único administrador activo')
  }
  // ... resto de la transacción
})
```

---

#### SEC-07 — Fuga de información en respuesta de autorización
**Archivo:** `backend/src/middlewares/autorizar.ts:17-20`
```typescript
res.status(403).json({
  error: 'Sin permisos',
  detalle: `Rol ${req.usuario.rol} no tiene acceso. Roles permitidos: ${rolesPermitidos.join(', ')}`,
})
```
**Descripción:** La respuesta de error 403 expone el mapa completo del sistema de roles: qué rol tiene el usuario y qué roles tienen acceso a ese endpoint. Esto es información valiosa para un atacante que esté explorando la API.
**Solución:** Simplificar la respuesta a:
```typescript
res.status(403).json({ error: 'Acceso denegado' })
```
El detalle es útil para desarrollo; eliminarlo en producción. Si se necesita para debugging, loguearlo en servidor sin exponerlo en la respuesta.

---

#### SEC-08 — Endpoint `GET /api/inventario/:pdvId` sin restricción de rol
**Archivo:** `backend/src/rutas/inventario.rutas.ts:10-25`
**Descripción:** El endpoint `GET /api/inventario/:pdvId` solo requiere autenticación (`autenticar`), sin restricción de rol. Cualquier usuario autenticado (incluyendo VENDEDOR) puede consultar el inventario de **cualquier** PDV por su ID, no solo el suyo.
**Impacto:** Un VENDEDOR de Mall Patio puede consultar el inventario de Cugat Rengo o de la Bodega Central. Información de negocio potencialmente sensible.
**Solución:** Agregar lógica de scope: si el rol es VENDEDOR, verificar que `pdvId` sea igual al `pdvId` del JWT del usuario. ADMIN/SUPERVISOR pueden ver cualquier PDV.

---

#### SEC-09 — Contraseña mínima de solo 4 caracteres
**Archivo:** `backend/src/validaciones/usuarios.schema.ts:8`
```typescript
password: z.string().min(4, 'Mínimo 4 caracteres'),
```
**Descripción:** Con el RUT como nombre de usuario (semi-público en Chile) y una contraseña mínima de 4 caracteres, el espacio de búsqueda es extremadamente pequeño.
**Solución:** Aumentar el mínimo a 8 caracteres:
```typescript
password: z.string().min(8, 'Mínimo 8 caracteres').max(128),
```
El `max(128)` es importante para proteger bcrypt de ataques DoS con contraseñas extremadamente largas.

---

#### SEC-10 — `RegistroDiario` acepta payload sin validación Zod
**Archivo:** `backend/src/rutas/admin.rutas.ts:195`
```typescript
const { pdvId, fecha, datos } = req.body as { pdvId: number; fecha: string; datos: unknown }
if (!pdvId || !fecha) { res.status(400).json({ error: 'Se requieren pdvId y fecha' }); return }
```
**Descripción:** El endpoint `POST /api/admin/registro-diario` no pasa el cuerpo por un schema Zod. El campo `datos` se acepta sin ninguna restricción de tipo y se guarda directamente en la columna JSON. Tampoco hay validación de que `fecha` tenga formato de fecha válido o que `pdvId` sea un entero positivo.
**Solución:** Crear un schema Zod para este endpoint:
```typescript
const registroDiarioSchema = z.object({
  pdvId: z.number().int().positive(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido'),
  datos: z.record(z.unknown()),
})
```

---

### 🟡 RIESGO BAJO

---

#### SEC-11 — CORS sin restricción cuando `NODE_ENV !== 'production'`
**Archivo:** `backend/src/servidor.ts:13-15`
**Descripción:** Si por cualquier razón Railway no inyecta `NODE_ENV=production` o `FRONTEND_URL` queda vacío, el CORS se abre a todos los orígenes (`origin: true`).
**Solución:** Ser explícito con la lista de orígenes incluso en desarrollo, o al menos fallar de forma segura:
```typescript
const origenesPermitidos = entorno.nodoEntorno === 'production'
  ? (entorno.frontendUrl ? [entorno.frontendUrl] : (() => { throw new Error('[FATAL] FRONTEND_URL no configurado en producción') })())
  : ['http://localhost:5173', 'http://localhost:4173']
```

#### SEC-12 — Sin límite de tamaño en `express.json()`
**Archivo:** `backend/src/servidor.ts:18`
**Descripción:** El body parser no tiene límite explícito configurado. El default de Express es 100kb, suficiente para este sistema, pero debe ser explícito.
**Solución:** `app.use(express.json({ limit: '100kb' }))`

#### SEC-13 — Paquete `xlsx` con vulnerabilidades conocidas y sin mantenimiento
**Archivo:** `frontend/package.json:38`
**Descripción:** `"xlsx": "^0.18.5"` (SheetJS CE) no recibe actualizaciones de seguridad desde 2023. Tiene CVEs conocidos relacionados con parsing de archivos maliciosos.
**Impacto:** Un archivo Excel malicioso subido por un usuario podría explotar el parser. En este contexto (solo admins suben Excel), el riesgo es bajo pero real.
**Solución:** Migrar a `exceljs` (activamente mantenido) o limitar el tamaño/validación del archivo antes de parsear.

---

## 3. Optimizaciones de Código

_(Todas son refactorizaciones "bajo el capó" — ninguna cambia UI ni lógica de negocio.)_

### OPT-01 — `BODEGA_PDV_ID = 1` hardcodeado (fragilidad silenciosa)
**Archivo:** `backend/src/servicios/bodega.servicio.ts:4`
```typescript
const BODEGA_PDV_ID = 1
```
**Problema:** Si el ID de la Bodega Central cambia (por un re-seed o migración), toda la lógica de despacho falla silenciosamente o apunta al PDV equivocado. No hay ningún check que valide que el PDV con ID=1 sea efectivamente de tipo BODEGA.
**Mejora:** Resolver el ID en tiempo de inicio del servidor:
```typescript
// Una vez al arrancar, se resuelve y cachea
let BODEGA_PDV_ID: number

export async function resolverBodegaId(): Promise<number> {
  if (BODEGA_PDV_ID) return BODEGA_PDV_ID
  const bodega = await prisma.pDV.findFirstOrThrow({ where: { tipo: 'BODEGA' } })
  BODEGA_PDV_ID = bodega.id
  return BODEGA_PDV_ID
}
```

---

### OPT-02 — `calcularBono` acoplado al nombre exacto del PDV
**Archivo:** `backend/src/servicios/calculos.servicio.ts:19-48`
```typescript
const TABLA_BONOS: Record<string, TramoBonoItem[]> = {
  'Mall Patio': [...],
  'Paseo Independencia': [...],
  // ...
}
```
**Problema:** La clave del mapa es el nombre del PDV como string. Si un admin cambia el nombre de "Paseo Independencia" a "Paseo" desde la UI, el cálculo de bonos retorna 0 silenciosamente para todos los turnos de ese PDV. Este es el bug de P6 del PENDIENTES.md.
**Mejora (cuando se implemente la tabla `ConfigBono`):** Usar el PDV ID como clave. Mientras tanto, documentar explícitamente el riesgo:
```typescript
// ADVERTENCIA: Las claves son los nombres EXACTOS del PDV en la BD.
// Si el admin cambia el nombre de un PDV, esta tabla debe actualizarse manualmente.
// TODO P6: migrar a tabla ConfigBono en BD usando pdv_id como clave.
```

---

### OPT-03 — N+1 queries en `getResumenDiario` (7 queries en loop)
**Archivo:** `backend/src/servicios/admin.servicio.ts:150-160`
```typescript
for (let i = 6; i >= 0; i--) {
  // Una query de Prisma por cada día
  const turnosDiaI = await prisma.turnoCaja.findMany({...})
}
```
**Problema:** Para calcular las ventas de los últimos 7 días, se ejecutan 7 queries de BD en un loop secuencial. Esto es el patrón N+1.
**Mejora:** Una sola query agrupada por fecha:
```typescript
const hace7dias = new Date(Date.now() - 7 * 86_400_000)
const turnosUltimos7 = await prisma.turnoCaja.findMany({
  where: { fecha_apertura: { gte: hace7dias }, estado: 'CERRADO' },
  select: { fecha_apertura: true, total_calculado: true },
})
// Agrupar en memoria por día de Chile
```
Reducción: de 7 queries a 1.

---

### OPT-04 — `import()` dinámico dentro de un route handler
**Archivo:** `backend/src/rutas/pos.rutas.ts:17`
```typescript
const prisma = (await import('../config/prisma')).default
```
**Problema:** Se usa un `dynamic import()` dentro del handler de `GET /api/pos/pdvs`. Esto retrasa la carga del módulo hasta la primera petición y añade latencia innecesaria. Node.js cachea los módulos después del primer import, pero el overhead del `await import()` persiste.
**Mejora:** Mover a un import estático al tope del archivo junto con el resto de imports:
```typescript
import prisma from '../config/prisma'
```

---

### OPT-05 — `seed.ts` usa `indexOf(item) + 1` como ID para upsert
**Archivo:** `backend/prisma/seeds/seed.ts:29-35`
```typescript
where: { id: sucursalesData.indexOf(s) + 1 },
update: { nombre: s.nombre, tipo: s.tipo },
create: { nombre: s.nombre, tipo: s.tipo },
```
**Problema:** El upsert asume que el ID auto-incrementado en la BD será igual al índice del array + 1. Esto falla si la BD ya tiene registros con IDs distintos. En un re-seed sobre una BD existente con IDs distintos, el upsert podría actualizar el registro equivocado.
**Mejora:** Usar el nombre como clave del upsert (ya es único de facto):
```typescript
await prisma.pDV.upsert({
  where: { nombre: s.nombre }, // usar nombre como clave natural
  update: { tipo: s.tipo },
  create: { nombre: s.nombre, tipo: s.tipo },
})
```
Requiere agregar `@@unique([nombre])` en el modelo PDV o usar `findFirst` + condicional.

---

### OPT-06 — Timezone de Chile hardcodeada como `-04:00` (offset fijo)
**Archivo:** `backend/src/servicios/admin.servicio.ts:61,124`
```typescript
const inicio = new Date(`${fecha}T00:00:00-04:00`)
```
**Problema:** Chile usa `America/Santiago`, que es UTC-4 en verano (DST: octubre-marzo) y UTC-3 en invierno (abril-septiembre). Con un offset fijo de -4, los rangos de fecha estarán desfasados 1 hora durante el invierno chileno, potencialmente excluyendo o incluyendo turnos erróneos en los reportes.
**Mejora:** Usar la librería `date-fns-tz` (ya presente como dependencia de `date-fns` v4):
```typescript
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
const CHILE_TZ = 'America/Santiago'

function rangoFechaChile(fecha: string) {
  const inicio = fromZonedTime(new Date(`${fecha}T00:00:00`), CHILE_TZ)
  const fin    = fromZonedTime(new Date(`${fecha}T23:59:59.999`), CHILE_TZ)
  return { inicio, fin }
}
```

---

### OPT-07 — Sin paginación en endpoints con crecimiento ilimitado
**Archivos:**
- `backend/src/servicios/finanzas.servicio.ts` — `getDepositos()`
- `backend/src/servicios/solicitudes.servicio.ts` — `getSolicitudes()`
- `backend/src/servicios/admin.servicio.ts` — `getHistorialTurnosSucursal()` (devuelve todos sin límite)

**Problema:** A medida que el sistema lleva meses de operación, estas queries devolverán cientos de registros en una sola respuesta. Impacto en memoria, latencia y experiencia de usuario.
**Mejora:** Añadir parámetros `limit` y `cursor` (paginación por cursor de Prisma) o `page`/`pageSize` simples. Para el historial de turnos, el parámetro de rango de fechas ya mitiga el problema a corto plazo.

---

### OPT-08 — `api.ts` sin manejo de token expirado (401)
**Archivo:** `frontend/src/lib/api.ts:33-36`
```typescript
if (!response.ok) {
  const error = await response.json().catch(() => ({ error: 'Error de conexión' }))
  throw new Error(error.error ?? `Error ${response.status}`)
}
```
**Problema:** Cuando el JWT expira (a las 8h), el servidor responde 401. El cliente solo arroja un `Error` genérico. No hay mecanismo de redirección automática al login, por lo que el usuario ve un error críptico o la UI queda en estado inválido.
**Mejora:**
```typescript
if (response.status === 401) {
  localStorage.removeItem('token')
  window.location.href = '/login' // o usar navigate() de react-router
  return
}
```

---

### OPT-09 — `getUsuarios` duplica la lógica de `getPersonal` (DRY)
**Archivos:**
- `backend/src/servicios/usuarios.servicio.ts:30-47`
- `backend/src/servicios/rrhh.servicio.ts:39-56`

**Problema:** Ambas funciones ejecutan una query muy similar sobre `Usuario` con `include: { rol, pdv, turnos }` y luego formatean el resultado con funciones distintas (`formatearUsuario` vs `formatearPersonal`). La lógica de "obtener el PDV del último turno" está duplicada.
**Mejora:** Extraer la query base con includes a una función compartida en un módulo `src/servicios/shared/usuario.query.ts` y reutilizarla en ambos servicios.

---

### OPT-10 — `correo.servicio.ts` no tiene timeout configurado para Nodemailer
**Archivo:** `backend/src/servicios/correo.servicio.ts:14-19`
**Problema:** Si el servidor SMTP no responde, el request de Nodemailer puede bloquear el event loop durante el timeout por defecto de TCP (varios minutos), bloqueando el endpoint de `publicarHorarios`.
**Mejora:** Configurar timeout explícito:
```typescript
return nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort ?? 587,
  connectionTimeout: 5_000,  // 5s
  greetingTimeout:   5_000,
  socketTimeout:     10_000,
  // ...
})
```

---

## 4. Plan de Acción

Ordenado por impacto/urgencia. Las tareas marcadas con 🔒 son de seguridad y deben hacerse antes de que el sistema procese operaciones sensibles reales.

### Fase A — Inmediata (esta semana) 🔒

| # | Tarea | Archivo(s) | Tiempo estimado |
|---|-------|-----------|----------------|
| A1 | **Revocar token GitHub** `ghp_...` en github.com/settings | — | 5 min |
| A2 | **Cambiar contraseñas en producción** de admin y todas las vendedoras | Railway (UI del sistema) | 15 min |
| A3 | **Fail-fast si JWT_SECRET no está en prod** | `backend/src/config/entorno.ts:25` | 10 min |
| A4 | **Agregar `express-rate-limit` al login** | `backend/src/rutas/auth.rutas.ts` | 20 min |
| A5 | **Subir mínimo de contraseña a 8 chars + agregar max(128)** | `backend/src/validaciones/usuarios.schema.ts` + `usuarios.schema.ts` en frontend | 10 min |

### Fase B — Esta semana (seguridad media)

| # | Tarea | Archivo(s) | Tiempo estimado |
|---|-------|-----------|----------------|
| B1 | Mover check de último admin dentro de la transacción | `backend/src/servicios/usuarios.servicio.ts:135` | 15 min |
| B2 | Simplificar mensaje de error 403 en `autorizar.ts` | `backend/src/middlewares/autorizar.ts:17` | 5 min |
| B3 | Agregar validación Zod al endpoint `POST /api/admin/registro-diario` | `backend/src/rutas/admin.rutas.ts:195` | 20 min |
| B4 | Agregar scope de PDV al `GET /api/inventario/:pdvId` para VENDEDORs | `backend/src/rutas/inventario.rutas.ts` | 30 min |
| B5 | Configurar `express.json({ limit: '100kb' })` | `backend/src/servidor.ts` | 2 min |

### Fase C — Próxima semana (optimizaciones)

| # | Tarea | Archivo(s) | Tiempo estimado |
|---|-------|-----------|----------------|
| C1 | Fix import dinámico de prisma en `pos.rutas.ts` | `backend/src/rutas/pos.rutas.ts:17` | 5 min |
| C2 | Fix N+1 en `getResumenDiario` (ultimos7 días) | `backend/src/servicios/admin.servicio.ts:150` | 1h |
| C3 | Fix timezone Chile dinámica (date-fns-tz) | `backend/src/servicios/admin.servicio.ts:61` | 45 min |
| C4 | Agregar timeout a Nodemailer | `backend/src/servicios/correo.servicio.ts` | 10 min |
| C5 | Resolver `BODEGA_PDV_ID` dinámicamente | `backend/src/servicios/bodega.servicio.ts` | 30 min |
| C6 | Fix upsert en seed.ts usando nombre como clave | `backend/prisma/seeds/seed.ts:29` | 20 min |
| C7 | Manejo de 401 en `api.ts` → redirect a login | `frontend/src/lib/api.ts:33` | 20 min |

### Fase D — Cuando el cliente lo autorice (mejoras estructurales)

| # | Tarea | Prioridad | Vinculado a |
|---|-------|-----------|------------|
| D1 | Tabla `ConfigBono` en BD (P6 de PENDIENTES) | Alta | OPT-02 |
| D2 | Paginación en endpoints de historial/depósitos | Media | OPT-07 |
| D3 | Migrar JWT de `localStorage` a cookies `httpOnly` | Media | SEC-05 |
| D4 | Reemplazar `xlsx` por `exceljs` | Baja | SEC-13 |
| D5 | Extraer query base de Usuario (DRY) | Baja | OPT-09 |
| D6 | Tests de integración del flujo crítico (login → apertura → cierre) | Alta | PENDIENTES futuro |

---

## Anexo: Matriz de Riesgos

| ID | Vulnerabilidad / Mejora | Riesgo | Esfuerzo | Prioridad |
|----|------------------------|--------|----------|-----------|
| SEC-01 | Token GitHub en historial | 🔴 Alto | Bajo | 🔥 Inmediata |
| SEC-02 | JWT fallback débil | 🔴 Alto | Bajo | 🔥 Inmediata |
| SEC-03 | Credenciales débiles en producción | 🔴 Alto | Bajo | 🔥 Inmediata |
| SEC-04 | Sin rate limiting en login | 🔴 Alto | Bajo | 🔥 Inmediata |
| SEC-05 | JWT en localStorage | 🟠 Medio | Alto | Fase D |
| SEC-06 | Race condition último admin | 🟠 Medio | Bajo | Fase B |
| SEC-07 | Fuga info en 403 | 🟠 Medio | Bajo | Fase B |
| SEC-08 | Inventario sin scope de rol | 🟠 Medio | Medio | Fase B |
| SEC-09 | Contraseña mínima 4 chars | 🟠 Medio | Bajo | Fase A |
| SEC-10 | RegistroDiario sin validación | 🟠 Medio | Bajo | Fase B |
| SEC-11 | CORS fallback inseguro | 🟡 Bajo | Bajo | Fase B |
| SEC-12 | Body size sin límite explícito | 🟡 Bajo | Mínimo | Fase B |
| SEC-13 | xlsx sin mantenimiento | 🟡 Bajo | Alto | Fase D |
| OPT-01 | BODEGA_PDV_ID hardcoded | 🟠 Medio | Medio | Fase C |
| OPT-02 | calcularBono por nombre | 🟠 Medio | Alto (P6) | Fase D |
| OPT-03 | N+1 en resumen diario | 🟡 Bajo | Medio | Fase C |
| OPT-04 | Import dinámico Prisma | 🟡 Bajo | Mínimo | Fase C |
| OPT-05 | Seed con indexOf+1 | 🟡 Bajo | Bajo | Fase C |
| OPT-06 | Timezone fija -04:00 | 🟠 Medio | Bajo | Fase C |
| OPT-07 | Sin paginación | 🟡 Bajo | Alto | Fase D |
| OPT-08 | Sin manejo de 401 en cliente | 🟠 Medio | Bajo | Fase C |
| OPT-09 | DRY en queries de usuario | 🟡 Bajo | Medio | Fase D |
| OPT-10 | Nodemailer sin timeout | 🟡 Bajo | Mínimo | Fase C |
