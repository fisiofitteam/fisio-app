/**
 * GET /api/admin/migrate-autotest-hombro
 *
 * Crea las tablas del lead magnet "Autotest Funcional de Hombro" en Neon:
 *   - AutotestHombroResponse: respuestas y resultado del test (por sesión).
 *   - AutotestHombroConfig:   singleton con las URLs de los 3 vídeos y
 *                             el template de WhatsApp del embudo.
 *
 * Idempotente (CREATE TABLE IF NOT EXISTS). Solo CEO. Se corre antes
 * del deploy B que ya trae el código que consume estas tablas, igual
 * que hicimos con el Semáforo (patrón de 2 deploys para no romper nada).
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

  // ─── Tabla de respuestas ─────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS "AutotestHombroResponse" (
      "id"                    TEXT PRIMARY KEY,
      "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

      "instagram"             TEXT,
      "nombre"                TEXT,
      "telefono"              TEXT,
      "campana"               TEXT,

      "estado"                TEXT NOT NULL DEFAULT 'EN_CURSO',
      "ultimoPaso"            INTEGER NOT NULL DEFAULT 0,

      "respuestas"            TEXT NOT NULL DEFAULT '{}',
      "scores"                TEXT,
      "arquetipo"             TEXT,

      "whatsappClickAt"       TIMESTAMP(3),

      "consentimientoAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "consentimientoVersion" TEXT NOT NULL DEFAULT 'v1',

      "userAgent"             TEXT,

      "gestionado"            BOOLEAN NOT NULL DEFAULT false,
      "gestionadoPorId"       TEXT,
      "notas"                 TEXT,

      "leadId"                TEXT
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS "AutotestHombroResponse_createdAt_idx" ON "AutotestHombroResponse" ("createdAt")`);
  await run(`CREATE INDEX IF NOT EXISTS "AutotestHombroResponse_estado_idx" ON "AutotestHombroResponse" ("estado")`);
  await run(`CREATE INDEX IF NOT EXISTS "AutotestHombroResponse_arquetipo_idx" ON "AutotestHombroResponse" ("arquetipo")`);
  await run(`CREATE INDEX IF NOT EXISTS "AutotestHombroResponse_instagram_idx" ON "AutotestHombroResponse" ("instagram")`);
  await run(`CREATE INDEX IF NOT EXISTS "AutotestHombroResponse_leadId_idx" ON "AutotestHombroResponse" ("leadId")`);

  // ─── Singleton de config (URLs de vídeo + copy de WhatsApp) ──────────
  await run(`
    CREATE TABLE IF NOT EXISTS "AutotestHombroConfig" (
      "id"                     TEXT PRIMARY KEY DEFAULT 'singleton',
      "videoUrlTest1"          TEXT,
      "videoUrlTest2"          TEXT,
      "videoUrlTest3"          TEXT,
      "whatsappTemplate"       TEXT,
      "quizFunnelEnabled"      BOOLEAN NOT NULL DEFAULT false,
      "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedById"            TEXT
    )
  `);

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({
    ok: allOk,
    steps,
    message: allOk
      ? "Tablas del Autotest de Hombro listas. Puedes hacer deploy B."
      : "Alguno de los pasos falló — revisa los errores.",
  });
}
