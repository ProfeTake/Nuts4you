// src/rutas/index.ts
// Registro central de todas las rutas de la API

import { Router } from "express";
import rutasSalud from "./salud.rutas";

const rutaPrincipal = Router();

// Rutas de health-check
rutaPrincipal.use("/salud", rutasSalud);

// Futuras rutas se registran aquí:
// rutaPrincipal.use("/auth", rutasAuth);
// rutaPrincipal.use("/productos", rutasProductos);
// rutaPrincipal.use("/ventas", rutasVentas);
// rutaPrincipal.use("/inventario", rutasInventario);
// rutaPrincipal.use("/turnos", rutasTurnos);
// rutaPrincipal.use("/pdv", rutasPDV);

export default rutaPrincipal;
