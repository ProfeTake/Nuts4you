# Reporte de Cambios — Nuts 4 You ERP
**Fecha:** 07 de Mayo de 2026  
**Preparado por:** Francisco Figueroa  
**Estado del proyecto:** En desarrollo activo

---

## Resumen Ejecutivo

Durante esta sesión de trabajo se realizaron cambios profundos al módulo POS (Punto de Venta) para adaptarlo al flujo real de operación de Nuts 4 You. El sistema dejó de funcionar como un POS tradicional con carrito de compras, y pasó a ser un sistema de **control de inventario por flujo de stock**, que es como el negocio realmente opera: el vendedor cuenta lo que entra y lo que sobra, y el sistema calcula las ventas automáticamente.

---

## 1. Cambio de Paradigma: De Carrito a Flujo de Stock

### Antes
El sistema tenía un carrito de compras tradicional: el vendedor registraba cada venta item por item durante el día.

### Ahora
El sistema utiliza el flujo de inventario para calcular las ventas:

```
Disponible = Inicio (saldo del día anterior) + Ingreso del día + Producción de mezclas
Ventas     = Disponible − Saldo Final (lo que queda al cierre)
```

**¿Por qué este cambio?** Porque así es como trabajan realmente los vendedores en los kioscos. No escanean cada producto vendido — cuentan el stock al inicio y al final, y la diferencia es lo vendido. El sistema ahora refleja esa realidad.

---

## 2. Nombres Completos de Productos

**Antes:** Los productos aparecían con siglas internas (MM, MA, MN, pp, etc.)  
**Ahora:** Todos los productos muestran su nombre completo en la interfaz.

| Sigla | Nombre completo en el sistema |
|-------|-------------------------------|
| MM    | Mezcla Maní |
| MA    | Mezcla Almendras |
| MN    | Mezcla Nueces |
| MPr   | Mezcla Promo |
| pm    | Paquetes Maní |
| pa    | Paquetes Almendras |
| pn    | Paquetes Nueces |
| pp    | Paquetes Promo |
| AM CG | Agua Mineral Con Gas |
| AM SG | Agua Mineral Sin Gas |
| ENE   | Energéticas |
| BEB   | Bebidas |
| KAPO  | Jugos Kapo |

---

## 3. Precios Reales Actualizados

Se cargaron los precios reales del negocio al sistema (reemplazando datos de prueba):

| Producto | Precio de venta |
|----------|----------------|
| Paquetes Maní (pm) | $800 |
| Paquetes Almendras (pa) | $1.000 |
| Paquetes Nueces (pn) | $1.000 |
| Paquetes Promo (pp) | $1.500 |
| Agua Mineral Con Gas | $800 |
| Agua Mineral Sin Gas | $800 |
| Energéticas | $1.500 |
| Bebidas | $1.500 |
| Jugos Kapo | $500 |
| Helados *(producto nuevo)* | $1.000 |

> Las mezclas (MM, MA, MN, MPr) no tienen precio de venta directo — se venden procesadas como paquetes. El sistema convierte automáticamente: 1 medida MM → 19 pm, 1 medida MA → 20 pa, etc.

---

## 4. Nuevo Producto: Helados

Se agregó "Helados" como categoría de producto nueva, con precio de venta $1.000. Aparece en todas las secciones del turno activo y cierre de caja.

---

## 5. Rediseño del Módulo Turno Activo (POSDashboard)

La página principal del vendedor fue completamente rediseñada.

### Funcionalidades nuevas:

**Control de mezclas cocinadas**
- El vendedor registra cuántas medidas de cada mezcla preparó durante el día
- El sistema convierte automáticamente a paquetes equivalentes
- Controles con botones +/− para facilidad de uso en tablet

**Tracking de inventario en tiempo real**
- El vendedor ingresa el saldo actual de cada producto
- El sistema muestra: Inicio + Ingreso + Producción = **Disponible**
- Estimado de ventas se calcula automáticamente
- Estimado de recaudación total visible en tiempo real

**Validación de stock**
- Si un vendedor ingresa un saldo mayor al disponible, el campo se marca en rojo con advertencia: "⚠ Máximo disponible: X"
- Previene errores de ingreso que distorsionarían el cuadre

**Diseño mobile-first**
- Botones y controles grandes para uso en tablet en el mesón
- Secciones colapsables: Mezclas / Paquetes / Líquidos

---

## 6. Cuadre de Caja (Modal Pre-Cierre)

Se agregó un paso nuevo antes del cierre de caja: el **Cuadre de Caja**.

El vendedor declara cuánto recibió por cada medio de pago:
- Efectivo
- Tarjeta (débito/crédito)
- Transferencia

El sistema compara ese total declarado contra el estimado de ventas calculado por el flujo de stock.

**Tarjeta de estado del cuadre:**
- 🟢 Verde: cuadre correcto (sin diferencia)
- 🟡 Amarillo: hay diferencia (sobrante o faltante)

El cuadre queda guardado y disponible en la página de Cierre de Caja.

---

## 7. Alerta de Faltante de Caja

Se implementó un sistema de **doble confirmación** cuando existe faltante de caja:

1. El vendedor intenta cerrar con faltante
2. Aparece pantalla de alerta con el monto faltante
3. El vendedor debe confirmar explícitamente que cierra con faltante

Esto queda registrado en el sistema vinculado al vendedor y al punto de venta.

---

## 8. Cierre de Caja Mejorado (CierreCaja)

La página de cierre de caja ahora incluye:

- **Tabla de mezclas cocinadas** (lectura, viene del turno activo)
- **Tabla de saldo final de paquetes** (ingreso del vendedor)
- **Tabla de saldo final de líquidos** (ingreso del vendedor)
- Totales de venta por categoría calculados automáticamente
- Integración con el cuadre de caja previamente guardado
- Alerta de faltante con confirmación de dos pasos

---

## 9. Persistencia de Stock Entre Turnos ⭐

**Este fue el cambio más importante de la sesión.**

### El problema
Cada día al abrir el turno, los vendedores debían ingresar manualmente el stock inicial, copiando el saldo final del día anterior. Esto generaba errores y perdía tiempo.

### La solución implementada
Al **cerrar la caja**, el sistema guarda automáticamente el saldo final de cada producto en la base de datos.

Al **abrir el turno del día siguiente**, el sistema carga automáticamente esos saldos como stock inicial.

```
Turno día 7:  Cierre → saldo final guardado en BD (Inventario.stock_actual)
Turno día 8:  Apertura → stock_actual cargado como "Inicio" automáticamente
```

**El vendedor solo tiene que ingresar el ingreso del día** (lo que recibió de bodega), y el sistema se encarga del resto.

### Archivos modificados:
- **Backend** `pos.servicio.ts`: al cerrar turno, hace `upsert` en tabla `Inventario` por sucursal y producto
- **Frontend** `CierreCaja.tsx`: calcula `stockFinalArray` y lo envía junto al cierre
- **Frontend** `AperturaTurno.tsx`: al cargar, consulta `GET /api/inventario/:pdvId` y precarga los valores

---

## 10. Mejoras de Navegación

El menú lateral del vendedor fue actualizado para reflejar el nuevo enfoque de inventario:

| Ítem menú | Ícono | Ruta |
|-----------|-------|------|
| Turno Activo | Dashboard | `/pos` |
| Inventario PDV | Boxes | `/pos/inventario` |
| Historial | History | `/pos/historial` |
| Cierre de Caja | Banknote | `/pos/cierre-caja` |
| Registro Diario | ClipboardList | `/pos/registro-diario` |

---

## 11. Cambios Técnicos Backend

### Schema de Base de Datos (Prisma)
Se agregaron campos a la tabla `TurnoCaja` para persistir el desglose del cuadre:
- `venta_efectivo` — ventas declaradas en efectivo
- `venta_tarjeta` — ventas declaradas en tarjeta
- `venta_transferencia` — ventas declaradas en transferencia
- `total_calculado` — total según flujo de stock

### API de Cierre de Turno
El endpoint `PATCH /api/pos/turnos/:id/cerrar` ahora acepta:
```json
{
  "efectivoContado": 50000,
  "ventaEfectivo": 30000,
  "ventaTarjeta": 15000,
  "ventaTransferencia": 5000,
  "totalCalculado": 50000,
  "diferenciaCaja": 0,
  "stockFinal": [
    { "productoId": 6, "cantidad": 3 },
    { "productoId": 7, "cantidad": 1 }
  ]
}
```

### Validaciones Zod
El schema de cierre fue extendido para validar todos los nuevos campos.

---

## 12. Compatibilidad con Base de Datos Local (MySQL/XAMPP)

Para desarrollo local sin necesidad de tener PostgreSQL instalado, el sistema fue configurado para funcionar también con **MySQL (XAMPP)**. El entorno de producción (Railway) sigue usando PostgreSQL.

---

## Resumen de Archivos Modificados

### Backend
| Archivo | Tipo de cambio |
|---------|----------------|
| `prisma/schema.prisma` | Nuevos campos en TurnoCaja, soporte MySQL |
| `src/validaciones/pos.schema.ts` | Extended cerrarTurnoSchema con cuadre y stockFinal |
| `src/servicios/pos.servicio.ts` | Persistencia de stock al cierre, depósito automático |
| `prisma/seeds/seed.ts` | Precios reales, producto Helados |

### Frontend
| Archivo | Tipo de cambio |
|---------|----------------|
| `src/paginas/POSDashboard.tsx` | Reescritura completa — flujo stock, cuadre modal |
| `src/paginas/CierreCaja.tsx` | Tablas conteo, alerta faltante, stockFinal al API |
| `src/paginas/AperturaTurno.tsx` | Carga automática stock previo desde BD |
| `src/store/caja.store.ts` | CuadreCaja interface, cerrarTurno con payload completo |
| `src/datos/mock.datos.ts` | Nombres completos, precios reales, Helados |
| `src/componentes/layout/BarraLateral.tsx` | Navegación actualizada para enfoque inventario |

---

## Estado Actual

✅ Flujo de stock operativo (sin carrito)  
✅ Nombres completos de productos  
✅ Precios reales cargados  
✅ Cuadre de caja con declaración por medio de pago  
✅ Alerta de faltante con doble confirmación  
✅ Validación de stock (no puede superar disponible)  
✅ Persistencia de stock entre turnos  
✅ TypeScript sin errores en frontend y backend  

---

## Próximos Pasos Sugeridos

- [ ] Prueba de ciclo completo en XAMPP (abrir → vender → cuadre → cierre → reabrir)
- [ ] Implementar `GET /api/pos/ventas/turno/:id` para historial real (actualmente usa mock)
- [ ] Módulo de Depósitos para supervisor (registrar depósito bancario post-cierre)
- [ ] Módulo de Bodega (despacho de insumos desde bodega central a sucursales)
- [ ] Sincronización offline → online para casos de internet intermitente en kioscos
