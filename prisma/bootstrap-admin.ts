/**
 * Bootstrap del primer CEO de la app.
 *
 * Se ejecuta UNA SOLA VEZ después del primer despliegue a producción
 * o staging, cuando la BD está vacía y aún no hay ningún profesional.
 *
 * Uso:
 *   ADMIN_EMAIL=tucorreo@dominio.com \
 *   ADMIN_NAME="Tu Nombre" \
 *   npx tsx prisma/bootstrap-admin.ts
 *
 * Crea el profesional con rol "ceo" y genera un token de "establecer contraseña".
 * Imprime el enlace por consola (en producción también se envía por email si
 * RESEND_API_KEY está configurada).
 *
 * Si ya existe un CEO con ese email, NO hace nada (idempotente).
 */

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import { emailInvite } from "../lib/email";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const fullName = process.env.ADMIN_NAME || "Admin";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  if (!email) {
    console.error("❌ ADMIN_EMAIL es obligatorio.");
    console.error('   Ejemplo: ADMIN_EMAIL="ales@fisiofitteam.com" ADMIN_NAME="Ales Faus" npx tsx prisma/bootstrap-admin.ts');
    process.exit(1);
  }

  // Comprobar si ya hay algún profesional
  const existingCount = await prisma.professional.count();
  if (existingCount > 0) {
    console.log(`ℹ️  Ya hay ${existingCount} profesional(es) en la BD. Bootstrap no hace nada.`);
    console.log("   Si necesitas resetear la contraseña, usa el flow 'olvidé contraseña' desde /login");
    process.exit(0);
  }

  const token = randomBytes(32).toString("base64url");
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);

  const pro = await prisma.professional.create({
    data: {
      fullName,
      email,
      role: "ceo",
      active: true,
      passwordResetToken: token,
      passwordResetExpires: expires,
    },
  });

  const setupUrl = `${baseUrl}/reset?token=${token}&welcome=1`;

  console.log(`\n✅ CEO creado:`);
  console.log(`   ID:    ${pro.id}`);
  console.log(`   Email: ${pro.email}`);
  console.log(`   Rol:   ceo`);
  console.log(`\n🔑 Enlace para establecer contraseña (válido 7 días):`);
  console.log(`   ${setupUrl}`);

  // También enviamos email si hay Resend configurado
  const result = await emailInvite({ to: email, fullName, role: "ceo", setupUrl });
  if (result.previewMode) {
    console.log(`\n📧 (modo preview: el email no se ha enviado de verdad. Copia el enlace de arriba.)`);
  } else if (result.ok) {
    console.log(`\n📧 Email enviado a ${email}`);
  } else {
    console.log(`\n⚠️  No se pudo enviar el email, pero el enlace de arriba sí funciona.`);
  }
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
