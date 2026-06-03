// src/config/prisma.ts
// Instancia singleton de PrismaClient

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default prisma;
