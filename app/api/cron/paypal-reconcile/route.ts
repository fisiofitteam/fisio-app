/**
 * GET /api/cron/paypal-reconcile
 *
 * Autorescate cada 15 minutos: llama a /api/admin/paypal-reconcile con
 * el secret del cron. Recorre pagos de las últimas 72h que se quedaron
 * huérfanos (webhook nunca llegó) y los activa consultando el estado
 * real de la Order/Subscription en PayPal.
 *
 * Es RED DE SEGURIDAD, no la vía principal. La vía principal sigue siendo
 * el webhook + los status endpoints con activación completa. Este cron
 * atrapa lo que se cuele.
 *
 * Vercel Cron manda `Authorization: Bearer <CRON_SECRET>` estándar. Como
 * el endpoint admin acepta también `x-cron-secret`, reenviamos ese header.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn("[cron/paypal-reconcile] CRON_SECRET no configurado — skip");
    return NextResponse.json({ ok: false, reason: "no_cron_secret" });
  }

  // Autenticación estándar Vercel Cron: `Authorization: Bearer <secret>`
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ") || auth.slice(7) !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Llamamos internamente al endpoint admin. Como Vercel Cron entra al
  // origen, usamos URL relativa.
  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://app.fisiofitteam.com";
  try {
    const r = await fetch(`${base}/api/admin/paypal-reconcile`, {
      method: "POST",
      headers: { "x-cron-secret": cronSecret, "Content-Type": "application/json" },
    });
    const data = await r.json().catch(() => ({}));
    if (data?.report) {
      const { saleFixed, saleFailed, renewalFixed, renewalFailed } = data.report;
      if (saleFixed > 0 || renewalFixed > 0 || saleFailed > 0 || renewalFailed > 0) {
        console.log("[cron/paypal-reconcile] report", data.report);
      }
    }
    return NextResponse.json({ ok: r.ok, upstream: r.status, report: data?.report ?? null });
  } catch (e: any) {
    console.error("[cron/paypal-reconcile] error", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
  }
}
