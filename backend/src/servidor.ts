// src/servidor.ts
// Punto de entrada principal del servidor Express

import express from "express";
import cors from "cors";
import entorno from "./config/entorno";
import rutaPrincipal from "./rutas";
import manejarErrores from "./middlewares/manejarErrores";

const app = express();

// Middlewares globales
// En producción exigimos FRONTEND_URL explícito (fallar de forma segura, no abrir CORS).
// En desarrollo permitimos los orígenes locales conocidos de Vite (dev + preview).
const origenesPermitidos =
  entorno.nodoEntorno === "production"
    ? entorno.frontendUrl
      ? [entorno.frontendUrl]
      : (() => {
          throw new Error("[FATAL] FRONTEND_URL no configurado en producción.");
        })()
    : ["http://localhost:5173", "http://localhost:4173"];

app.use(cors({ origin: origenesPermitidos }));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

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
