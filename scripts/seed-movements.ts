// Carga el catálogo base de control de cargas (categorías + movimientos) en la BD.
// No destructivo: solo inserta si la tabla de categorías está vacía.
// Uso: DATABASE_URL=... npx tsx scripts/seed-movements.ts
import { PrismaClient } from "@prisma/client";
import { CATEGORIES, MOVEMENTS } from "../prisma/movements-catalog";

const prisma = new PrismaClient();

(async () => {
  const existing = await prisma.movementCategory.count();
  if (existing > 0) {
    console.log(`Ya hay ${existing} categorías. No se inserta nada (evita duplicados).`);
    await prisma.$disconnect();
    return;
  }

  const catMap: Record<string, string> = {};
  for (const cat of CATEGORIES) {
    const created = await prisma.movementCategory.create({ data: cat });
    catMap[cat.slug] = created.id;
  }
  for (const m of MOVEMENTS) {
    await prisma.movement.create({
      data: {
        canonicalName: m.canonical,
        displayName: m.display,
        aliases: m.aliases,
        categoryId: catMap[m.category],
        isOverhead: m.overhead ?? false,
        isImpact: m.impact ?? false,
        isKipping: m.kipping ?? false,
      },
    });
  }
  console.log(`✅ Catálogo cargado: ${await prisma.movementCategory.count()} categorías · ${await prisma.movement.count()} movimientos`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
