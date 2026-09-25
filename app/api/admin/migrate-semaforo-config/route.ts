/**
 * GET /api/admin/migrate-semaforo-config
 *
 * Crea la tabla `SemaforoConfig` en Neon (singleton para la config del
 * lead magnet). Idempotente (CREATE TABLE IF NOT EXISTS). Solo CEO.
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
      steps.push({ sql: sql.slice(0, 120), ok: true });
    } catch (e: any) {
      steps.push({ sql: sql.slice(0, 120), ok: false, error: e?.message ?? String(e) });
    }
  }

  await run(`
    CREATE TABLE IF NOT EXISTS "SemaforoConfig" (
      "id" TEXT PRIMARY KEY DEFAULT 'singleton',
      "quizFunnelEnabled" BOOLEAN NOT NULL DEFAULT false,
      "funnelWhatsappTemplate" TEXT NOT NULL DEFAULT '¡Hola {{nombre}}! Vi que hiciste el Semáforo del Hombro y te salió {{color}}. Te escribo yo directamente para explicarte qué significa y qué hacer con {{movimientos_problema}}.',
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedById" TEXT
    )
  `);

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({
    ok: allOk,
    steps,
    message: allOk
      ? "Tabla SemaforoConfig lista. Ya puedes activar el modo Quiz Funnel desde el panel."
      : "Alguno de los pasos falló — revisa los errores.",
  });
}
