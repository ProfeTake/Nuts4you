-- AlterTable: agrupa los productos de un mismo despacho con un id de lote
ALTER TABLE `MovimientoInv` ADD COLUMN `lote_id` VARCHAR(36) NULL;

-- CreateIndex
CREATE INDEX `MovimientoInv_lote_id_idx` ON `MovimientoInv`(`lote_id`);
