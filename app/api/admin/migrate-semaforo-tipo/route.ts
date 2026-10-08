/**
 * GET /api/admin/migrate-semaforo-tipo
 *
 * Prepara los modelos del Semáforo para soportar múltiples zonas
 * corporales (hombro, lumbar, rodilla, …).
 *
 *  1. SemaforoRespuesta.tipo TEXT NOT NULL DEFAULT 'hombro'
 *  2. SemaforoConfig.tipo    TEXT NOT NULL DEFAULT 'hombro'  + unique(tipo)
 *  3. Backfill: todas las filas existentes quedan como tipo='hombro'.
 *
 * Idempotente (IF NOT EXISTS). Solo CEO. Deliberadamente usa
 * $executeRawUnsafe para no requerir que la columna exista todavía en
 * el modelo generado de Prisma (si no, la app entera revienta — regla
 * aprendida con el episodio extraRoles del 2026-10-08).
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
      steps.push({ sql: sql.slice(0, 140), ok: true });
    } catch (e: any) {
      steps.push({ sql: sql.slice(0, 140), ok: false, error: e?.message ?? String(e) });
    }
  }

  // 1) SemaforoRespuesta.tipo
  await run(`ALTER TABLE "SemaforoRespuesta" ADD COLUMN IF NOT EXISTS "tipo" TEXT NOT NULL DEFAULT 'hombro'`);
  await run(`CREATE INDEX IF NOT EXISTS "SemaforoRespuesta_tipo_idx" ON "SemaforoRespuesta"("tipo")`);
  // Backfill por si quedaron filas con string vacío.
  await run(`UPDATE "SemaforoRespuesta" SET "tipo" = 'hombro' WHERE "tipo" = '' OR "tipo" IS NULL`);

  // 2) SemaforoConfig.tipo + unique
  await run(`ALTER TABLE "SemaforoConfig" ADD COLUMN IF NOT EXISTS "tipo" TEXT NOT NULL DEFAULT 'hombro'`);
  // La fila singleton existente pasa a ser la de "hombro" por conveniencia:
  await run(`UPDATE "SemaforoConfig" SET "tipo" = 'hombro' WHERE "tipo" = '' OR "tipo" IS NULL`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS "SemaforoConfig_tipo_key" ON "SemaforoConfig"("tipo")`);

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({
    ok: allOk,
    steps,
    message: allOk
      ? "Columnas `tipo` añadidas y backfill a 'hombro' hecho. Avísame y despliego Fase B (schema + endpoints por tipo)."
      : "Alguno falló — revisa los errores.",
  });
}
