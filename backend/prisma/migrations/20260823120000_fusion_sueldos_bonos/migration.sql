-- Fusión de Sueldos y Bonos: completa el cálculo de la planilla del cliente
-- ("Sueldos Feb 2026.xlsx", hoja PAGO TURNOS). Agrega los tres conceptos que
-- faltaban: el "Adicional"/Extra por turno (columna E × 3.000), el "Adicional"
-- del período (celda H163) y las "Cotizaciones" (celda H164).

-- ── Config global de sueldos (celdas P13 y col. E de la planilla) ─────────────
ALTER TABLE `ConfigNomina`
  ADD COLUMN `pago_diario_base`     INTEGER NOT NULL DEFAULT 28000,
  ADD COLUMN `valor_extra`          INTEGER NOT NULL DEFAULT 3000,
  ADD COLUMN `cotizaciones_default` INTEGER NOT NULL DEFAULT 0;

-- La fila única puede no existir todavía (getConfigSueldos() devuelve defaults).
-- Se crea acá para que el panel de configuración tenga siempre algo que editar.
INSERT INTO `ConfigNomina` (`id`, `pago_diario_base`, `valor_extra`, `cotizaciones_default`, `tolerancia_faltante`, `actualizado_en`)
VALUES (1, 28000, 3000, 0, 1000, NOW(3))
ON DUPLICATE KEY UPDATE `id` = `id`;

-- ── pago_diario pasa a ser un OVERRIDE opcional ──────────────────────────────
ALTER TABLE `Usuario` MODIFY `pago_diario` INTEGER NULL;

-- Los que valen exactamente el default histórico (28.000) no eran una decisión
-- del admin sino el valor por defecto de la columna: se pasan a NULL para que
-- hereden el valor global y cambiar P13 los afecte de verdad. Cualquier otro
-- monto se conserva como override explícito.
UPDATE `Usuario` SET `pago_diario` = NULL WHERE `pago_diario` = 28000;

-- ── "Adicional"/Extra del turno (planilla, columna E) ────────────────────────
-- En décimas: 0 · 5 = 0,5 · 10 = 1 · 15 = 1,5.
ALTER TABLE `TurnoCaja` ADD COLUMN `extra_decimas` INTEGER NOT NULL DEFAULT 0;

-- ── Cierre de período de la planilla (filas 162-164) ─────────────────────────
ALTER TABLE `PagoPersonal`
  ADD COLUMN `monto_extras`       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `monto_adicional`    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `monto_cotizaciones` INTEGER NOT NULL DEFAULT 0;
