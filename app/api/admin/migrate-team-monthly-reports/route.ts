/**
 * GET /api/admin/migrate-team-monthly-reports
 *
 * Crea la tabla `TeamMonthlyReport` en Neon con su unique index
 * (professionalId, monthYear) e índice secundario por monthYear.
 * Idempotente. Solo CEO.
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
    CREATE TABLE IF NOT EXISTS "TeamMonthlyReport" (
      "id" TEXT PRIMARY KEY,
      "professionalId" TEXT NOT NULL REFERENCES "Professional"("id") ON DELETE CASCADE,
      "monthYear" TEXT NOT NULL,
      "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      "goodThings" TEXT NOT NULL,
      "badThings" TEXT,
      "needHelp" TEXT,
      "personalMood" TEXT,
      "patientHelp" TEXT NOT NULL,
      "callToReview" TEXT,
      "callLink" TEXT,
      "nonRenewalReasons" TEXT NOT NULL,
      "successCases" TEXT NOT NULL,
      "programIdeas" TEXT
    )
  `);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS "TeamMonthlyReport_professionalId_monthYear_key" ON "TeamMonthlyReport"("professionalId", "monthYear")`);
  await run(`CREATE INDEX IF NOT EXISTS "TeamMonthlyReport_monthYear_idx" ON "TeamMonthlyReport"("monthYear")`);

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({
    ok: allOk,
    steps,
    message: allOk
      ? "Tabla TeamMonthlyReport lista. Ya puedes usar /fisio/reporte-mensual."
      : "Alguno de los pasos falló — revisa los errores.",
  });
}
