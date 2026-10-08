/**
 * GET /api/admin/migrate-professional-extra-roles
 *
 * Añade la columna `extraRoles` TEXT[] a `Professional` con default
 * array vacío. Idempotente (IF NOT EXISTS). Solo CEO.
 *
 * Esta columna soporta a gente del equipo que combina cargos (ej. una
 * fisio que también cierra ventas) sin necesidad de duplicar cuenta.
 *
 * IMPORTANTE: este endpoint se despliega SOLO en el Deploy A, antes de
 * tocar prisma/schema.prisma. Deliberadamente usa $executeRawUnsafe en
 * vez del cliente Prisma typed para no requerir que la columna ya
 * exista en el modelo generado (eso rompería toda la app, como pasó
 * en el intento del 2026-10-08).
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

  await run(`ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "extraRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`);

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({
    ok: allOk,
    steps,
    message: allOk
      ? "Columna extraRoles añadida. Avísame cuando lo veas y despliego la Fase B (schema + UI)."
      : "Alguno falló — revisa los errores.",
  });
}
