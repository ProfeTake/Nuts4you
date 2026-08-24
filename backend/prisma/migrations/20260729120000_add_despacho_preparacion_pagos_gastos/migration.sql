-- Migración consolidada: pone el historial al día con schema.prisma.
--
-- Los cambios de los últimos módulos se habían aplicado en desarrollo con
-- `prisma db push`, así que no existían como migración y `migrate deploy` no los
-- llevaba a producción. Esta migración es 100% ADITIVA: crea tablas nuevas,
-- agrega columnas nullable (o con DEFAULT) y amplía un enum. No borra ni
-- reescribe datos existentes.
--
-- Contenido:
--   · Tablas nuevas: PagoPersonal, PreparacionTurno, PreparacionItem, Despacho,
--     SolicitudGasto
--   · TurnoCaja: recepción de dinero, stock/venta declarados y vínculo al pago
--   · Notificacion.pdv_id (avisos scoped a una sucursal)
--   · Solicitud.motivo_rechazo + estado RECHAZADA
--   · Despacho.solicitud_id: enlaza el despacho con la solicitud que lo originó (A15)

-- CreateTable
CREATE TABLE `PagoPersonal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NULL,
    `usuario_nombre` VARCHAR(191) NOT NULL,
    `fecha_desde` DATE NOT NULL,
    `fecha_hasta` DATE NOT NULL,
    `dias_trabajados` INTEGER NOT NULL,
    `monto_base` INTEGER NOT NULL,
    `monto_bonos` INTEGER NOT NULL,
    `monto_descuentos` INTEGER NOT NULL,
    `monto_total` INTEGER NOT NULL,
    `creado_por_nombre` VARCHAR(191) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PagoPersonal_usuario_id_idx`(`usuario_id`),
    INDEX `PagoPersonal_creado_en_idx`(`creado_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PreparacionTurno` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pdv_id` INTEGER NOT NULL,
    `fecha` DATE NOT NULL,
    `estado` ENUM('PENDIENTE', 'CONFIRMADA', 'ANULADA') NOT NULL DEFAULT 'PENDIENTE',
    `notas` TEXT NULL,
    `creado_por_id` INTEGER NULL,
    `creado_por_nombre` VARCHAR(191) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,
    `confirmado_en` DATETIME(3) NULL,

    INDEX `PreparacionTurno_fecha_idx`(`fecha`),
    INDEX `PreparacionTurno_estado_idx`(`estado`),
    UNIQUE INDEX `PreparacionTurno_pdv_id_fecha_key`(`pdv_id`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PreparacionItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `preparacion_id` INTEGER NOT NULL,
    `producto_id` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,

    UNIQUE INDEX `PreparacionItem_preparacion_id_producto_id_key`(`preparacion_id`, `producto_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Despacho` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lote_id` VARCHAR(36) NOT NULL,
    `pdv_destino_id` INTEGER NOT NULL,
    `usuario_envia_id` INTEGER NULL,
    `usuario_envia_nombre` VARCHAR(191) NULL,
    `observacion` VARCHAR(191) NULL,
    `estado` ENUM('ENVIADO', 'CONFIRMADO') NOT NULL DEFAULT 'ENVIADO',
    `confirmado_por_id` INTEGER NULL,
    `confirmado_por_nombre` VARCHAR(191) NULL,
    `confirmado_en` DATETIME(3) NULL,
    `cantidad_items` INTEGER NOT NULL DEFAULT 0,
    `total_unidades` INTEGER NOT NULL DEFAULT 0,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `solicitud_id` INTEGER NULL,

    UNIQUE INDEX `Despacho_lote_id_key`(`lote_id`),
    INDEX `Despacho_pdv_destino_id_idx`(`pdv_destino_id`),
    INDEX `Despacho_estado_idx`(`estado`),
    INDEX `Despacho_creado_en_idx`(`creado_en`),
    INDEX `Despacho_solicitud_id_idx`(`solicitud_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SolicitudGasto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `turno_id` INTEGER NOT NULL,
    `pdv_id` INTEGER NOT NULL,
    `usuario_id` INTEGER NULL,
    `usuario_nombre` VARCHAR(191) NULL,
    `monto` INTEGER NOT NULL,
    `motivo` TEXT NOT NULL,
    `categoria` VARCHAR(191) NULL,
    `foto` LONGTEXT NULL,
    `estado` ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
    `resuelto_por_id` INTEGER NULL,
    `resuelto_por_nombre` VARCHAR(191) NULL,
    `comentario_resolucion` TEXT NULL,
    `gasto_turno_id` INTEGER NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resuelto_en` DATETIME(3) NULL,

    INDEX `SolicitudGasto_estado_idx`(`estado`),
    INDEX `SolicitudGasto_turno_id_idx`(`turno_id`),
    INDEX `SolicitudGasto_pdv_id_idx`(`pdv_id`),
    INDEX `SolicitudGasto_creado_en_idx`(`creado_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable: recepción del dinero del turno + cierre declarado + vínculo al pago
ALTER TABLE `TurnoCaja`
    ADD COLUMN `dinero_recibido` INTEGER NULL,
    ADD COLUMN `recepcion_confirmada` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `recibido_por` INTEGER NULL,
    ADD COLUMN `recibido_por_nombre` VARCHAR(191) NULL,
    ADD COLUMN `fecha_recepcion` DATETIME(3) NULL,
    ADD COLUMN `stock_final` JSON NULL,
    ADD COLUMN `venta_detalle` JSON NULL,
    ADD COLUMN `pago_id` INTEGER NULL;

-- AlterTable: avisos acotados a una sucursal (null = global)
ALTER TABLE `Notificacion` ADD COLUMN `pdv_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `Notificacion_pdv_id_idx` ON `Notificacion`(`pdv_id`);

-- AlterTable: rechazo de solicitudes con motivo (antes quedaban PENDIENTE para siempre)
ALTER TABLE `Solicitud` ADD COLUMN `motivo_rechazo` VARCHAR(191) NULL;

-- AlterEnum: nuevo estado final RECHAZADA
ALTER TABLE `Solicitud` MODIFY `estado` ENUM('PENDIENTE', 'DESPACHADA', 'CONFIRMADA', 'RECHAZADA') NOT NULL DEFAULT 'PENDIENTE';

-- AddForeignKey
ALTER TABLE `TurnoCaja` ADD CONSTRAINT `TurnoCaja_pago_id_fkey` FOREIGN KEY (`pago_id`) REFERENCES `PagoPersonal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PreparacionTurno` ADD CONSTRAINT `PreparacionTurno_pdv_id_fkey` FOREIGN KEY (`pdv_id`) REFERENCES `PDV`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PreparacionItem` ADD CONSTRAINT `PreparacionItem_preparacion_id_fkey` FOREIGN KEY (`preparacion_id`) REFERENCES `PreparacionTurno`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PreparacionItem` ADD CONSTRAINT `PreparacionItem_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Despacho` ADD CONSTRAINT `Despacho_solicitud_id_fkey` FOREIGN KEY (`solicitud_id`) REFERENCES `Solicitud`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Despacho` ADD CONSTRAINT `Despacho_pdv_destino_id_fkey` FOREIGN KEY (`pdv_destino_id`) REFERENCES `PDV`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SolicitudGasto` ADD CONSTRAINT `SolicitudGasto_turno_id_fkey` FOREIGN KEY (`turno_id`) REFERENCES `TurnoCaja`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SolicitudGasto` ADD CONSTRAINT `SolicitudGasto_pdv_id_fkey` FOREIGN KEY (`pdv_id`) REFERENCES `PDV`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SolicitudGasto` ADD CONSTRAINT `SolicitudGasto_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
