// src/rutas/salud.rutas.ts
// Ruta de verificación de estado del servidor

import { Router, Request, Response } from "express";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.json({
    estado: "ok",
    mensaje: "Servidor ERP/POS Nuts4You funcionando correctamente",
    timestamp: new Date().toISOString(),
  });
});

export default router;
