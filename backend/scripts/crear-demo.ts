// Crea (o actualiza) la cuenta de demostración: rol ADMIN, es_demo=true.
// El frontend detecta es_demo y simula todos los datos localmente — esta
// cuenta nunca escribe en la base de datos real (bloqueado también en
// backend/src/middlewares/autenticar.ts como capa de seguridad extra).
//
// Uso local:  npx ts-node scripts/crear-demo.ts
// Uso prod:   $env:DATABASE_URL='<MYSQL_PUBLIC_URL>'; npx ts-node scripts/crear-demo.ts

import bcrypt from 'bcryptjs'
import prisma from '../src/config/prisma'

const RUT = '00000000-0'
const PASSWORD = 'demo2026'

async function main() {
  const rolAdmin = await prisma.rol.findUnique({ where: { nombre: 'ADMIN' } })
  if (!rolAdmin) throw new Error('Rol ADMIN no encontrado — corre el seed primero')

  const hash = await bcrypt.hash(PASSWORD, 10)

  const usuario = await prisma.usuario.upsert({
    where: { rut: RUT },
    update: { es_demo: true, activo: true, password_hash: hash },
    create: {
      rut: RUT,
      nombre: 'Usuario Demo',
      email: 'demo@nuts4you.cl',
      password_hash: hash,
      rol_id: rolAdmin.id,
      pdv_id: null,
      pago_diario: 0,
      es_demo: true,
    },
  })

  console.log(`✓ Cuenta demo lista: RUT ${usuario.rut} / password ${PASSWORD}`)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
