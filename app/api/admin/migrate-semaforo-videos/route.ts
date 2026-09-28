/**
 * GET /api/admin/migrate-semaforo-videos
 *
 * Añade a `SemaforoConfig` las 4 columnas de vídeos por color:
 * videoUrlVerde, videoUrlAmbar, videoUrlRojo, videoUrlAlarma. Idempotente
 * (usa IF NOT EXISTS). Solo CEO.
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

  await run(`ALTER TABLE "SemaforoConfig" ADD COLUMN IF NOT EXISTS "videoUrlVerde"  TEXT`);
  await run(`ALTER TABLE "SemaforoConfig" ADD COLUMN IF NOT EXISTS "videoUrlAmbar"  TEXT`);
  await run(`ALTER TABLE "SemaforoConfig" ADD COLUMN IF NOT EXISTS "videoUrlRojo"   TEXT`);
  await run(`ALTER TABLE "SemaforoConfig" ADD COLUMN IF NOT EXISTS "videoUrlAlarma" TEXT`);

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({
    ok: allOk,
    steps,
    message: allOk
      ? "Columnas de vídeos añadidas. Ya puedes pegar las URLs desde el panel del semáforo."
      : "Algún paso falló — revisa los errores.",
  });
}
