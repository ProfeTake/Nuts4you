-- CreateTable CierrePreventivo
CREATE TABLE `CierrePreventivo` (
  `id`             INT          NOT NULL AUTO_INCREMENT,
  `pdv_id`         INT          NOT NULL,
  `usuario_id`     INT          NOT NULL,
  `fecha`          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `monto_retiro`   INT          NOT NULL DEFAULT 0,
  `checklist`      JSON         NOT NULL,
  `notas_vendedor` TEXT         NULL,
  `observaciones`  TEXT         NULL,

  INDEX `CierrePreventivo_pdv_id_idx`(`pdv_id`),
  INDEX `CierrePreventivo_fecha_idx`(`fecha`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CierrePreventivo` ADD CONSTRAINT `CierrePreventivo_pdv_id_fkey`
  FOREIGN KEY (`pdv_id`) REFERENCES `PDV`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `CierrePreventivo` ADD CONSTRAINT `CierrePreventivo_usuario_id_fkey`
  FOREIGN KEY (`usuario_id`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
