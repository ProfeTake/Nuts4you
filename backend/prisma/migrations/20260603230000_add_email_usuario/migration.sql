-- AlterTable: agregar campo email a Usuario
ALTER TABLE `Usuario` ADD COLUMN `email` VARCHAR(100) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Usuario_email_key` ON `Usuario`(`email`);
