/**
 * GET /api/admin/migrate-stories
 *
 * Aplica el DDL de las 2 tablas de Historias directamente a la BD de
 * producción. Se llama una sola vez desde el navegador (por CEO logueado)
 * después de deployar la feature, y las tablas quedan creadas. Idempotente:
 * CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS, se puede
 * ejecutar N veces sin efecto colateral.
 *
 * Alternativa a `prisma db push` que evita configurar `.env.production.local`
 * y ejecutar scripts en local. El coste es que hay que acordarse de visitar
 * la URL una vez tras el deploy — el propio /fisio/contenido/historias
 * detecta las tablas ausentes y redirige aquí para hacerlo obvio.
 *
 * Seguridad: solo CEO. El SQL es literal, no hay input del usuario.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Login requerido" }, { status: 401 });
  if (user.role !== "ceo") return NextResponse.json({ error: "Solo CEO" }, { status: 403 });

  const steps: { sql: string; ok: boolean; error?: string }[] = [];

  async function run(sql: string) {
    try {
      await prisma.$executeRawUnsafe(sql);
      steps.push({ sql: sql.slice(0, 80) + (sql.length > 80 ? "…" : ""), ok: true });
    } catch (e: any) {
      steps.push({ sql: sql.slice(0, 80), ok: false, error: e?.message ?? String(e) });
    }
  }

  // Tabla StoryTemplateSlot
  await run(`
    CREATE TABLE IF NOT EXISTS "StoryTemplateSlot" (
      "id"          TEXT PRIMARY KEY,
      "dayOfWeek"   INTEGER NOT NULL,
      "formatName"  TEXT NOT NULL,
      "emoji"       TEXT,
      "color"       TEXT,
      "updatedAt"   TIMESTAMP(3) NOT NULL
    )
  `);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS "StoryTemplateSlot_dayOfWeek_key" ON "StoryTemplateSlot" ("dayOfWeek")`);
  await run(`CREATE INDEX IF NOT EXISTS "StoryTemplateSlot_dayOfWeek_idx" ON "StoryTemplateSlot" ("dayOfWeek")`);

  // Tabla StoryIdea
  await run(`
    CREATE TABLE IF NOT EXISTS "StoryIdea" (
      "id"              TEXT PRIMARY KEY,
      "templateSlotId"  TEXT NOT NULL,
      "text"            TEXT NOT NULL,
      "done"            BOOLEAN NOT NULL DEFAULT false,
      "order"           INTEGER NOT NULL DEFAULT 0,
      "doneAt"          TIMESTAMP(3),
      "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"       TIMESTAMP(3) NOT NULL
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS "StoryIdea_templateSlotId_done_order_idx" ON "StoryIdea" ("templateSlotId", "done", "order")`);

  // FK con cascade
  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'StoryIdea_templateSlotId_fkey'
      ) THEN
        ALTER TABLE "StoryIdea"
        ADD CONSTRAINT "StoryIdea_templateSlotId_fkey"
        FOREIGN KEY ("templateSlotId") REFERENCES "StoryTemplateSlot"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$
  `);

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({
    ok: allOk,
    steps,
    message: allOk
      ? "Tablas de Historias creadas. Ya puedes usar /fisio/contenido/historias."
      : "Algún paso falló — revisa los errores. La mayoría de errores 'ya existe' son inofensivos.",
  });
}
