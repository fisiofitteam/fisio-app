/**
 * Cron diario que envía a cada paciente activo (con dailyReminderEnabled=true)
 * un push notification a las 7:00 hora Madrid con el resumen de sus tareas
 * de hoy.
 *
 * Se dispara desde Vercel Cron a las 05:00 UTC y a las 06:00 UTC (vercel.json).
 * Internamente comprobamos la hora Madrid y solo procesamos cuando la hora
 * local Madrid es exactamente 7. Eso cubre verano (UTC+2 → 05:00 UTC) e
 * invierno (UTC+1 → 06:00 UTC) con un solo handler.
 *
 * Canales: push real iOS (APNs) si el paciente tiene PatientPushToken activo,
 * + fila en PatientNotification (campanita in-app) siempre.
 *
 * Protección: Vercel envía `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPush } from "@/lib/apns";
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

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const isTest = req.nextUrl.searchParams.get("test") === "1";
  const isLocal = process.env.NODE_ENV !== "production";
  if (cronSecret) {
    if (auth !== `Bearer ${cronSecret}` && !(isTest && isLocal)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const force = req.nextUrl.searchParams.get("force") === "1";
  const madridHour = getMadridHour();
  if (madridHour !== 7 && !force) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Hora Madrid actual=${madridHour}, solo disparamos a las 7.`,
    });
  }

  const todayMadrid = startOfDayUtc();
  const tomorrowMadrid = new Date(todayMadrid.getTime() + 24 * 3600 * 1000);

  const patients = await prisma.patient.findMany({
    where: {
      onboardingStatus: "active",
      dailyReminderEnabled: true,
    },
    select: {
      id: true,
      fullName: true,
      pushTokens: { where: { active: true }, select: { id: true, token: true, platform: true } },
    },
  });

  const results: Array<{
    patientId: string;
    inApp: boolean;
    pushSent: number;
    pushFailed: number;
    taskCount?: number;
    reason?: string;
  }> = [];

  for (const p of patients) {
    // Sesiones de hoy con tareas pendientes.
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
      results.push({ patientId: p.id, inApp: false, pushSent: 0, pushFailed: 0, reason: "sin tareas hoy" });
      continue;
    }

    const taskWord = taskCount === 1 ? "tarea" : "tareas";
    const title = "Tu sesión de hoy te espera ☀️";
    const body = `Hoy te toca: ${taskCount} ${taskWord} de tu programa.`;

    // 1) Notificación in-app (campanita) — siempre.
    await prisma.patientNotification.create({
      data: {
        patientId: p.id,
        type: "daily_reminder",
        title,
        body,
      },
    });

    // 2) Push real iOS por cada token activo del paciente.
    let pushSent = 0, pushFailed = 0;
    const tokensToDeactivate: string[] = [];
    for (const t of p.pushTokens) {
      if (t.platform !== "ios") continue; // Android lo añadiremos en otra fase.
      const r = await sendPush({
        token: t.token,
        title,
        body,
        data: { url: `/paciente/${p.id}/sesion-hoy` },
        sound: "default",
      });
      if (r.ok) {
        pushSent++;
        await prisma.patientPushToken.update({ where: { id: t.id }, data: { lastUsedAt: new Date() } });
      } else {
        pushFailed++;
        // Si APNs dice que el token ya no es válido, lo desactivamos.
        if (r.reason === "BadDeviceToken" || r.reason === "Unregistered" || r.status === 410) {
          tokensToDeactivate.push(t.id);
        }
      }
    }
    if (tokensToDeactivate.length > 0) {
      await prisma.patientPushToken.updateMany({
        where: { id: { in: tokensToDeactivate } },
        data: { active: false },
      });
    }

    results.push({ patientId: p.id, inApp: true, pushSent, pushFailed, taskCount });
  }

  return NextResponse.json({
    ok: true,
    processed: patients.length,
    notified: results.filter((r) => r.inApp).length,
    pushSent: results.reduce((a, r) => a + r.pushSent, 0),
    pushFailed: results.reduce((a, r) => a + r.pushFailed, 0),
    results,
  });
}

export const GET = handler;
export const POST = handler;
