-- Config global de nómina: fila única (id = 1) con los parámetros del cálculo de
-- sueldos. Se había aplicado en desarrollo con `prisma db push`, así que la tabla
-- no existía en el historial de migraciones y la migración
-- `20260823120000_fusion_sueldos_bonos` (que la ALTERa) fallaba en producción.
--
-- Solo se crea la tabla con la columna que tenía en ese momento
-- (`tolerancia_faltante`); las otras tres las agrega la migración de la fusión.

-- CreateTable
CREATE TABLE `ConfigNomina` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `tolerancia_faltante` INTEGER NOT NULL DEFAULT 1000,
    `actualizado_en` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
