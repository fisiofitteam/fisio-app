/**
 * GET /api/admin/migrate-payment-provider
 *
 * Añade la columna `paymentProvider` (TEXT NOT NULL DEFAULT 'paypal') a
 * Sale y RenewalCheckout. Idempotente (IF NOT EXISTS).
 *
 * Después de correr una vez, el modal "Generar link de pago" ya puede
 * elegir entre PayPal y Stripe al crear el link.
 *
 * Solo CEO.
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

  await run(`ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "paymentProvider" TEXT NOT NULL DEFAULT 'paypal'`);
  await run(`ALTER TABLE "RenewalCheckout" ADD COLUMN IF NOT EXISTS "paymentProvider" TEXT NOT NULL DEFAULT 'paypal'`);

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({
    ok: allOk,
    steps,
    message: allOk
      ? "Columnas paymentProvider listas. Ya puedes elegir Stripe o PayPal al generar links."
      : "Alguno de los pasos falló — revisa los errores.",
  });
}
