-- CreateTable: plantilla de tareas para cierre preventivo
CREATE TABLE `TareaChecklist` (
  `id`    INT NOT NULL AUTO_INCREMENT,
  `label` VARCHAR(255) NOT NULL,
  `orden` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
);

-- Seed: tareas por defecto
INSERT INTO `TareaChecklist` (`label`, `orden`) VALUES
('Retiro de efectivo realizado', 0),
('Conteo de dinero en caja verificado', 1),
('Inventario de insumos / mezclas revisado', 2),
('Inventario de productos terminados revisado', 3),
('Revisión de vitrina y exhibición de productos', 4),
('Limpieza general del local verificada', 5),
('Instrucciones o tareas dejadas al vendedor', 6);
