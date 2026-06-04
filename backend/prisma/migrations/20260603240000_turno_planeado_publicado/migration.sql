-- AlterTable: agregar campo publicado a TurnoPlaneado
ALTER TABLE `TurnoPlaneado` ADD COLUMN `publicado` BOOLEAN NOT NULL DEFAULT false;
