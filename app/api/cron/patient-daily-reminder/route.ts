/**
 * Cron diario que envía a cada paciente activo (con dailyReminderEnabled=true)
 * un aviso a las 7:00 hora Madrid con el resumen de sus tareas de hoy.
 *
 * Se dispara desde Vercel Cron a las 05:00 UTC y a las 06:00 UTC (vercel.json).
 * Internamente comprobamos la hora Madrid y solo procesamos cuando la hora
 * local Madrid es exactamente 7. Eso cubre verano (UTC+2 → 05:00 UTC) e
 * invierno (UTC+1 → 06:00 UTC) con un solo handler.
 *
 * Protección: Vercel envía `Authorization: Bearer ${CRON_SECRET}` cuando hay
 * una env var CRON_SECRET configurada. En desarrollo se puede llamar sin auth
 * añadiendo ?test=1 si NODE_ENV !== production.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { startOfDayUtc } from "@/lib/ceo-personal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getMadridHour(d: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    return Number.isFinite(h) ? h : -1;
  } catch {
    return -1;
  }
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://app.fisiofitteam.com";
}

function emailBody(opts: { fullName: string; taskCount: number; sessionUrl: string }): { html: string; text: string } {
  const firstName = opts.fullName.split(" ")[0] || "";
  const taskWord = opts.taskCount === 1 ? "tarea" : "tareas";
  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:24px 32px;background:linear-gradient(135deg,#FCD34D 0%,#F59E0B 100%);">
          <h1 style="margin:0;color:#1f2937;font-size:20px;font-weight:700;">Buenos días${firstName ? `, ${firstName}` : ""} ☀️</h1>
        </td></tr>
        <tr><td style="padding:32px;color:#1f2937;line-height:1.6;">
          <p style="margin:0 0 12px;font-size:16px;">Hoy te toca:</p>
          <div style="margin:16px 0;padding:18px;background:#fef3c7;border-radius:12px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#92400e;">${opts.taskCount} ${taskWord}</div>
            <div style="font-size:13px;color:#92400e;margin-top:4px;">de tu programa</div>
          </div>
          <div style="margin:24px 0;text-align:center;">
            <a href="${opts.sessionUrl}" style="display:inline-block;padding:14px 28px;background:#1f2937;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;">
              Empezar mi sesión
            </a>
          </div>
          <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">
            Si no quieres recibir este aviso cada mañana, puedes silenciarlo desde Ajustes en la app.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = `Buenos días${firstName ? ` ${firstName}` : ""}. Hoy te toca: ${opts.taskCount} ${taskWord} de tu programa. Empieza aquí: ${opts.sessionUrl}`;
  return { html, text };
}

async function handler(req: NextRequest) {
  // Auth: Vercel cron envía Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const isTest = req.nextUrl.searchParams.get("test") === "1";
  const isLocal = process.env.NODE_ENV !== "production";
  if (cronSecret) {
    if (auth !== `Bearer ${cronSecret}` && !(isTest && isLocal)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Guardia hora Madrid
  const force = req.nextUrl.searchParams.get("force") === "1";
  const madridHour = getMadridHour();
  if (madridHour !== 7 && !force) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Hora Madrid actual=${madridHour}, solo disparamos a las 7.`,
    });
  }

  // Día actual en Madrid (clave 00:00 UTC del día Madrid).
  const todayMadrid = startOfDayUtc();
  const tomorrowMadrid = new Date(todayMadrid.getTime() + 24 * 3600 * 1000);

  // Pacientes a notificar: activos, con email, con aviso habilitado.
  const patients = await prisma.patient.findMany({
    where: {
      // Sólo pacientes "operativos" — no leads, no churned.
      onboardingStatus: "active",
      email: { not: null },
      dailyReminderEnabled: true,
    },
    select: { id: true, fullName: true, email: true },
  });

  const results: Array<{ patientId: string; sent: boolean; reason?: string; taskCount?: number }> = [];

  for (const p of patients) {
    if (!p.email) {
      results.push({ patientId: p.id, sent: false, reason: "sin email" });
      continue;
    }
    // Cuenta sesiones de hoy para este paciente.
    const sessions = await prisma.programSession.findMany({
      where: {
        assignment: { patientId: p.id, isActive: true },
        scheduledDate: { gte: todayMadrid, lt: tomorrowMadrid },
        completedAt: null,
      },
      select: { tasksSnapshot: true },
    });
    let taskCount = 0;
    for (const s of sessions) {
      try {
        const arr = JSON.parse(s.tasksSnapshot);
        if (Array.isArray(arr)) taskCount += arr.length;
      } catch {}
    }
    if (taskCount === 0) {
      results.push({ patientId: p.id, sent: false, reason: "sin tareas hoy" });
      continue;
    }

    const sessionUrl = `${baseUrl()}/paciente/${p.id}/sesion-hoy`;
    const { html, text } = emailBody({ fullName: p.fullName, taskCount, sessionUrl });

    // 1) Email
    const emailResult = await sendEmail({
      to: p.email,
      subject: `Tu sesión de hoy · ${taskCount} ${taskCount === 1 ? "tarea" : "tareas"}`,
      html,
      text,
    });

    // 2) Notificación in-app (campanita).
    await prisma.patientNotification.create({
      data: {
        patientId: p.id,
        type: "daily_reminder",
        title: "Tu sesión de hoy te espera",
        body: `Hoy te toca: ${taskCount} ${taskCount === 1 ? "tarea" : "tareas"} de tu programa.`,
      },
    });

    results.push({ patientId: p.id, sent: emailResult.ok, taskCount });
  }

  return NextResponse.json({
    ok: true,
    processed: patients.length,
    notified: results.filter((r) => r.sent).length,
    results,
  });
}

export const GET = handler;
export const POST = handler;
