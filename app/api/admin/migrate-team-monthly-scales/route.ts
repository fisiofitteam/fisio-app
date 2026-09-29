/**
 * GET /api/admin/migrate-team-monthly-scales
 *
 * Añade a `TeamMonthlyReport` las 8 columnas de escalas 1-5:
 * satisfacción global, carga de trabajo (burnout) y 6 tareas clave.
 * Idempotente. Solo CEO.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NEW_COLUMNS = [
  "scaleSatisfaction",
  "scaleWorkload",
  "scaleTaskWhatsapp",
  "scaleTaskAssessment",
  "scaleTaskOptCall",
  "scaleTaskRenewCall",
  "scaleTaskMeetings",
  "scaleTaskAppMgmt",
];

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

  for (const col of NEW_COLUMNS) {
    await run(`ALTER TABLE "TeamMonthlyReport" ADD COLUMN IF NOT EXISTS "${col}" INTEGER`);
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({
    ok: allOk,
    steps,
    message: allOk
      ? "8 columnas de escalas añadidas. El formulario ya puede mostrarlas."
      : "Alguno falló — revisa los errores.",
  });
}
