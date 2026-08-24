-- Últimos cambios aplicados en desarrollo con `prisma db push` y que faltaban en
-- el historial de migraciones. 100% aditiva: solo columnas nullable o con DEFAULT.
--
--   · Deposito.pago_vendedor  — plata del turno entregada al vendedor ("Pagado a
--     Vendedor (DC)", celda F29 de la planilla). Acumulador que se resta del
--     monto a depositar; `monto_teorico` conserva el bruto.
--   · PagoPersonal.pdv_id / pdv_nombre / turno_pago_id — marcan el pago hecho con
--     la caja de una sucursal y el turno cuyo depósito lo absorbe.
--   · TurnoCaja.cierre_lote_id — ancla al lote de HistorialInventario del cierre;
--     sin ella no se puede revertir el stock al reabrir un turno.

-- AlterTable
ALTER TABLE `Deposito` ADD COLUMN `pago_vendedor` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `PagoPersonal`
    ADD COLUMN `pdv_id` INTEGER NULL,
    ADD COLUMN `pdv_nombre` VARCHAR(191) NULL,
    ADD COLUMN `turno_pago_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `PagoPersonal_turno_pago_id_idx` ON `PagoPersonal`(`turno_pago_id`);

-- AlterTable
ALTER TABLE `TurnoCaja` ADD COLUMN `cierre_lote_id` VARCHAR(36) NULL;
