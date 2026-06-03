-- CreateTable
CREATE TABLE `Rol` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Rol_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Usuario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rol_id` INTEGER NOT NULL,
    `pdv_id` INTEGER NULL,
    `rut` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `pago_diario` INTEGER NOT NULL DEFAULT 28000,

    UNIQUE INDEX `Usuario_rut_key`(`rut`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PDV` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `tipo` ENUM('BODEGA', 'PUNTO_VENTA') NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Categoria` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Categoria_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Producto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `categoria_id` INTEGER NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `precio_venta` INTEGER NOT NULL,
    `costo` INTEGER NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Inventario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pdv_id` INTEGER NOT NULL,
    `producto_id` INTEGER NOT NULL,
    `stock_actual` INTEGER NOT NULL DEFAULT 0,
    `stock_critico` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `Inventario_pdv_id_producto_id_key`(`pdv_id`, `producto_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TurnoCaja` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pdv_id` INTEGER NOT NULL,
    `usuario_id` INTEGER NULL,
    `fecha_apertura` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_cierre` DATETIME(3) NULL,
    `saldo_inicial` INTEGER NOT NULL DEFAULT 0,
    `efectivo_declarado` INTEGER NULL,
    `diferencia_caja` INTEGER NULL,
    `venta_efectivo` INTEGER NULL,
    `venta_tarjeta` INTEGER NULL,
    `venta_transferencia` INTEGER NULL,
    `total_calculado` INTEGER NULL,
    `estado` ENUM('ABIERTO', 'CERRADO') NOT NULL DEFAULT 'ABIERTO',

    INDEX `TurnoCaja_fecha_apertura_idx`(`fecha_apertura`),
    INDEX `TurnoCaja_estado_idx`(`estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GastoTurno` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `turno_id` INTEGER NOT NULL,
    `descripcion` VARCHAR(191) NOT NULL,
    `monto` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RetiroTurno` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `turno_id` INTEGER NOT NULL,
    `usuario_id` INTEGER NULL,
    `monto` INTEGER NOT NULL,
    `descripcion` VARCHAR(191) NULL,
    `fecha_hora` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Deposito` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `turno_id` INTEGER NOT NULL,
    `monto_teorico` INTEGER NOT NULL,
    `monto_real` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `estado` ENUM('PENDIENTE', 'CONFIRMADO', 'TRANSFERENCIA') NOT NULL DEFAULT 'PENDIENTE',

    INDEX `Deposito_estado_idx`(`estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MovimientoInv` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `producto_id` INTEGER NOT NULL,
    `pdv_origen_id` INTEGER NULL,
    `pdv_destino_id` INTEGER NULL,
    `tipo` ENUM('INGRESO', 'TRASPASO', 'VENTA', 'MERMA') NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MovimientoInv_fecha_idx`(`fecha`),
    INDEX `MovimientoInv_tipo_idx`(`tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RegistroDiario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pdv_id` INTEGER NOT NULL,
    `fecha` DATE NOT NULL,
    `datos` JSON NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RegistroDiario_pdv_id_fecha_key`(`pdv_id`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Solicitud` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pdv_id` INTEGER NOT NULL,
    `usuario_id` INTEGER NULL,
    `estado` ENUM('PENDIENTE', 'DESPACHADA', 'CONFIRMADA') NOT NULL DEFAULT 'PENDIENTE',
    `notas` VARCHAR(191) NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_cierre` DATETIME(3) NULL,

    INDEX `Solicitud_estado_idx`(`estado`),
    INDEX `Solicitud_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SolicitudItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `solicitud_id` INTEGER NOT NULL,
    `producto_id` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notificacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `titulo` VARCHAR(191) NOT NULL,
    `mensaje` TEXT NOT NULL,
    `leida` BOOLEAN NOT NULL DEFAULT false,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notificacion_leida_idx`(`leida`),
    INDEX `Notificacion_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TurnoPlaneado` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fecha` DATE NOT NULL,
    `pdv_id` INTEGER NOT NULL,
    `usuario_id` INTEGER NOT NULL,

    INDEX `TurnoPlaneado_fecha_idx`(`fecha`),
    UNIQUE INDEX `TurnoPlaneado_fecha_pdv_id_key`(`fecha`, `pdv_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Usuario` ADD CONSTRAINT `Usuario_rol_id_fkey` FOREIGN KEY (`rol_id`) REFERENCES `Rol`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Usuario` ADD CONSTRAINT `Usuario_pdv_id_fkey` FOREIGN KEY (`pdv_id`) REFERENCES `PDV`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Producto` ADD CONSTRAINT `Producto_categoria_id_fkey` FOREIGN KEY (`categoria_id`) REFERENCES `Categoria`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inventario` ADD CONSTRAINT `Inventario_pdv_id_fkey` FOREIGN KEY (`pdv_id`) REFERENCES `PDV`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inventario` ADD CONSTRAINT `Inventario_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TurnoCaja` ADD CONSTRAINT `TurnoCaja_pdv_id_fkey` FOREIGN KEY (`pdv_id`) REFERENCES `PDV`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TurnoCaja` ADD CONSTRAINT `TurnoCaja_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GastoTurno` ADD CONSTRAINT `GastoTurno_turno_id_fkey` FOREIGN KEY (`turno_id`) REFERENCES `TurnoCaja`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RetiroTurno` ADD CONSTRAINT `RetiroTurno_turno_id_fkey` FOREIGN KEY (`turno_id`) REFERENCES `TurnoCaja`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RetiroTurno` ADD CONSTRAINT `RetiroTurno_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deposito` ADD CONSTRAINT `Deposito_turno_id_fkey` FOREIGN KEY (`turno_id`) REFERENCES `TurnoCaja`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovimientoInv` ADD CONSTRAINT `MovimientoInv_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovimientoInv` ADD CONSTRAINT `MovimientoInv_pdv_origen_id_fkey` FOREIGN KEY (`pdv_origen_id`) REFERENCES `PDV`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovimientoInv` ADD CONSTRAINT `MovimientoInv_pdv_destino_id_fkey` FOREIGN KEY (`pdv_destino_id`) REFERENCES `PDV`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RegistroDiario` ADD CONSTRAINT `RegistroDiario_pdv_id_fkey` FOREIGN KEY (`pdv_id`) REFERENCES `PDV`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Solicitud` ADD CONSTRAINT `Solicitud_pdv_id_fkey` FOREIGN KEY (`pdv_id`) REFERENCES `PDV`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Solicitud` ADD CONSTRAINT `Solicitud_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SolicitudItem` ADD CONSTRAINT `SolicitudItem_solicitud_id_fkey` FOREIGN KEY (`solicitud_id`) REFERENCES `Solicitud`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SolicitudItem` ADD CONSTRAINT `SolicitudItem_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notificacion` ADD CONSTRAINT `Notificacion_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TurnoPlaneado` ADD CONSTRAINT `TurnoPlaneado_pdv_id_fkey` FOREIGN KEY (`pdv_id`) REFERENCES `PDV`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TurnoPlaneado` ADD CONSTRAINT `TurnoPlaneado_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
