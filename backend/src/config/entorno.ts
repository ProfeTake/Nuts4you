// src/config/entorno.ts
import dotenv from "dotenv";
dotenv.config();

interface ConfigEntorno {
  puerto: number;
  databaseUrl: string;
  nodoEntorno: string;
  jwtSecret: string;
  jwtExpiracion: string;
  frontendUrl: string;
  // SMTP — opcionales; si no están configurados el correo se omite silenciosamente
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
}

// Fail-fast: en producción el JWT_SECRET es obligatorio. Sin él, el fallback de
// desarrollo permitiría a cualquiera con acceso al código forjar tokens válidos.
if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error(
    "[FATAL] JWT_SECRET no está configurado en producción. El servidor no puede arrancar.",
  );
}

const entorno: ConfigEntorno = {
  // Railway inyecta PORT automáticamente; PUERTO es el nombre local. Se respeta PORT primero.
  puerto:        Number(process.env.PORT || process.env.PUERTO) || 3001,
  databaseUrl:   process.env.DATABASE_URL || "",
  nodoEntorno:   process.env.NODE_ENV || "development",
  jwtSecret:     process.env.JWT_SECRET || "nuts4you_dev_secret_cambiar_en_prod",
  jwtExpiracion: process.env.JWT_EXPIRACION || "8h",
  frontendUrl:   process.env.FRONTEND_URL || "",
  smtpHost:      process.env.SMTP_HOST || undefined,
  smtpPort:      process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
  smtpUser:      process.env.SMTP_USER || undefined,
  smtpPass:      process.env.SMTP_PASS || undefined,
  smtpFrom:      process.env.SMTP_FROM || undefined,
};

export default entorno;
