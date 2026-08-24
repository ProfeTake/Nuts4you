-- Optimización de índices + detalle de ventas normalizado.
--
-- Motivación (medido con EXPLAIN sobre las consultas más frecuentes):
--   · TurnoCaja: "turnos de un PDV en un rango" usaba solo la FK de pdv_id y
--     terminaba en `Using filesort`; "turno abierto de este PDV" (la consulta más
--     frecuente del sistema, cada request del POS) resolvía con index_merge de dos
--     índices sueltos. Los compuestos sirven filtro + orden en una pasada.
--   · MovimientoInv: el historial de despachos (tipo='TRASPASO' ORDER BY fecha)
--     hacía FULL SCAN — MySQL descartaba el índice de `tipo` porque casi todas las
--     filas son TRASPASO. El compuesto (tipo, fecha) permite escanear en orden.
--   · Notificacion: "mis avisos no leídos, recientes primero" hacía filesort.
--     El compuesto lo cubre y reemplaza al índice de `leida` (booleano: no
--     discrimina). Cada índice de más se paga en cada escritura.
--
-- VentaTurnoItem es el espejo normalizado del snapshot `TurnoCaja.venta_detalle`
-- (JSON). El JSON sigue siendo la foto del cierre; esta tabla permite agregar por
-- producto y período en SQL, imposible sobre JSON.
-- Migración aditiva: solo crea una tabla e índices, y elimina dos índices que
-- quedan cubiertos por los compuestos. No borra ni altera datos.

-- CreateTable
CREATE TABLE `VentaTurnoItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `turno_id` INTEGER NOT NULL,
    `producto_id` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `precio_unitario` INTEGER NOT NULL,
    `fecha` DATE NOT NULL,

    INDEX `VentaTurnoItem_producto_id_fecha_idx`(`producto_id`, `fecha`),
    INDEX `VentaTurnoItem_fecha_idx`(`fecha`),
    UNIQUE INDEX `VentaTurnoItem_turno_id_producto_id_key`(`turno_id`, `producto_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VentaTurnoItem` ADD CONSTRAINT `VentaTurnoItem_turno_id_fkey` FOREIGN KEY (`turno_id`) REFERENCES `TurnoCaja`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VentaTurnoItem` ADD CONSTRAINT `VentaTurnoItem_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex: turno abierto de un PDV (POS, en cada request)
CREATE INDEX `TurnoCaja_pdv_id_estado_idx` ON `TurnoCaja`(`pdv_id`, `estado`);

-- CreateIndex: turnos de una sucursal en un rango, ordenados por fecha
CREATE INDEX `TurnoCaja_pdv_id_fecha_apertura_idx` ON `TurnoCaja`(`pdv_id`, `fecha_apertura`);

-- CreateIndex: historial de despachos (antes hacía full scan)
CREATE INDEX `MovimientoInv_tipo_fecha_idx` ON `MovimientoInv`(`tipo`, `fecha`);

-- CreateIndex: campana de avisos del usuario (no leídos, recientes primero)
CREATE INDEX `Notificacion_usuario_id_leida_fecha_idx` ON `Notificacion`(`usuario_id`, `leida`, `fecha`);

-- DropIndex: queda cubierto por MovimientoInv(tipo, fecha)
DROP INDEX `MovimientoInv_tipo_idx` ON `MovimientoInv`;

-- DropIndex: queda cubierto por Notificacion(usuario_id, leida, fecha)
DROP INDEX `Notificacion_leida_idx` ON `Notificacion`;
