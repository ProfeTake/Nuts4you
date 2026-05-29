// src/rutas/index.ts — Registro central de rutas de la API

import { Router } from "express";
import rutasSalud       from "./salud.rutas";
import rutasAuth        from "./auth.rutas";
import rutasPOS         from "./pos.rutas";
import rutasInventario  from "./inventario.rutas";
import rutasAdmin       from "./admin.rutas";
import rutasFinanzas    from "./finanzas.rutas";
import rutasBodega      from "./bodega.rutas";
import rutasRRHH        from "./rrhh.rutas";
import rutasUsuarios    from "./usuarios.rutas";
import rutasSolicitudes    from "./solicitudes.rutas";
import rutasNotificaciones from "./notificaciones.rutas";

const rutaPrincipal = Router();

rutaPrincipal.use("/salud",       rutasSalud);
rutaPrincipal.use("/auth",        rutasAuth);
rutaPrincipal.use("/pos",         rutasPOS);
rutaPrincipal.use("/inventario",  rutasInventario);
rutaPrincipal.use("/admin",       rutasAdmin);
rutaPrincipal.use("/finanzas",    rutasFinanzas);
rutaPrincipal.use("/bodega",      rutasBodega);
rutaPrincipal.use("/rrhh",        rutasRRHH);
rutaPrincipal.use("/usuarios",    rutasUsuarios);
rutaPrincipal.use("/solicitudes",    rutasSolicitudes);
rutaPrincipal.use("/notificaciones", rutasNotificaciones);

export default rutaPrincipal;
