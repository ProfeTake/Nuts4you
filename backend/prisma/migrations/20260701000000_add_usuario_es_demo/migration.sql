-- AlterTable: marca cuentas de demostración (solo lectura, ver middlewares/autenticar.ts)
ALTER TABLE `Usuario` ADD COLUMN `es_demo` BOOLEAN NOT NULL DEFAULT false;
