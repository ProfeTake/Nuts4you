-- CreateTable: tramos de bono por sucursal, editables por el admin
CREATE TABLE `ConfigBono` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pdv_id` INTEGER NOT NULL,
    `umbral_venta` INTEGER NOT NULL,
    `monto_bono` INTEGER NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    INDEX `ConfigBono_pdv_id_idx`(`pdv_id`),
    UNIQUE INDEX `ConfigBono_pdv_id_umbral_venta_key`(`pdv_id`, `umbral_venta`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ConfigBono` ADD CONSTRAINT `ConfigBono_pdv_id_fkey` FOREIGN KEY (`pdv_id`) REFERENCES `PDV`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed inicial: migra los tramos hardcodeados de calculos.servicio.ts a la BD.
-- Se referencia el PDV por nombre para no asumir IDs.
INSERT INTO `ConfigBono` (`pdv_id`, `umbral_venta`, `monto_bono`, `actualizado_en`)
SELECT p.`id`, t.`umbral`, t.`bono`, NOW(3)
FROM `PDV` p
JOIN (
  SELECT 'Mall Patio'          AS nombre, 400000 AS umbral, 30000 AS bono
  UNION ALL SELECT 'Mall Patio',          350000, 19000
  UNION ALL SELECT 'Mall Patio',          300000, 12000
  UNION ALL SELECT 'Mall Patio',          250000,  6000
  UNION ALL SELECT 'Paseo Independencia', 350000, 25000
  UNION ALL SELECT 'Paseo Independencia', 300000, 19000
  UNION ALL SELECT 'Paseo Independencia', 250000, 13000
  UNION ALL SELECT 'Paseo Independencia', 200000,  6000
  UNION ALL SELECT 'Open Plaza',          300000, 20000
  UNION ALL SELECT 'Open Plaza',          250000, 13000
  UNION ALL SELECT 'Open Plaza',          200000,  8000
  UNION ALL SELECT 'Open Plaza',          160000,  4000
  UNION ALL SELECT 'Cugat Rengo',         180000, 12000
  UNION ALL SELECT 'Cugat Rengo',         140000,  8000
  UNION ALL SELECT 'Cugat Rengo',         100000,  4000
  UNION ALL SELECT 'Cugat Baquedano',     180000, 12000
  UNION ALL SELECT 'Cugat Baquedano',     140000,  8000
  UNION ALL SELECT 'Cugat Baquedano',     100000,  3000
) t ON t.nombre = p.`nombre`;
