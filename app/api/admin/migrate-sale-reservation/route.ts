/**
 * GET /api/admin/migrate-sale-reservation
 *
 * Añade la columna `isReservation` (BOOLEAN NOT NULL DEFAULT false) a la
 * tabla Sale para poder generar altas como reserva de plaza.
 *
 * Idempotente (IF NOT EXISTS). Solo CEO.
 * Después de correrlo una vez, sale-reservation queda activo y este
 * endpoint puede seguir devolviendo ok en llamadas sucesivas.
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
      steps.push({ sql: sql.slice(0, 100), ok: true });
    } catch (e: any) {
      steps.push({ sql: sql.slice(0, 100), ok: false, error: e?.message ?? String(e) });
    }
  }

  await run(`ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "isReservation" BOOLEAN NOT NULL DEFAULT false`);

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({
    ok: allOk,
    steps,
    message: allOk
      ? "Columna Sale.isReservation lista. Ya puedes marcar altas como reserva de plaza."
      : "Alguno de los pasos falló — revisa los errores.",
  });
}
