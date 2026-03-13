// src/servidor.ts
// Punto de entrada principal del servidor Express

import express from "express";
import cors from "cors";
import entorno from "./config/entorno";
import rutaPrincipal from "./rutas";
import manejarErrores from "./middlewares/manejarErrores";

const app = express();

// Middlewares globales
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas de la API
app.use("/api", rutaPrincipal);

// Middleware de errores (siempre al final)
app.use(manejarErrores);

// Iniciar servidor
app.listen(entorno.puerto, () => {
  console.log(`[Servidor] Corriendo en http://localhost:${entorno.puerto}`);
  console.log(`[Entorno] ${entorno.nodoEntorno}`);
});

export default app;
