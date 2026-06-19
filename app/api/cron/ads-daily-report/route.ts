/**
 * GET /api/cron/ads-daily-report
 *
 * Cron diario configurado en vercel.json (a las 07:00 UTC = 09:00 Madrid invierno).
 * Ejecuta el análisis IA del DÍA ANTERIOR (period=day) y crea TeamNotification
 * a cada CEO con el resumen y un link al optimizador.
 *
 * Vercel firma las llamadas a /api/cron/* con header Authorization: Bearer <CRON_SECRET>.
 * Si el secret no coincide, devolvemos 401.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyProfessional } from "@/lib/notifications";
import { runOptimizer } from "@/lib/ads-optimizer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// La llamada a Meta + Claude puede tardar; le damos margen
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  // Verifica que viene del Vercel cron (o un agente autorizado con secreto).
  // Si no hay CRON_SECRET configurado en env, dejamos pasar (modo dev).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let summary = "";
  let recsCount = 0;
  try {
    const r = await runOptimizer("day", null);
    summary = r.summary;
    recsCount = r.recommendations.length;
  } catch (e: any) {
    console.error("[cron ads-daily-report] error ejecutando análisis:", e?.message ?? e);
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }

  // Notificar a cada CEO activo
  const ceos = await prisma.professional.findMany({
    where: { role: "ceo", active: true },
    select: { id: true },
  });

  const bodyText =
    recsCount > 0
      ? `${summary}\n\n${recsCount} recomendación${recsCount === 1 ? "" : "es"} en el panel.`
      : summary;

  await Promise.all(
    ceos.map((c) =>
      notifyProfessional({
        professionalId: c.id,
        type: "ads_daily_report",
        title: "Resumen diario de anuncios",
        body: bodyText.slice(0, 500),
        actionUrl: "/fisio/anuncios/optimizador",
      }),
    ),
  );

  return NextResponse.json({ ok: true, ceosNotified: ceos.length, recsCount });
}
