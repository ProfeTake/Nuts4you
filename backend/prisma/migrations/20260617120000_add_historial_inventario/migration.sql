-- CreateTable: historial de ingresos/ajustes de stock en la bodega central
CREATE TABLE `HistorialInventario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lote_id` VARCHAR(36) NULL,
    `inventario_id` INTEGER NULL,
    `producto_id` INTEGER NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `saldo_anterior` INTEGER NOT NULL,
    `ingresos` INTEGER NOT NULL,
    `utilizadas` INTEGER NOT NULL,
    `saldo_nuevo` INTEGER NOT NULL,
    `usuario_id` INTEGER NULL,
    `usuario_nombre` VARCHAR(191) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `HistorialInventario_lote_id_idx`(`lote_id`),
    INDEX `HistorialInventario_creado_en_idx`(`creado_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
