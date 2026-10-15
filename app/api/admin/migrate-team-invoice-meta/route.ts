/**
 * GET /api/admin/migrate-team-invoice-meta
 *
 * Crea la tabla `TeamInvoiceMeta` en Neon para guardar overrides manuales
 * del número de factura del equipo. Idempotente (CREATE TABLE IF NOT
 * EXISTS). Solo CEO. Correr una vez tras el deploy que trae el campo.
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
    CREATE TABLE IF NOT EXISTS "TeamInvoiceMeta" (
      "professionalId" TEXT NOT NULL,
      "year"           INTEGER NOT NULL,
      "month"          INTEGER NOT NULL,
      "invoiceNumber"  TEXT NOT NULL,
      "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedById"    TEXT,
      PRIMARY KEY ("professionalId", "year", "month")
    )
  `);
  // Añadido 2026-10 — IRPF por profesional (default 15%, Sofía 7%).
  await run(`ALTER TABLE "Compensation" ADD COLUMN IF NOT EXISTS "irpfRate" INTEGER NOT NULL DEFAULT 15`);

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({
    ok: allOk,
    steps,
    message: allOk
      ? "Tabla TeamInvoiceMeta y columna irpfRate listas."
      : "Alguno de los pasos falló — revisa los errores.",
  });
}
