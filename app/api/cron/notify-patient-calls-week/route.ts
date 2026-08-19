/**
 * Cron LUNES por la mañana (07:00 hora Madrid) que avisa por campanita a
 * cada fisio de las ScheduledCall que tiene esta semana (lunes 00:00 →
 * lunes siguiente 00:00, ambos UTC-medianoche). El CEO recibe además un
 * resumen del equipo entero.
 *
 * Sirve como recordatorio semanal de las llamadas de optimización (semana
 * 5 del paciente, avisamos en su semana 4) y de renovación (2 semanas
 * antes de que se acabe el ciclo del paciente). El scheduler diario ya
 * crea el ScheduledCall en el momento correcto; este cron solo empuja el
 * aviso a la campanita el primer día de la semana.
 *
 * Se dispara desde Vercel Cron a las 05:00 UTC y 06:00 UTC de los LUNES
 * (vercel.json). El handler filtra por hora Madrid == 7 antes de correr.
 *
 * Idempotencia por semana: guardamos la marca con la refKey
 * "patient_calls_week:{YYYY-MM-DD del lunes}:{professionalId}" — si ya
 * hay una notificación con esa refKey no volvemos a crearla.
 *
 * Auth flexible vía isCronAuthorized (Bearer secret, UA vercel-cron, o
 * ?manual=1 con sesión CEO). ?force=1 salta la guarda de hora Madrid.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyProfessional } from "@/lib/notifications";
import { isCronAuthorized, logCronRun } from "@/lib/cron-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const CRON_PATH = "/api/cron/notify-patient-calls-week";

function getMadridParts(d: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", weekday: "short", hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    y: Number(get("year")),
    m: Number(get("month")) - 1,
    d: Number(get("day")),
    hour: Number(get("hour")),
    weekday: get("weekday"),
  };
}

/** UTC midnight del lunes de la semana en la que estamos ahora en Madrid. */
function mondayMadridUtc(now: Date = new Date()): Date {
  const p = getMadridParts(now);
  const base = new Date(Date.UTC(p.y, p.m, p.d));
  const daysBackToMonday = (base.getUTCDay() + 6) % 7;
  base.setUTCDate(base.getUTCDate() - daysBackToMonday);
  return base;
}

function typeLabel(t: string): string {
  if (t === "optimizacion") return "optimización";
  if (t === "renovacion") return "renovación";
  return t;
}

async function handler(req: NextRequest) {
  const authRes = await isCronAuthorized(req);
  if (!authRes.ok) {
    await logCronRun(CRON_PATH, { ok: false, error: "unauthorized" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Guarda de hora Madrid: solo procesamos los lunes a las 7am. ?force=1
  // (o disparo manual) salta esta comprobación para poder testear.
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1" || authRes.via === "manual";
  const madrid = getMadridParts();
  if (!force && (madrid.weekday !== "Mon" || madrid.hour !== 7)) {
    await logCronRun(CRON_PATH, { ok: true, data: { skipped: true, madrid, authVia: authRes.via } });
    return NextResponse.json({ ok: true, skipped: true, madrid });
  }

  try {
    const monday = mondayMadridUtc();
    const weekKey = monday.toISOString().slice(0, 10);

    const calls = await prisma.scheduledCall.findMany({
      where: {
        completedAt: null,
        patient: { isTest: false },
      },
      include: {
        patient: {
          select: { id: true, fullName: true, assignedProfessionalId: true },
        },
      },
      orderBy: [
        { scheduledAt: { sort: "asc", nulls: "first" } },
        { createdAt: "asc" },
      ],
    });

    const byFisio = new Map<string, typeof calls>();
    for (const c of calls) {
      const key = c.patient.assignedProfessionalId ?? "__unassigned__";
      if (!byFisio.has(key)) byFisio.set(key, []);
      byFisio.get(key)!.push(c);
    }

    const ceos = await prisma.professional.findMany({
      where: { role: "ceo", active: true },
      select: { id: true, fullName: true },
    });

    const perFisioResults: Array<{ professionalId: string; count: number; skipped?: boolean }> = [];

    for (const [professionalId, list] of byFisio.entries()) {
      if (professionalId === "__unassigned__") continue;
      const refKey = `patient_calls_week:${weekKey}:${professionalId}`;
      const existing = await prisma.teamNotification.findFirst({
        where: { refKey },
        select: { id: true },
      });
      if (existing) {
        perFisioResults.push({ professionalId, count: list.length, skipped: true });
        continue;
      }
      const optCount = list.filter((c) => c.type === "optimizacion").length;
      const renCount = list.filter((c) => c.type === "renovacion").length;
      const detail = list
        .map((c) => `${typeLabel(c.type)}: ${c.patient.fullName}`)
        .join(" · ");
      const parts: string[] = [];
      if (optCount) parts.push(`${optCount} de optimización`);
      if (renCount) parts.push(`${renCount} de renovación`);
      const summary = parts.join(" y ");
      await notifyProfessional({
        professionalId,
        type: "patient_calls_week",
        title: `📞 Esta semana: ${list.length} llamada${list.length === 1 ? "" : "s"}`,
        body: `${summary}. ${detail}.`,
        actionUrl: "/fisio/llamadas",
        refKey,
      });
      perFisioResults.push({ professionalId, count: list.length });
    }

    for (const ceo of ceos) {
      const refKey = `patient_calls_week_ceo:${weekKey}:${ceo.id}`;
      const existing = await prisma.teamNotification.findFirst({
        where: { refKey },
        select: { id: true },
      });
      if (existing) continue;
      if (calls.length === 0) continue;
      const optCount = calls.filter((c) => c.type === "optimizacion").length;
      const renCount = calls.filter((c) => c.type === "renovacion").length;
      const parts: string[] = [];
      if (optCount) parts.push(`${optCount} optimización`);
      if (renCount) parts.push(`${renCount} renovación`);
      await notifyProfessional({
        professionalId: ceo.id,
        type: "patient_calls_week_ceo",
        title: `📞 Llamadas del equipo esta semana (${calls.length})`,
        body: `${parts.join(" · ")}. Ver detalle en /fisio/llamadas.`,
        actionUrl: "/fisio/llamadas",
        refKey,
      });
    }

    const data = {
      authVia: authRes.via,
      weekMonday: weekKey,
      totalCalls: calls.length,
      fisios: perFisioResults,
    };
    await logCronRun(CRON_PATH, { ok: true, data });
    return NextResponse.json({ ok: true, ...data });
  } catch (e: any) {
    await logCronRun(CRON_PATH, { ok: false, error: e?.message ?? "unknown" });
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
  }
}

export const GET = handler;
export const POST = handler;
