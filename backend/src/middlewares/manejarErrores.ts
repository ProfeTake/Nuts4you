// src/middlewares/manejarErrores.ts
// Middleware global de manejo de errores

import { Request, Response, NextFunction } from "express";

interface ErrorConEstado extends Error {
  estado?: number;
}

const manejarErrores = (
  err: ErrorConEstado,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const estado = err.estado || 500;
  const mensaje = err.message || "Error interno del servidor";

  console.error(`[ERROR] ${estado} - ${mensaje}`);

  res.status(estado).json({
    exito: false,
    mensaje,
  });
};

export default manejarErrores;
