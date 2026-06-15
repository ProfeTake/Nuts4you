-- Sincroniza columnas agregadas/ajustadas en el esquema vía db push sin migración formal.
-- AlterTable
ALTER TABLE `Producto` ADD COLUMN `codigo_barra` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Proveedor` MODIFY `tipo_cuenta` VARCHAR(191) NULL,
    MODIFY `numero_cuenta` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `TareaChecklist` MODIFY `label` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `Usuario` MODIFY `email` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Producto_codigo_barra_key` ON `Producto`(`codigo_barra`);
