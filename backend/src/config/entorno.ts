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

const entorno: ConfigEntorno = {
  puerto:        Number(process.env.PUERTO) || 3001,
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
