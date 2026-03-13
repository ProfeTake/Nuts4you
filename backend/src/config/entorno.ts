// src/config/entorno.ts
// Configuración central de variables de entorno

import dotenv from "dotenv";
dotenv.config();

interface ConfigEntorno {
  puerto: number;
  databaseUrl: string;
  nodoEntorno: string;
}

const entorno: ConfigEntorno = {
  puerto: Number(process.env.PUERTO) || 3001,
  databaseUrl: process.env.DATABASE_URL || "",
  nodoEntorno: process.env.NODE_ENV || "development",
};

export default entorno;
