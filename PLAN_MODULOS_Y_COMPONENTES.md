# Plan De Trabajo Por Modulos Y Criterios Para Modificar Componentes

## Objetivo

Excelente, vamos creando el programa como tal y mejorando los aspectos necesarios dentro de los modulos respectivos. Para avanzar con orden, este documento define como intervenir cada modulo, que tipo de cambios conviene hacer en sus componentes y que comentarios debemos dejar para mantener trazabilidad funcional y tecnica.

El objetivo no es modificar archivos al azar, sino trabajar con una metodologia consistente para que el sistema crezca sin romper el flujo real de Nuts 4 You en POS, inventario, bodega, finanzas y RRHH.

Tambien es importante dejar definido desde ya que el modulo POS no tendra emision de boletas, facturas ni documentos tributarios similares. Su funcion sera registrar la venta de forma interna para descontar inventario en tiempo real y alimentar la contabilidad operativa del negocio.

## Principios De Trabajo

1. Cada cambio debe respetar el vocabulario real del negocio: sucursal, bodega, turno, cierre de caja, a depositar, diferencia, mezclas, liquidos, vendedor, supervisor.
2. Los cambios visuales deben quedar dentro del modulo correspondiente y no mezclarse con logica de negocio.
3. La logica de negocio debe moverse progresivamente a hooks, servicios, stores o validaciones, evitando componentes demasiado grandes.
4. No se deben tocar componentes base de `frontend/src/components/ui/` salvo que exista una razon tecnica real; esos componentes deben seguir siendo la capa reutilizable.
5. Todo cambio funcional debe dejar un comentario breve del modulo afectado: que se mejoro, por que se hizo y que falta por conectar.
6. Cada mejora debe pensar en escalabilidad futura hacia backend real, validaciones Zod y consumo desde API.

## Forma Correcta De Modificar Componentes

### 1. Identificar el tipo de cambio

Antes de editar un componente, hay que clasificar la intervencion:

- Cambio visual: layout, jerarquia visual, espaciado, legibilidad, responsive.
- Cambio funcional: eventos, formularios, estados, filtros, calculos o flujos.
- Cambio de datos: tipos, mocks, integracion API, transformaciones, permisos.
- Cambio estructural: dividir un componente grande en subcomponentes o mover logica a un hook.

### 2. Ubicar la responsabilidad real

La modificacion debe hacerse en la capa correcta:

- `paginas/`: composicion de pantalla y flujo de ruta.
- `componentes/`: piezas visuales o bloques funcionales del modulo.
- `hooks/`: estado derivado, llamadas a API, coordinacion de acciones.
- `store/`: estado global o compartido entre vistas.
- `lib/`: utilidades comunes como fechas, dinero, permisos y cliente API.
- `validaciones/`: reglas de formularios y datos de entrada.
- `backend/src/servicios/`: reglas de negocio reutilizables del lado servidor.

### 3. Patrones recomendados al intervenir componentes

- Separar presentacion de calculos: si un componente calcula demasiado, mover esa logica a un hook o servicio.
- Separar formularios en bloques pequenos: datos generales, montos, observaciones y confirmacion.
- Crear componentes de apoyo por modulo cuando la pantalla ya tenga varias tarjetas, tablas o formularios.
- Reutilizar `money.ts`, `dates.ts` y `permisos.ts` antes de crear utilidades nuevas.
- Preparar los componentes para reemplazar mocks por API real sin rehacer toda la UI.
- Mantener nombres en espanol y alineados al negocio real del cliente.

### 4. Comentarios que deben quedar registrados

Cada modulo debe dejar comentarios funcionales, no decorativos. El comentario debe explicar una decision concreta. Formato sugerido:

```md
Comentario del modulo:
- Estado actual:
- Mejora aplicada:
- Riesgo o deuda pendiente:
- Siguiente paso recomendado:
```

## Hoja De Ruta General

### Fase 1. Ordenar la base actual

- Revisar componentes grandes y separar responsabilidades.
- Mover paginas a subcarpetas por modulo cuando corresponda.
- Crear validaciones frontend donde hoy existen formularios mock.
- Definir stores para auth, sucursal activa y caja.

### Fase 2. Consolidar modulos operativos

- POS e Inventario deben quedar estables primero, porque son el centro del flujo diario.
- Bodega debe conectarse al movimiento real de insumos entre bodega central y sucursales.
- Finanzas debe consumir correctamente datos de cierres, depositos y diferencias.
- RRHH debe ordenarse con foco en turnos, permisos, bonos y trazabilidad.

### Fase 3. Integracion real con backend

- Reemplazar mocks por endpoints reales.
- Validar flujos con Zod en frontend y backend.
- Centralizar reglas de negocio en servicios reutilizables.
- Agregar pruebas a calculos criticos y permisos.

## Comentarios Y Mejoras Por Modulo

## 1. Modulo POS

### Archivos base relacionados

- `frontend/src/paginas/AperturaTurno.tsx`
- `frontend/src/paginas/POSDashboard.tsx`
- `frontend/src/paginas/CierreCaja.tsx`
- `frontend/src/paginas/HistorialVentas.tsx`
- `frontend/src/hooks/useSesionPOS.ts`
- `frontend/src/hooks/useCarrito.ts`

### Enfoque de mejora

El modulo POS es el corazon operativo del sistema, pero su alcance debe quedar acotado. No sera un sistema de emision tributaria ni de boletas. Su objetivo es registrar ventas internas, descontar stock de manera efectiva en el momento y dejar trazabilidad suficiente para cierre de caja, diferencias y control contable.

### Formas adecuadas de modificar sus componentes

- Priorizar flujos de registro rapido de venta y descuento inmediato de inventario.
- Dividir la pantalla principal en subcomponentes para resumen de turno, carrito, totales y medios de pago.
- Mover calculos repetidos del checkout y cierre a hooks o servicios para evitar duplicacion.
- Preparar formularios de apertura y cierre para validaciones Zod.
- Dejar el historial de ventas preparado para filtros por fecha, sucursal y vendedor.
- No incorporar UI ni logica orientada a boletas, folios, impresiones fiscales o integraciones SII dentro de POS.

### Comentario del modulo

- Estado actual: ya existe flujo base de apertura, dashboard, cierre e historial.
- Mejora aplicada esperada: separar UI de logica operativa y reforzar POS como modulo de venta interna, control de stock y contabilidad operativa.
- Riesgo o deuda pendiente: si se agregan requisitos de boleta o facturacion dentro de POS, el modulo se desviara de su objetivo real.
- Siguiente paso recomendado: crear componentes internos del POS y estandarizar el manejo de ventas, descuentos de inventario, pagos y diferencias.

## 2. Modulo Inventario PDV

### Archivos base relacionados

- `frontend/src/paginas/InventarioPDV.tsx`
- `frontend/src/lib/money.ts`
- `frontend/src/lib/dates.ts`

### Enfoque de mejora

Inventario PDV debe ser claro para vendedores y supervisores. La prioridad no es una UI compleja, sino visibilidad rapida del stock, movimientos y faltantes.

### Formas adecuadas de modificar sus componentes

- Separar listado, filtros y detalle de producto en componentes distintos.
- Preparar el modulo para mostrar stock inicial, ingresos, ventas estimadas y stock final.
- Agregar estados visuales para stock bajo o quiebre.
- Mantener la informacion legible en pantallas pequenas.

### Comentario del modulo

- Estado actual: existe como pagina principal, pero aun puede crecer en granularidad funcional.
- Mejora aplicada esperada: descomponer la vista en tabla, filtros y resumen operativo.
- Riesgo o deuda pendiente: si se mezcla inventario con logica de ventas, el modulo se vuelve dificil de mantener.
- Siguiente paso recomendado: crear componentes del modulo inventario y conectar luego con endpoints de stock por sucursal.

## 3. Modulo Bodega

### Archivos base relacionados

- `frontend/src/componentes/admin/GestorInventario.tsx`
- `frontend/src/componentes/bodega/`

### Enfoque de mejora

Bodega debe representar el flujo real de ingreso y despacho de insumos hacia sucursales. Este modulo no debe modelarse como un inventario generico, sino como control logistico del negocio.

### Formas adecuadas de modificar sus componentes

- Separar vistas de stock central, despachos pendientes e historial de movimientos.
- Crear formularios por accion: ingreso, ajuste y despacho.
- Dejar listas las estructuras para asociar movimientos con sucursal destino.
- Usar validaciones estrictas para evitar movimientos invalidos o negativos.

### Comentario del modulo

- Estado actual: se representa desde el panel admin, pero requiere modularizacion mas clara.
- Mejora aplicada esperada: convertir el gestor en un conjunto de componentes especializados por flujo logistico.
- Riesgo o deuda pendiente: si todo queda concentrado en un solo componente, sera dificil conectar con backend y auditoria.
- Siguiente paso recomendado: crear capa de componentes para stock, despacho y recepcion de insumos.

## 4. Modulo Finanzas

### Archivos base relacionados

- `frontend/src/componentes/admin/DepositosFinanzas.tsx`
- `backend/src/servicios/calculos.servicio.ts`

### Enfoque de mejora

Finanzas debe apoyarse en calculos trazables. Aqui importa mas la consistencia del dato que la complejidad visual. Todo debe alinearse con cierre de caja, retiros, depositos y diferencia.

### Formas adecuadas de modificar sus componentes

- Separar resumen diario, depositos pendientes, historial de depositos y diferencias.
- Mostrar claramente el origen del monto: efectivo, tarjeta, transferencia, gastos y retiros.
- Reutilizar la logica del servicio de calculos para no replicar formulas en frontend.
- Preparar tablas y filtros por fecha y sucursal.

### Comentario del modulo

- Estado actual: existe vista administrativa de depositos y control financiero base.
- Mejora aplicada esperada: conectar la UI con calculos centralizados y mejorar trazabilidad.
- Riesgo o deuda pendiente: duplicar calculos entre frontend y backend generaria inconsistencias.
- Siguiente paso recomendado: definir endpoints de finanzas y consumir desde componentes pequenos y especializados.

## 5. Modulo RRHH

### Archivos base relacionados

- `frontend/src/componentes/admin/ModuloRRHH.tsx`

### Enfoque de mejora

RRHH debe cubrir turnos, permisos, asistencia, bonos y datos del personal. La estructura debe pensarse para crecer por secciones, no como una sola pantalla administrativa.

### Formas adecuadas de modificar sus componentes

- Dividir en submodulos: personal, turnos, permisos, bonos y resumen mensual.
- Preparar formularios validados para registrar novedades del personal.
- Mostrar historial por trabajador y por sucursal cuando corresponda.
- Evitar mezclar datos sensibles con vistas publicas del POS.

### Comentario del modulo

- Estado actual: existe como bloque admin consolidado.
- Mejora aplicada esperada: modularizar la gestion de personal y definir mejor los datos criticos.
- Riesgo o deuda pendiente: un modulo RRHH monolitico sera dificil de mantener y de asegurar por permisos.
- Siguiente paso recomendado: crear paginas y componentes por subproceso de RRHH.

## 6. Modulo Admin Y Control De Sucursales

### Archivos base relacionados

- `frontend/src/componentes/admin/PanelAdmin.tsx`
- `frontend/src/componentes/admin/ControlVentasSucursal.tsx`
- `frontend/src/componentes/admin/ReporteDiarioSucursal.tsx`
- `frontend/src/componentes/admin/LayoutAdmin.tsx`

### Enfoque de mejora

El panel admin debe funcionar como concentrador de lectura y accion, no como lugar donde viva toda la logica. Debe mostrar indicadores y redirigir a modulos especializados.

### Formas adecuadas de modificar sus componentes

- Dejar `PanelAdmin` como tablero de resumen y navegacion.
- Mover analitica, tablas pesadas y formularios a componentes o paginas dedicadas.
- Ordenar el layout para que cada acceso admin lleve a un modulo claro.
- Estandarizar cards de resumen, tablas y filtros compartidos.

### Comentario del modulo

- Estado actual: concentra dashboard, ventas por sucursal, reporte diario y accesos administrativos.
- Mejora aplicada esperada: reducir acoplamiento y dejar cada seccion con responsabilidad propia.
- Riesgo o deuda pendiente: si el panel crece sin separar funciones, se volvera el cuello de botella del frontend.
- Siguiente paso recomendado: mantener admin como capa de orquestacion y derivar el trabajo a paginas modulares.

## Reglas De Comentarios Por Cada Modulo

Cuando se modifique un modulo, dejar registro en el documento de avance o en la PR interna con este formato:

```md
Modulo: POS | Inventario | Bodega | Finanzas | RRHH | Admin
Componente o pagina afectada:
Motivo del cambio:
Que se mejoro:
Que queda pendiente:
Impacto esperado en la operacion:
```

## Orden Recomendado De Implementacion

1. POS
2. Inventario PDV
3. Bodega
4. Finanzas
5. RRHH
6. Admin como capa de consolidacion

## Cierre

La forma correcta de construir el programa no es solo agregar pantallas, sino convertir cada modulo en una unidad mantenible, con componentes pequenos, logica bien ubicada y comentarios funcionales que expliquen cada avance. Si seguimos este criterio, podremos pasar del estado actual basado en mocks a una plataforma operativa real, conectada al backend y alineada con el negocio de Nuts 4 You.