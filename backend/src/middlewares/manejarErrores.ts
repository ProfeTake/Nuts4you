// src/middlewares/manejarErrores.ts
// Middleware global de manejo de errores.
//
// Política: solo los ErrorApp (errores operacionales de negocio) exponen su
// mensaje al cliente. Los errores de Prisma se mapean a mensajes seguros y
// cualquier otro error responde 500 genérico — el detalle queda en el log
// del servidor, nunca en la respuesta.

import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { ErrorApp } from "../lib/errores";

const manejarErrores = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Errores de negocio: estado y mensaje controlados por el servicio.
  if (err instanceof ErrorApp) {
    res.status(err.estado).json({ error: err.message });
    return;
  }

  // Errores del body-parser (JSON malformado, payload > límite, etc.):
  // traen `status` 4xx — son culpa del cliente, no un error interno.
  const status = (err as { status?: unknown }).status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    console.warn(`[ERROR] ${status} body/request inválido en ${req.method} ${req.originalUrl}: ${err.message}`);
    res.status(status).json({ error: "Solicitud inválida (cuerpo malformado o demasiado grande)" });
    return;
  }

  // Errores conocidos de Prisma → mensaje seguro sin internals.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      console.warn(`[ERROR] 404 Prisma P2025 en ${req.method} ${req.originalUrl}`);
      res.status(404).json({ error: "Recurso no encontrado" });
      return;
    }
    if (err.code === "P2002") {
      console.warn(`[ERROR] 409 Prisma P2002 en ${req.method} ${req.originalUrl}`);
      res.status(409).json({ error: "Ya existe un registro con esos datos" });
      return;
    }
  }

  // Error inesperado: log completo en servidor, respuesta genérica al cliente.
  console.error(`[ERROR] 500 en ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: "Error interno del servidor" });
};

export default manejarErrores;
